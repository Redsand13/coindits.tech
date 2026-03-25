import { MASignal, getBinanceCoinMapping, calculateEMAArray, detectCrossover, calculateVolatilityScore, fetchBinanceKlines, BINANCE_TO_COINGECKO, findCoinMetadata, fetchTopCoins } from "./coingecko";
import db from "../db";

const BINANCE_FAPI_BASE = "https://fapi.binance.com/fapi/v1";

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
const BINANCE_CACHE_DURATION = 30000; // 30 seconds

export async function getBinanceFuturesSignals(
  timeframe: string = "1h",
): Promise<MASignal[]> {
  try {
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
    const tickerRes = await fetch(`${BINANCE_FAPI_BASE}/ticker/24hr`, {
      next: { revalidate: 60 },
    });
    if (!tickerRes.ok) throw new Error("Failed to fetch Binance tickers");

    const tickers: BinanceTicker[] = await tickerRes.json();

    // Filter USDT pairs and sort by volume (quoteVolume is volume in USD approx)
    // User Requirement: > 10M 24hr trading volume
    const topPairs = tickers
      .filter(
        (t) =>
          t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) > 10000000,
      )
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 150); // Analyze top 150 pairs with high volume now that Short Reversal is removed

    const signals: MASignal[] = [];

    // Process pairs in parallel batches for speed
    const batchSize = 20; // Process 20 pairs at once
    const results: (MASignal | null)[] = [];

    console.log(`🚀 Analyzing ${topPairs.length} Binance Futures pairs in parallel batches...`);

    for (let i = 0; i < topPairs.length; i += batchSize) {
      const batch = topPairs.slice(i, i + batchSize);

      const batchPromises = batch.map(async (pair) => {
        try {
          // Fetch 500 candles for better EMA convergence
          // Fetch 500 candles for better EMA convergence
          const klineRes = await fetch(
            `${BINANCE_FAPI_BASE}/klines?symbol=${pair.symbol}&interval=${interval}&limit=500`,
          );
          if (!klineRes.ok) return null;

          const klines: BinanceKline[] = await klineRes.json();
          // Parse closes
          const closes = klines.map((k) => parseFloat(k[4]));

          // Need enough data for 99 EMA + convergence
          if (closes.length < 200) return null;

          const prices = closes;
          const currentPrice = prices[prices.length - 1];

          // Calculate EMA Arrays
          const ema7Array = calculateEMAArray(prices, 7);
          const ema99Array = calculateEMAArray(prices, 99);

          if (ema7Array.length < 100 || ema99Array.length < 100) return null;

          // Calculate RSI
          const rsi = calculateRSI(prices, 14);

          // Determine lookback (24h)
          let lookback = 288; // Default 5m
          if (timeframe === "15m") lookback = 96;
          if (timeframe === "30m") lookback = 48;
          if (timeframe === "1h") lookback = 24;
          if (timeframe === "4h") lookback = 6;
          if (timeframe === "1d") lookback = 2;

          // Detect Crossover
          const crossover = detectCrossover(ema7Array, ema99Array, lookback);

          // Skip if no crossover found in window
          if (!crossover.type) return null;

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

          // NO TREND SIGNALS - User requested ONLY fresh crossovers.



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

          // Calculate accurate crossover timestamp
          // Use the actual candle timestamp where the crossover occurred
          const crossoverTimestamp = klines[crossover.index][0];

          const dailyData = await fetchBinanceKlines(pair.symbol, "1d");
          const volMetric = calculateVolatilityScore(dailyData, currentPrice, parseFloat(pair.quoteVolume), parseFloat(pair.priceChangePercent));

          // Metadata lookup
          const rawSymbol = pair.symbol.replace("USDT", "");
          const hardcoded = BINANCE_TO_COINGECKO[pair.symbol];
          const dynamic = findCoinMetadata(rawSymbol);

          const finalName = dynamic?.name || (hardcoded?.id ? hardcoded.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : rawSymbol);
          const finalImage = dynamic?.image || hardcoded?.image || "";

          return {
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
          } as MASignal;
        } catch (err) {
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < topPairs.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const validSignals = results.filter((s): s is MASignal => s !== null && s.score >= 60);

    // Sort
    // Sort by Time (Newest First) as requested
    validSignals.sort((a, b) => b.crossoverTimestamp - a.crossoverTimestamp);

    console.log(`✅ Found ${validSignals.length} Binance Futures signals (${validSignals.filter(s => s.signalType === 'BUY').length} BUY, ${validSignals.filter(s => s.signalType === 'SELL').length} SELL)`);

    // 💾 Persist to signal_history table
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO signal_history (
          id, coin_id, symbol, name, image, signal_type, signal_name, timeframe, 
          score, price, crossover_timestamp, first_seen, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((signals: MASignal[]) => {
        for (const s of signals) {
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
            s.score, s.price, s.crossoverTimestamp, Date.now(), metadata
          );
        }
      });

      insertMany(validSignals);
      console.log(`💾 Persisted ${validSignals.length} signals to history DB`);
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
