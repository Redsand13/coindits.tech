import { MASignal, getBinanceCoinMapping, calculateEMAArray, detectCrossover, calculateVolatilityScore, fetchBinanceKlines, BINANCE_TO_COINGECKO, findCoinMetadata, fetchTopCoins } from "./coingecko";
import db from "../db";

const BINANCE_FAPI_BASE = "https://fapi.binance.com/fapi/v1";

// ── IP ban tracking ───────────────────────────────────────────────────────────
// Binance returns 418 with a ban-until timestamp when an IP is blocked.
// We store it here so every subsequent call short-circuits without hitting the wire.
let _ipBanUntil = 0;

export function getBinanceBanStatus(): { banned: boolean; banUntil: number | null } {
  if (_ipBanUntil > Date.now()) return { banned: true, banUntil: _ipBanUntil };
  return { banned: false, banUntil: null };
}

/** fetch with a timeout so slow/hung connections don't block forever */
async function fetchWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** fetch with retry on 429 — detects IP bans (418) and blocks further requests */
async function fetchWithRetry(url: string, options: RequestInit & { timeoutMs?: number } = {}, retries = 2): Promise<Response> {
  // If already IP-banned, fail immediately without touching the network
  if (_ipBanUntil > Date.now()) {
    const banDate = new Date(_ipBanUntil).toUTCString();
    throw new Error(`Binance IP ban active until ${banDate}. Skipping request.`);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchWithTimeout(url, options);
    if (res.ok) return res;

    const body = await res.text().catch(() => "");

    // 418 = IP banned — parse and store the expiry, stop retrying immediately
    if (res.status === 418) {
      try {
        const json = JSON.parse(body);
        if (typeof json.msg === "string") {
          const match = json.msg.match(/banned until (\d+)/);
          if (match) _ipBanUntil = parseInt(match[1], 10);
        }
      } catch { /* ignore parse errors */ }
      const banDate = _ipBanUntil ? new Date(_ipBanUntil).toUTCString() : "unknown";
      throw new Error(`Binance IP banned until ${banDate}. Too many REST requests — switch to WebSocket.`);
    }

    // 429 = rate limited — back off and retry
    if (res.status === 429 && attempt < retries) {
      const wait = Math.pow(2, attempt) * 2000; // 2s, 4s
      console.warn(`⚠️ Binance rate limited (429), retrying in ${wait}ms…`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`Binance API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  throw new Error("fetchWithRetry exhausted retries");
}

// Scans the full EMA arrays and returns EVERY crossover point (not just the most recent)
function detectAllCrossoversInData(
  ema7Array: number[],
  ema99Array: number[],
): Array<{ type: "BUY" | "SELL"; index: number; ema7At: number; ema99At: number }> {
  const result: Array<{ type: "BUY" | "SELL"; index: number; ema7At: number; ema99At: number }> = [];
  const len = Math.min(ema7Array.length, ema99Array.length);
  for (let i = 100; i < len; i++) {
    const p7 = ema7Array[i - 1], p99 = ema99Array[i - 1];
    const c7 = ema7Array[i],    c99 = ema99Array[i];
    if (!p7 || !p99 || !c7 || !c99) continue;
    if (p7 <= p99 && c7 > c99) result.push({ type: "BUY",  index: i, ema7At: c7, ema99At: c99 });
    else if (p7 >= p99 && c7 < c99) result.push({ type: "SELL", index: i, ema7At: c7, ema99At: c99 });
  }
  return result;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

// [timestamp, open, high, low, close, volume, ...]
type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

/**
 * Calculate Exponential Moving Average (EMA)
 * Copied from coingecko.ts to avoid circular deps or refactoring
 */


/**
 * Calculate volatility based on price changes
 */
function calculateVolatility(prices: number[]): number {
  if (!prices || prices.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * 100;
}

// Relative Strength Index (RSI) calculation
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 0;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth subsequent values
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Cache for Binance signals
let binanceSignalsCache: {
  data: MASignal[];
  timestamp: number;
  timeframe: string;
} | null = null;
const BINANCE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getBinanceFuturesSignals(
  timeframe: string = "1h",
): Promise<MASignal[]> {
  try {
    // Short-circuit immediately if IP is banned — no network requests
    if (_ipBanUntil > Date.now()) {
      console.warn(`🚫 Binance IP ban active — skipping all requests until ${new Date(_ipBanUntil).toUTCString()}`);
      return [];
    }

    // Check cache
    const now = Date.now();
    if (
      binanceSignalsCache &&
      binanceSignalsCache.timeframe === timeframe &&
      (now - binanceSignalsCache.timestamp < BINANCE_CACHE_DURATION)
    ) {
      console.log(`⚡ Using cached Binance Futures signals for ${timeframe}`);
      return binanceSignalsCache.data;
    }

    // Ensure CoinGecko metadata cache is populated (for names/images)
    try {
      await fetchTopCoins();
    } catch (e) {
      console.warn("⚠️ Failed to fetch CoinGecko metadata for Binance enrichment:", e);
    }

    // Map timeframe to Binance interval
    const intervalMap: { [key: string]: string } = {
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
    };
    const interval = intervalMap[timeframe] || "1h";

    // 1. Fetch 24h ticker to get volume and list of pairs
    const tickerRes = await fetchWithRetry(`${BINANCE_FAPI_BASE}/ticker/24hr`, {
      next: { revalidate: 60 },
      timeoutMs: 15000,
    } as RequestInit);

    const tickers: BinanceTicker[] = await tickerRes.json();

    // Filter USDT pairs and sort by volume (quoteVolume is volume in USD approx)
    // User Requirement: > 10M 24hr trading volume
    const topPairs = tickers
      .filter(
        (t) =>
          t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) > 50000000,
      )
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 50); // Top 50 high-volume pairs — well within rate limits

    const signals: MASignal[] = [];

    // Small batches with delays to stay under Binance rate limits
    const batchSize = 8;
    type BatchResult = { signal: MASignal | null; historical: Array<{ coinId: string; symbol: string; name: string; image: string; signalType: "BUY" | "SELL"; signalName: string; price: number; crossoverTimestamp: number; change24h: number; volume24h: number }> };
    const results: BatchResult[] = [];

    console.log(`🚀 Analyzing ${topPairs.length} Binance Futures pairs in parallel batches...`);

    for (let i = 0; i < topPairs.length; i += batchSize) {
      const batch = topPairs.slice(i, i + batchSize);

      const batchPromises = batch.map(async (pair): Promise<BatchResult> => {
        const empty: BatchResult = { signal: null, historical: [] };
        try {
          // Fetch 1500 candles for full historical coverage (~15 days on 15m)
          const klineRes = await fetchWithTimeout(
            `${BINANCE_FAPI_BASE}/klines?symbol=${pair.symbol}&interval=${interval}&limit=1500`,
            { timeoutMs: 10000 } as RequestInit,
          );
          if (!klineRes.ok) return empty;

          const klines: BinanceKline[] = await klineRes.json();
          // Parse closes
          const closes = klines.map((k) => parseFloat(k[4]));

          // Need enough data for 99 EMA + convergence
          if (closes.length < 200) return empty;

          const prices = closes;
          const currentPrice = prices[prices.length - 1];

          // Calculate EMA Arrays
          const ema7Array = calculateEMAArray(prices, 7);
          const ema99Array = calculateEMAArray(prices, 99);

          if (ema7Array.length < 100 || ema99Array.length < 100) return empty;

          // Metadata lookup (needed for both live signal and historical entries)
          const rawSymbol = pair.symbol.replace("USDT", "");
          const hardcoded = BINANCE_TO_COINGECKO[pair.symbol];
          const dynamic = findCoinMetadata(rawSymbol);
          const finalName = dynamic?.name || (hardcoded?.id ? hardcoded.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : rawSymbol);
          const finalImage = dynamic?.image || hardcoded?.image || "";

          // ── Collect ALL historical crossovers across full kline window ──
          const allCrossovers = detectAllCrossoversInData(ema7Array, ema99Array);
          const historical = allCrossovers.map(c => {
            const histSignalName = c.type === "BUY" ? "Golden Cross (Historical)" : "Death Cross (Historical)";
            return {
              coinId: pair.symbol,
              symbol: rawSymbol,
              name: finalName,
              image: finalImage,
              signalType: c.type as "BUY" | "SELL",
              signalName: histSignalName,
              price: c.ema7At, // price-at-crossover approximated by EMA7
              crossoverTimestamp: klines[c.index][0] as number,
              change24h: parseFloat(pair.priceChangePercent),
              volume24h: parseFloat(pair.quoteVolume),
            };
          });

          // Calculate RSI
          const rsi = calculateRSI(prices, 14);

          // Determine lookback (24h)
          let lookback = 288; // Default 5m
          if (timeframe === "15m") lookback = 96;
          if (timeframe === "30m") lookback = 48;
          if (timeframe === "1h") lookback = 24;
          if (timeframe === "4h") lookback = 6;
          if (timeframe === "1d") lookback = 2;

          // Detect Crossover (most recent, within lookback window)
          const crossover = detectCrossover(ema7Array, ema99Array, lookback);

          // Skip live signal if no recent crossover
          if (!crossover.type) return { signal: null, historical };

          const signalType: "BUY" | "SELL" = crossover.type;

          // Construct Signal Name
          let signalName = "";
          if (signalType === "BUY") {
            signalName = crossover.candlesAgo === 0
              ? "Golden Cross (Fresh)"
              : `Golden Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`;
          } else {
            signalName = crossover.candlesAgo === 0
              ? "Death Cross (Fresh)"
              : `Death Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`;
          }

          // Crossover Strength
          const ema7 = crossover.ema7At;
          const ema99 = crossover.ema99At;
          const ema7Prev = crossover.ema7Prev;
          const ema99Prev = crossover.ema99Prev;

          let crossoverStrength = 0;
          if (signalType === "BUY") {
            crossoverStrength = ((ema7 - ema99) / ema99) * 100;
          } else {
            crossoverStrength = ((ema99 - ema7) / ema99) * 100;
          }

          const volatility = calculateVolatility(prices);
          // Calculate entry, stop loss, and take profit based on signal type
          let entryPrice = currentPrice;
          let stopLoss = 0;
          let takeProfit = 0;
          let score = 0;
          const change24h = parseFloat(pair.priceChangePercent);

          // Base Score
          score = 50;

          if (signalType === "BUY") {
            stopLoss = currentPrice * 0.95;
            takeProfit = currentPrice * 1.1;

            if (signalName.includes("Golden Cross"))
              score += 30; // Fresh cross is high value
            else score += 10; // Trend is lower value

            if (rsi > 50 && rsi < 70) score += 10; // Healthy momentum

            score += crossoverStrength * 5;
            score += change24h;
          } else if (signalType === "SELL") {
            stopLoss = currentPrice * 1.05;
            takeProfit = currentPrice * 0.9;

            if (signalName.includes("Death Cross")) score += 30;
            else score += 10;

            if (rsi < 50 && rsi > 30) score += 10;

            score += crossoverStrength * 5;
            score -= change24h;
          }

          // Cap score
          score = Math.min(Math.max(Math.round(score), 0), 100);

          // Calculate 1h change
          let change1h = 0;
          if (timeframe === "5m" && prices.length > 12) {
            const oldPrice = prices[prices.length - 13];
            change1h = ((currentPrice - oldPrice) / oldPrice) * 100;
          } else if (timeframe === "15m" && prices.length > 4) {
            const oldPrice = prices[prices.length - 5];
            change1h = ((currentPrice - oldPrice) / oldPrice) * 100;
          } else if (timeframe === "30m" && prices.length > 2) {
            const oldPrice = prices[prices.length - 3];
            change1h = ((currentPrice - oldPrice) / oldPrice) * 100;
          } else if (timeframe === "1h" && prices.length > 1) {
            const oldPrice = prices[prices.length - 2];
            change1h = ((currentPrice - oldPrice) / oldPrice) * 100;
          }

          // Use the actual candle timestamp where the crossover occurred
          const crossoverTimestamp = klines[crossover.index][0] as number;

          const dailyData = await fetchBinanceKlines(pair.symbol, "1d");
          const volMetric = calculateVolatilityScore(dailyData, currentPrice, parseFloat(pair.quoteVolume), parseFloat(pair.priceChangePercent));

          return {
            signal: {
              coinId: pair.symbol,
              symbol: rawSymbol,
              name: finalName,
              image: finalImage,
              signalType,
              signalName,
              timeframe,
              score,
              price: currentPrice,
              currentPrice: currentPrice,
              change1h: change1h,
              change24h: parseFloat(pair.priceChangePercent),
              change7d: 0,
              volume24h: parseFloat(pair.quoteVolume),
              marketCap: 0,
              timestamp: Date.now(),
              crossoverTimestamp,
              candlesAgo: crossover.candlesAgo,
              entryPrice,
              stopLoss,
              takeProfit,
              volatility: volMetric.score,
              volatilityTooltip: volMetric.tooltip,
              formula: `EMA7/99 | RSI: ${Math.round(rsi)}`,
              ema7,
              ema99,
              ema7Prev,
              ema99Prev,
              crossoverStrength,
            } as MASignal,
            historical,
          };
        } catch (err) {
          return empty;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Pace batches: 50 pairs / 8 per batch = ~7 batches × 350ms ≈ 2.5s total
      if (i + batchSize < topPairs.length) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    const validSignals = results
      .map(r => r.signal)
      .filter((s): s is MASignal => s !== null && s.score >= 60);

    // Sort by Time (Newest First) as requested
    validSignals.sort((a, b) => b.crossoverTimestamp - a.crossoverTimestamp);

    console.log(`✅ Found ${validSignals.length} Binance Futures signals (${validSignals.filter(s => s.signalType === 'BUY').length} BUY, ${validSignals.filter(s => s.signalType === 'SELL').length} SELL)`);

    // 💾 Persist live signals + all historical crossovers to signal_history
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO signal_history (
          id, coin_id, symbol, name, image, signal_type, signal_name, timeframe,
          score, price, crossover_timestamp, first_seen, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();

      const insertAll = db.transaction(() => {
        // Insert live signals (with full metadata)
        for (const s of validSignals) {
          const uniqueId = `${s.coinId}-${s.signalType}-${s.crossoverTimestamp}`;
          const metadata = JSON.stringify({
            volatility: s.volatility,
            volatilityTooltip: s.volatilityTooltip,
            formula: s.formula,
            ema7: s.ema7,
            ema99: s.ema99,
            ema7Prev: s.ema7Prev,
            ema99Prev: s.ema99Prev,
            crossoverStrength: s.crossoverStrength,
            change24h: s.change24h,
            volume24h: s.volume24h
          });
          stmt.run(
            uniqueId, s.coinId, s.symbol, s.name, s.image,
            s.signalType, s.signalName, timeframe,
            s.score, s.price, s.crossoverTimestamp, now, metadata
          );
        }

        // Insert all historical crossovers found across the full kline window
        const allHistorical = results.flatMap(r => r.historical);
        let histInserted = 0;
        for (const h of allHistorical) {
          const uniqueId = `${h.coinId}-${h.signalType}-${h.crossoverTimestamp}`;
          const metadata = JSON.stringify({
            change24h: h.change24h,
            volume24h: h.volume24h,
          });
          stmt.run(
            uniqueId, h.coinId, h.symbol, h.name, h.image,
            h.signalType, h.signalName, timeframe,
            60, // default score for historical entries (meets minimum threshold)
            h.price, h.crossoverTimestamp, now, metadata
          );
          histInserted++;
        }
        console.log(`💾 Persisted ${validSignals.length} live + ${histInserted} historical signals to history DB`);
      });

      insertAll();
    } catch (err) {
      console.error("❌ Failed to persist signals to history DB:", err);
    }

    // Cache results
    binanceSignalsCache = {
      data: validSignals,
      timestamp: Date.now(),
      timeframe,
    };

    return validSignals;
  } catch (error) {
    console.error("Error fetching Binance Futures signals:", error);
    return [];
  }
}
