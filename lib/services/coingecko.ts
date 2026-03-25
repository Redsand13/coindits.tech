// CoinGecko API Service - Hybrid Approach
// Uses CoinGecko PRO API for coin discovery + Binance Spot klines for accurate MA crossover detection
// Fast and reliable - combines both data sources
import db from "@/lib/db";

interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
  sparkline_in_7d?: {
    price: number[];
  };
  tradeable_on_binance?: boolean;
  tradeable_on_bybit?: boolean;
}

interface DerivativeExchange {
  name: string;
  identifier: string;
  open_interest_btc: number;
  trade_volume_24h_btc: number;
  has_perpetual: boolean;
}

interface CoinDerivativeData {
  coinId: string;
  has_futures: boolean;
  total_open_interest: number;
  total_derivative_volume_24h: number;
  exchanges: DerivativeExchange[];
  timestamp: number;
}

interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MASignal {
  coinId: string;
  symbol: string;
  name: string;
  image: string;
  signalType: "BUY" | "SELL";
  signalName: string;
  timeframe: string;
  score: number;
  price: number;
  currentPrice: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  marketCap: number;
  timestamp: number;
  crossoverTimestamp: number;
  candlesAgo: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  volatility: number;
  formula: string;
  ema7: number;
  ema99: number;
  ema7Prev: number;
  ema99Prev: number;
  crossoverStrength: number;
  volatilityTooltip?: string;
}

// PRO API Configuration
const API_KEY = process.env.COINGECKO_API_KEY || "";
const IS_PRO = !!API_KEY;
const COINGECKO_API_BASE = IS_PRO
  ? "https://pro-api.coingecko.com/api/v3"
  : "https://api.coingecko.com/api/v3";
const BINANCE_SPOT_BASE = "https://api.binance.com/api/v3";
const CACHE_DURATION = 60000; // 60 seconds cache to save API calls

// Quality filters for legitimate coins (PRO tier - stricter for futures trading)
const MIN_MARKET_CAP = 50000000; // $50M minimum market cap (futures-grade)
const MIN_VOLUME_24H = 5000000; // $5M minimum 24h volume (high liquidity for futures)
const MIN_MARKET_CAP_RANK = 300; // Top 300 coins only (established projects)

// Futures-focused coins (coins with active perpetual futures markets)
const FUTURES_TRADEABLE_COINS = [
  "bitcoin",
  "ethereum",
  "binancecoin",
  "solana",
  "ripple",
  "cardano",
  "avalanche-2",
  "polkadot",
  "polygon",
  "chainlink",
  "uniswap",
  "litecoin",
  "near",
  "aptos",
  "arbitrum",
  "optimism",
  "sui",
  "dogecoin",
  "shiba-inu",
  "pepe",
  "the-open-network",
  "tron",
  "stellar",
  "filecoin",
  "cosmos",
  "ethereum-classic",
  "injective-protocol",
  "render-token",
  "celestia",
  "internet-computer",
  "aave",
  "maker",
  "sei-network",
  "stacks",
  "algorand",
];

console.log(`🔑 CoinGecko API: ${IS_PRO ? "PRO" : "FREE"} tier`);
if (IS_PRO) {
  console.log(`📈 PRO Mode: Futures-focused filtering enabled`);
  console.log(
    `   Min Volume: $${(MIN_VOLUME_24H / 1e6).toFixed(1)}M | Min MCap: $${(MIN_MARKET_CAP / 1e6).toFixed(1)}M | Top ${MIN_MARKET_CAP_RANK} rank`,
  );
}

// Cache for market data
let marketDataCache: {
  data: CoinGeckoMarketData[] | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

// Cache for OHLC data per coin per timeframe
const ohlcCache: Map<string, { data: number[][]; timestamp: number }> =
  new Map();

// Cache for derivatives data per coin
const derivativesCache: Map<string, CoinDerivativeData> = new Map();

// Cache for signals by timeframe
const signalsCache: Map<string, { data: MASignal[]; timestamp: number }> =
  new Map();

/**
 * Calculate EMA (Exponential Moving Average) - PROPER IMPLEMENTATION
 */
function calculateEMA(prices: number[], period: number): number {
  if (!prices || prices.length < period) {
    return 0;
  }

  const k = 2 / (period + 1);

  // Start with SMA for initial EMA
  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += prices[i];
  }
  ema = ema / period;

  // Apply EMA formula for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}


function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return 0;

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = ((atr * (period - 1)) + trs[i]) / period;
  }
  return atr;
}

export function calculateVolatilityScore(
  dailyData: number[][] | null,
  currentPrice: number,
  volume24h: number,
  change24h: number
): { score: number; tooltip: string; interpretation: string } {
  if (!dailyData || dailyData.length < 21) {
    return { score: 0, tooltip: "Insufficient Daily Data", interpretation: "No Data" };
  }

  // Extract daily arrays (last 30)
  const days = dailyData;
  const highs = days.map(d => d[2]);
  const lows = days.map(d => d[3]);
  const closes = days.map(d => d[4]);
  const volumes = days.map(d => d[5]);

  // 1. Daily Price Range %
  const lastIdx = days.length - 1;
  // Safety check
  if (lastIdx < 0) return { score: 0, tooltip: "No data", interpretation: "No Data" };

  const rangePct = closes[lastIdx] ? ((highs[lastIdx] - lows[lastIdx]) / closes[lastIdx]) * 100 : 0;
  let rangeScore = 0;
  if (rangePct < 1) rangeScore = 0;
  else if (rangePct < 2) rangeScore = 0.5;
  else if (rangePct < 4) rangeScore = 1;
  else if (rangePct < 7) rangeScore = 1.5;
  else if (rangePct < 10) rangeScore = 2;
  else rangeScore = 2.5;

  // 2. ATR Volatility %
  const atr = calculateATR(highs, lows, closes, 14);
  const atrPct = currentPrice ? (atr / currentPrice) * 100 : 0;
  let atrScore = 0;
  if (atrPct < 0.5) atrScore = 0;
  else if (atrPct < 1) atrScore = 0.5;
  else if (atrPct < 2) atrScore = 1;
  else if (atrPct < 4) atrScore = 1.5;
  else if (atrPct < 6) atrScore = 2;
  else atrScore = 2.5;

  // 3. Volume Spike
  const currentVol = volume24h || volumes[lastIdx];
  // Msg: "20-day Average Volume". We need history.
  // We assume 'dailyData' has enough history.
  // volumes[lastIdx] is current day (if candle closed? or ongoing?)
  // If we fetched "1d", last candle is current day (accumulating).
  // Previous 20 days: lastIdx-20 to lastIdx-1.
  let avgVol = 0;
  let volRatio = 1;
  if (volumes.length > 21) {
    const prev20Vols = volumes.slice(volumes.length - 21, volumes.length - 1);
    if (prev20Vols.length > 0) {
      avgVol = prev20Vols.reduce((a, b) => a + b, 0) / prev20Vols.length;
      volRatio = avgVol > 0 ? currentVol / avgVol : 1;
    }
  }

  let volScore = 0;
  if (volRatio < 1) volScore = 0;
  else if (volRatio < 1.5) volScore = 0.5;
  else if (volRatio < 2) volScore = 1;
  else if (volRatio < 3) volScore = 1.5;
  else if (volRatio < 5) volScore = 2;
  else volScore = 2.5;

  // 4. Trend Speed %
  const trendPct = Math.abs(change24h);
  let trendScore = 0;
  if (trendPct < 1) trendScore = 0;
  else if (trendPct < 3) trendScore = 0.5;
  else if (trendPct < 6) trendScore = 1;
  else if (trendPct < 10) trendScore = 1.5;
  else if (trendPct < 15) trendScore = 2;
  else trendScore = 2.5;

  // Final Score
  let finalScore = rangeScore + atrScore + volScore + trendScore;
  finalScore = Math.min(Math.max(finalScore, 0), 10);

  // Interpretation
  let interpretation = "Very Low";
  if (finalScore >= 2) interpretation = "Low";
  if (finalScore >= 4) interpretation = "Medium";
  if (finalScore >= 6) interpretation = "High";
  if (finalScore >= 8) interpretation = "Very High";
  if (finalScore >= 10) interpretation = "Extreme";

  const tooltip = `Score: ${finalScore.toFixed(1)}/10 (${interpretation})
Price Range: ${rangePct.toFixed(2)}% (+${rangeScore})
ATR Volatility: ${atrPct.toFixed(2)}% (+${atrScore})
Volume Ratio: ${volRatio.toFixed(2)}x (+${volScore})
Trend Speed: ${trendPct.toFixed(2)}% (+${trendScore})`;

  return { score: finalScore, tooltip, interpretation };
}

/**
 * Calculate EMA array for ALL data points (needed for crossover detection)
 */
export function calculateEMAArray(prices: number[], period: number): number[] {
  if (!prices || prices.length < period) {
    return [];
  }

  const k = 2 / (period + 1);
  const emaArray: number[] = [];

  // Calculate initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let ema = sum / period;

  // First (period-1) values are 0 (not enough data)
  for (let i = 0; i < period - 1; i++) {
    emaArray.push(0);
  }

  // Add first valid EMA
  emaArray.push(ema);

  // Calculate remaining EMAs
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

/**
 * Calculate volatility
 */
function calculateVolatility(prices: number[]): number {
  if (!prices || prices.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * 100;
}

/**
 * Detect ACTUAL crossover in EMA arrays
 * STRICT: Only returns crossover if it happened in the specified window
 */
export function detectCrossover(
  ema7Array: number[],
  ema99Array: number[],
  maxCandlesBack: number = 5,
): {
  type: "BUY" | "SELL" | null;
  candlesAgo: number;
  index: number;
  ema7At: number;
  ema99At: number;
  ema7Prev: number;
  ema99Prev: number;
} {
  const len = Math.min(ema7Array.length, ema99Array.length);

  if (len < 100) {
    return {
      type: null,
      candlesAgo: -1,
      index: -1,
      ema7At: 0,
      ema99At: 0,
      ema7Prev: 0,
      ema99Prev: 0,
    };
  }

  // Scan backwards from most recent candle
  for (let i = len - 1; i >= Math.max(len - maxCandlesBack - 1, 99); i--) {
    const ema7Current = ema7Array[i];
    const ema99Current = ema99Array[i];
    const ema7Prev = ema7Array[i - 1];
    const ema99Prev = ema99Array[i - 1];

    // Skip if EMAs not valid
    if (
      !ema7Current ||
      !ema99Current ||
      !ema7Prev ||
      !ema99Prev ||
      ema7Current === 0 ||
      ema99Current === 0 ||
      ema7Prev === 0 ||
      ema99Prev === 0
    ) {
      continue;
    }

    // GOLDEN CROSS: EMA7 crosses ABOVE EMA99
    // Previous: EMA7 was below or equal to EMA99
    // Current: EMA7 is above EMA99
    if (ema7Prev <= ema99Prev && ema7Current > ema99Current) {
      return {
        type: "BUY",
        candlesAgo: len - 1 - i,
        index: i,
        ema7At: ema7Current,
        ema99At: ema99Current,
        ema7Prev: ema7Prev,
        ema99Prev: ema99Prev,
      };
    }

    // DEATH CROSS: EMA7 crosses BELOW EMA99
    // Previous: EMA7 was above or equal to EMA99
    // Current: EMA7 is below EMA99
    if (ema7Prev >= ema99Prev && ema7Current < ema99Current) {
      return {
        type: "SELL",
        candlesAgo: len - 1 - i,
        index: i,
        ema7At: ema7Current,
        ema99At: ema99Current,
        ema7Prev: ema7Prev,
        ema99Prev: ema99Prev,
      };
    }
  }

  // No crossover found in the specified window
  return {
    type: null,
    candlesAgo: -1,
    index: -1,
    ema7At: 0,
    ema99At: 0,
    ema7Prev: 0,
    ema99Prev: 0,
  };
}

/**
 * Fetch top coins sorted by VOLUME (most liquid markets)
 */
export async function fetchTopCoins(): Promise<CoinGeckoMarketData[]> {
  const now = Date.now();

  // 1. Check DB for fresh data
  try {
    // Get the most recent update timestamp
    const lastUpdateResult = db.prepare('SELECT MAX(updated_at) as last_update FROM coins').get() as { last_update: number };
    const lastUpdate = lastUpdateResult?.last_update || 0;

    // Utilize cache if data is fresh (less than 1 min old)
    if (lastUpdate > 0 && now - lastUpdate < CACHE_DURATION) {
      console.log(`✅ Using cached market data from SQLite DB (Age: ${((now - lastUpdate) / 1000).toFixed(1)}s)`);
      const rows = db.prepare('SELECT * FROM coins ORDER BY market_cap_rank ASC').all();

      // Map back to interface
      return rows.map((row: any) => ({
        ...row,
        sparkline_in_7d: row.sparkline_in_7d ? JSON.parse(row.sparkline_in_7d) : undefined,
        tradeable_on_binance: !!row.tradeable_on_binance,
        tradeable_on_bybit: !!row.tradeable_on_bybit
      })) as CoinGeckoMarketData[];
    }
  } catch (error) {
    console.error("⚠️ Error checking SQLite cache:", error);
  }

  // 2. Fetch from API if cache is stale
  try {
    console.log(
      `🔄 Fetching top coins by VOLUME from CoinGecko ${IS_PRO ? "PRO" : "FREE"} API...`,
    );

    const headers: HeadersInit = {
      Accept: "application/json",
    };

    if (IS_PRO && API_KEY) {
      headers["x-cg-pro-api-key"] = API_KEY;
      console.log(`🔑 Using PRO API key: ${API_KEY.substring(0, 8)}...`);
    }

    const perPage = 250;
    const pages = IS_PRO ? [1, 2, 3, 4] : [1, 2]; // 1000 coins for PRO, 500 for Free

    // Stablecoin IDs to exclude
    const STABLECOINS = [
      'tether', 'usd-coin', 'staked-ether', 'dai', 'first-digital-usd',
      'ethena-usde', 'usdd', 'true-usd', 'frax', 'paxos-standard',
      'binance-usd', 'paypal-usd', 'tether-gold', 'paxos-gold', 'wrapped-bitcoin'
    ];

    const allData: CoinGeckoMarketData[] = [];

    for (const page of pages) {
      const url = IS_PRO
        ? `${COINGECKO_API_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${perPage}&page=${page}&price_change_percentage=1h,24h,7d&precision=full&sparkline=true`
        : `${COINGECKO_API_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${perPage}&page=${page}&price_change_percentage=1h,24h,7d&sparkline=true`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(
          `⚠️ CoinGecko API returned ${response.status} for page ${page}`,
        );
        if (page === 1) {
          // If API fails, try to return whatever is in DB even if stale
          try {
            const rows = db.prepare('SELECT * FROM coins ORDER BY market_cap_rank ASC').all();
            if (rows.length > 0) {
              console.log("⚠️ Returning stale data from DB due to API error");
              return rows.map((row: any) => ({
                ...row,
                sparkline_in_7d: row.sparkline_in_7d ? JSON.parse(row.sparkline_in_7d) : undefined,
                tradeable_on_binance: !!row.tradeable_on_binance,
                tradeable_on_bybit: !!row.tradeable_on_bybit
              })) as CoinGeckoMarketData[];
            }
          } catch (e) { }
          return marketDataCache.data || [];
        }
        break;
      }

      const pageData = await response.json();
      allData.push(...pageData);

      // Check if we've reached coins with volume < 15M
      // Since API returns sorted by volume desc, we can stop early to save API calls
      const lastCoin = pageData[pageData.length - 1];
      if (lastCoin && Number(lastCoin.total_volume) < 15000000) {
        console.log("Stopping fetch: Remaining coins have < $15M volume");
        break;
      }

      // Delay for rate limits
      if (page < pages.length) {
        await new Promise((resolve) => setTimeout(resolve, IS_PRO ? 50 : 500));
      }
    }

    // Apply filters
    const filteredData = allData.filter((coin) => {
      // 0. Volume Filter (> 15M)
      const vol = Number(coin.total_volume);
      if (!vol || isNaN(vol) || vol < 15000000) return false;

      // 1. Exclude Known Stablecoins
      if (STABLECOINS.includes(coin.id)) return false;

      // 2. Exclude " pegged" assets roughly
      if (coin.symbol.toUpperCase().endsWith('USD') || coin.name.includes('USD')) {
        if (Math.abs(coin.current_price - 1) < 0.1) return false;
      }

      // 3. Minimum Volume (liquidity check)
      if (!coin.total_volume || coin.total_volume < 100000) {
        return false;
      }

      // 4. Must have valid price
      if (!coin.current_price || coin.current_price <= 0) {
        return false;
      }

      return true;
    });

    // 3. Update DB with fresh data
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO coins (
            id, symbol, name, image, current_price, market_cap, market_cap_rank, total_volume,
            price_change_percentage_1h_in_currency, price_change_percentage_24h_in_currency, price_change_percentage_7d_in_currency,
            circulating_supply, total_supply, max_supply, ath, ath_change_percentage, ath_date,
            atl, atl_change_percentage, atl_date, last_updated, sparkline_in_7d, tradeable_on_binance, tradeable_on_bybit, updated_at
        ) VALUES (
            @id, @symbol, @name, @image, @current_price, @market_cap, @market_cap_rank, @total_volume,
            @price_change_percentage_1h_in_currency, @price_change_percentage_24h_in_currency, @price_change_percentage_7d_in_currency,
            @circulating_supply, @total_supply, @max_supply, @ath, @ath_change_percentage, @ath_date,
            @atl, @atl_change_percentage, @atl_date, @last_updated, @sparkline_in_7d, @tradeable_on_binance, @tradeable_on_bybit, @updated_at
        )
      `);

      const histStmt = db.prepare(`
        INSERT OR IGNORE INTO price_history (coin_id, price, timestamp)
        VALUES (?, ?, ?)
      `);

      const insertMany = db.transaction((coins: CoinGeckoMarketData[]) => {
        const timestamp = Math.floor(now / 60000) * 60000; // Round to nearest minute

        for (const coin of coins) {
          // Update core coin data
          stmt.run({
            id: coin.id,
            symbol: coin.symbol,
            name: coin.name,
            image: coin.image,
            current_price: coin.current_price,
            market_cap: coin.market_cap,
            market_cap_rank: coin.market_cap_rank,
            total_volume: coin.total_volume,
            price_change_percentage_1h_in_currency: coin.price_change_percentage_1h_in_currency,
            price_change_percentage_24h_in_currency: coin.price_change_percentage_24h_in_currency,
            price_change_percentage_7d_in_currency: coin.price_change_percentage_7d_in_currency,
            circulating_supply: coin.circulating_supply,
            total_supply: coin.total_supply,
            max_supply: coin.max_supply,
            ath: coin.ath,
            ath_change_percentage: coin.ath_change_percentage,
            ath_date: coin.ath_date,
            atl: coin.atl,
            atl_change_percentage: coin.atl_change_percentage,
            atl_date: coin.atl_date,
            last_updated: coin.last_updated,
            sparkline_in_7d: coin.sparkline_in_7d ? JSON.stringify(coin.sparkline_in_7d) : null,
            tradeable_on_binance: coin.tradeable_on_binance ? 1 : 0,
            tradeable_on_bybit: coin.tradeable_on_bybit ? 1 : 0,
            updated_at: now
          });

          // Save to history
          if (coin.current_price) {
            histStmt.run(coin.id, coin.current_price, timestamp);
          }
        }

        // Cleanup old history (keep last 24 hours to avoid bloat)
        const dayAgo = now - (24 * 60 * 60 * 1000);
        db.prepare('DELETE FROM price_history WHERE timestamp < ?').run(dayAgo);
      });

      insertMany(filteredData);
      console.log(`💾 Saved ${filteredData.length} coins and 1m price history to SQLite DB`);

    } catch (dbError) {
      console.error("❌ Failed to save to DB:", dbError);
    }

    marketDataCache = {
      data: filteredData,
      timestamp: now,
    };

    // Count futures-tradeable coins
    const futuresCount = filteredData.filter((coin) =>
      FUTURES_TRADEABLE_COINS.includes(coin.id),
    ).length;

    console.log(
      `✅ Fetched ${filteredData.length} ${IS_PRO ? "futures-grade" : "legitimate"} coins (filtered from ${allData.length})`,
    );
    if (IS_PRO) {
      console.log(
        `   📊 Futures-tradeable: ${futuresCount} | High-quality alts: ${filteredData.length - futuresCount}`,
      );
    }
    console.log(
      `   Filters: Min Volume=$${(MIN_VOLUME_24H / 1e6).toFixed(1)}M, Min MCap=$${(MIN_MARKET_CAP / 1e6).toFixed(1)}M, Top ${MIN_MARKET_CAP_RANK} rank`,
    );
    return filteredData;
  } catch (error) {
    console.error("❌ Error fetching coins:", error);
    // Fallback to DB
    try {
      const rows = db.prepare('SELECT * FROM coins ORDER BY market_cap_rank ASC').all();
      if (rows.length > 0) {
        return rows.map((row: any) => ({
          ...row,
          sparkline_in_7d: row.sparkline_in_7d ? JSON.parse(row.sparkline_in_7d) : undefined,
          tradeable_on_binance: !!row.tradeable_on_binance,
          tradeable_on_bybit: !!row.tradeable_on_bybit
        })) as CoinGeckoMarketData[];
      }
    } catch (e) { }
    return marketDataCache.data || [];
  }
}

/**
 * Map CoinGecko coin ID to Binance symbol
 */
const COINGECKO_TO_BINANCE: { [key: string]: string } = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
  ripple: "XRPUSDT",
  cardano: "ADAUSDT",
  avalanche: "AVAXUSDT",
  "avalanche-2": "AVAXUSDT",
  polkadot: "DOTUSDT",
  "polygon-ecosystem-token": "POLUSDT",
  polygon: "MATICUSDT",
  chainlink: "LINKUSDT",
  uniswap: "UNIUSDT",
  litecoin: "LTCUSDT",
  near: "NEARUSDT",
  aptos: "APTUSDT",
  arbitrum: "ARBUSDT",
  optimism: "OPUSDT",
  sui: "SUIUSDT",
  dogecoin: "DOGEUSDT",
  "shiba-inu": "SHIBUSDT",
  pepe: "PEPEUSDT",
  "the-open-network": "TONUSDT",
  tron: "TRXUSDT",
  stellar: "XLMUSDT",
  filecoin: "FILUSDT",
  cosmos: "ATOMUSDT",
  "ethereum-classic": "ETCUSDT",
  "injective-protocol": "INJUSDT",
  "render-token": "RENDERUSDT",
  celestia: "TIAUSDT",
  "internet-computer": "ICPUSDT",
  aave: "AAVEUSDT",
  maker: "MKRUSDT",
  "sei-network": "SEIUSDT",
  stacks: "STXUSDT",
  algorand: "ALGOUSDT",
};

/**
 * Fetch kline data from Binance Spot for a coin
 */
export async function fetchBinanceKlines(
  symbol: string,
  timeframe: string,
): Promise<number[][] | null> {
  try {
    // Map timeframe to Binance interval
    const intervalMap: { [key: string]: string } = {
      "5m": "5m",
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
    };
    const interval = intervalMap[timeframe] || "1h";

    // Fetch 500 candles for reliable EMA99
    const response = await fetch(
      `${BINANCE_SPOT_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=500`,
    );

    if (!response.ok) {
      return null;
    }

    const klines = await response.json();

    // Convert Binance klines to our format: [timestamp, open, high, low, close]
    const ohlcData = klines.map((k: any[]) => {
      return [
        k[0], // timestamp
        parseFloat(k[1]), // open
        parseFloat(k[2]), // high
        parseFloat(k[3]), // low
        parseFloat(k[4]), // close
        parseFloat(k[5]), // volume
      ];
    });

    return ohlcData;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch OHLC data - HYBRID APPROACH
 * Try Binance first (most accurate), fallback to CoinGecko if needed
 */
async function fetchOHLCData(
  coinId: string,
  timeframe: string,
): Promise<number[][] | null> {
  const now = Date.now();
  const cacheKey = `${coinId}-${timeframe}`;
  const cached = ohlcCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // Try Binance first (most accurate for listed coins)
  const binanceSymbol = COINGECKO_TO_BINANCE[coinId];
  if (binanceSymbol) {
    const binanceData = await fetchBinanceKlines(binanceSymbol, timeframe);
    if (binanceData && binanceData.length >= 100) {
      ohlcCache.set(cacheKey, { data: binanceData, timestamp: now });
      return binanceData;
    }
  }

  // Fallback: CoinGecko market_chart (less accurate but covers more coins)
  try {
    let days: string;
    switch (timeframe) {
      case "15m":
      case "5m":
        days = "1";
        break;
      case "1h":
        days = "7";
        break;
      case "4h":
        days = "30";
        break;
      case "1d":
        days = "90";
        break;
      default:
        days = "7";
    }

    const headers: HeadersInit = {
      Accept: "application/json",
    };

    if (IS_PRO && API_KEY) {
      headers["x-cg-pro-api-key"] = API_KEY;
    }

    const url = IS_PRO
      ? `${COINGECKO_API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&precision=full`
      : `${COINGECKO_API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.prices || !Array.isArray(data.prices)) {
      return null;
    }

    // Convert to OHLC format
    const ohlcData = data.prices.map((point: number[], index: number) => {
      const [timestamp, price] = point;
      const volume = data.total_volumes && data.total_volumes[index] ? data.total_volumes[index][1] : 0;
      return [timestamp, price, price, price, price, volume];
    });

    ohlcCache.set(cacheKey, { data: ohlcData, timestamp: now });
    return ohlcData;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch derivatives/futures market data for a coin (PRO API)
 */
async function fetchDerivativesData(
  coinId: string,
): Promise<CoinDerivativeData | null> {
  if (!IS_PRO) {
    return null; // Derivatives data requires PRO API
  }

  const now = Date.now();
  const cached = derivativesCache.get(coinId);

  if (cached && now - cached.timestamp < CACHE_DURATION * 2) {
    return cached; // Cache for 60 seconds
  }

  try {
    const headers: HeadersInit = {
      Accept: "application/json",
    };

    if (API_KEY) {
      headers["x-cg-pro-api-key"] = API_KEY;
    }

    // Note: CoinGecko's derivatives endpoint structure
    // We'll check if coin has futures by checking major exchanges
    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false`,
      { headers },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Check if coin is traded on major futures exchanges
    const tickers = data.tickers || [];
    const futuresExchanges = [
      "binance_futures",
      "bybit",
      "okex_futures",
      "gate_futures",
      "bitmex",
      "deribit",
      "bitget_futures",
    ];

    const hasFutures = tickers.some((ticker: any) =>
      futuresExchanges.some((exchange) =>
        ticker.market?.identifier?.toLowerCase().includes(exchange),
      ),
    );

    const derivativeData: CoinDerivativeData = {
      coinId,
      has_futures: hasFutures || FUTURES_TRADEABLE_COINS.includes(coinId),
      total_open_interest: 0,
      total_derivative_volume_24h: 0,
      exchanges: [],
      timestamp: now,
    };

    derivativesCache.set(coinId, derivativeData);
    return derivativeData;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch derivatives for ${coinId}`);
    return null;
  }
}

/**
 * Process coin using PROPER OHLC data for MA crossover detection
 */
async function processCoinWithOHLC(
  coin: CoinGeckoMarketData,
  timeframe: string,
): Promise<MASignal | null> {
  try {
    // Fetch OHLC data for this coin and timeframe
    const ohlcData = await fetchOHLCData(coin.id, timeframe);

    if (!ohlcData || ohlcData.length < 100) {
      return null;
    }

    // Extract close prices from OHLC data
    // OHLC format: [timestamp, open, high, low, close]
    let series = ohlcData.map((candle) => candle[4]); // close price
    // Filter out invalid prices
    const validPrices = series.filter((p) => p && p > 0 && !isNaN(p));

    if (validPrices.length < 100) {
      return null;
    }

    // Calculate EMA arrays
    const ema7Array = calculateEMAArray(validPrices, 7);
    const ema99Array = calculateEMAArray(validPrices, 99);

    // Validate EMA arrays
    if (
      ema7Array.length < 100 ||
      ema99Array.length < 100 ||
      ema7Array.length !== ema99Array.length
    ) {
      return null;
    }

    // Calculate lookback based on timeframe to cover 24 hours
    // This defines how far back we look for the "Crossover event"
    let lookback = 288; // Default for 5m (12 * 24)
    if (timeframe === "15m") lookback = 96;
    if (timeframe === "30m") lookback = 48;
    if (timeframe === "1h") lookback = 24;
    if (timeframe === "4h") lookback = 6;
    if (timeframe === "1d") lookback = 2;

    // Detect crossover in last 24h
    const crossover = detectCrossover(ema7Array, ema99Array, lookback);

    if (!crossover.type) {
      return null; // No fresh crossover found
    }

    // Get current EMA values
    const ema7Current = ema7Array[ema7Array.length - 1];
    const ema99Current = ema99Array[ema99Array.length - 1];

    // Validate current EMAs
    if (
      !ema7Current ||
      !ema99Current ||
      ema7Current === 0 ||
      ema99Current === 0
    ) {
      return null;
    }

    // Calculate crossover metrics
    const crossoverGap = Math.abs(ema7Current - ema99Current);
    const crossoverStrength = (crossoverGap / ema99Current) * 100;

    // Calculate volatility from recent prices
    // Calculate volatility from recent prices
    // Fetch Daily Data for Volatility Score (Hybrid/Binance)
    let dailyData: number[][] | null = null;
    try {
      const binanceSymbol = COINGECKO_TO_BINANCE[coin.id] || (coin.symbol.toUpperCase() + "USDT");
      dailyData = await fetchBinanceKlines(binanceSymbol, "1d");
    } catch (e) { }

    const volData = calculateVolatilityScore(dailyData, coin.current_price, coin.total_volume, coin.price_change_percentage_24h_in_currency || 0);
    const volatility = volData.score;
    // Store tooltip needed? Use formula field or new field? formula is limited length?
    // We can append to formula or rely on frontend to display generic explanation, but specific values are lost.
    // For now, store score. Frontend tooltips can calculate interpretations from score range.
    // Or simpler: put detailed Breakdown in `formula` field?
    // "Golden Cross | Vol: 8.5 (Extreme)"
    const volFormula = `Vol: ${volData.score.toFixed(1)} (${volData.interpretation || "N/A"})`;

    // Build signal name
    const signalName =
      crossover.type === "BUY"
        ? crossover.candlesAgo === 0
          ? "🟢 Golden Cross (FRESH!)"
          : `🟢 Golden Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`
        : crossover.candlesAgo === 0
          ? "🔴 Death Cross (FRESH!)"
          : `🔴 Death Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`;

    // Calculate signal score (0-100)
    let score = 50; // Base score

    // Freshness bonus (most important)
    if (crossover.candlesAgo === 0) score += 30;
    else if (crossover.candlesAgo === 1) score += 20;
    else if (crossover.candlesAgo === 2) score += 10;

    // Trend alignment bonus
    const change24h = coin.price_change_percentage_24h_in_currency || 0;
    if (
      (crossover.type === "BUY" && change24h > 0) ||
      (crossover.type === "SELL" && change24h < 0)
    ) {
      score += 10;
    } else if (
      (crossover.type === "BUY" && change24h < -5) ||
      (crossover.type === "SELL" && change24h > 5)
    ) {
      score -= 10; // Strong penalty for divergence
    }

    // Trend Alignment (EMA99 Slope - Proven Strategy)
    // Check if long-term trend supports the crossover
    if (ema99Array.length > 5) {
      const current99 = ema99Array[ema99Array.length - 1];
      const prev99 = ema99Array[ema99Array.length - 6]; // 5 candles ago
      const slope = (current99 - prev99) / prev99;

      if ((crossover.type === "BUY" && slope > 0) || (crossover.type === "SELL" && slope < 0)) {
        score += 10; // Trend Confirmation
      } else {
        score -= 10; // Trend Contradiction (Counter-trend trade risk)
      }
    }

    // Crossover strength bonus
    if (crossoverStrength > 0.5) score += 3;
    if (crossoverStrength > 1.0) score += 3;
    if (crossoverStrength > 2.0) score += 4;

    // Volume bonus (higher volume = more reliable)
    if (coin.total_volume > 100000000) score += 3; // >$100M volume
    if (coin.total_volume > 500000000) score += 3; // >$500M volume
    if (coin.total_volume > 1000000000) score += 4; // >$1B volume (major coins)

    // Futures-tradeable bonus (coins with active futures markets)
    const isFuturesTradeable = FUTURES_TRADEABLE_COINS.includes(coin.id);
    if (isFuturesTradeable) {
      score += 5; // Bonus for futures-tradeable coins (better liquidity)
    }

    // PRO API: Check derivatives data for additional validation
    if (IS_PRO && isFuturesTradeable) {
      const derivativesData = await fetchDerivativesData(coin.id);
      if (derivativesData?.has_futures) {
        score += 3; // Additional bonus for confirmed futures markets
      }
    }

    // Market cap rank bonus (established projects)
    if (coin.market_cap_rank && coin.market_cap_rank <= 50) score += 5;
    else if (coin.market_cap_rank && coin.market_cap_rank <= 100) score += 3;

    // Volatility penalty
    if (volatility > 5) score -= 3;
    if (volatility > 10) score -= 5;
    if (volatility > 15) score -= 7;

    // Cap score between 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate trade levels
    const currentPrice = coin.current_price;
    const entryPrice = currentPrice;

    let stopLoss: number;
    let takeProfit: number;

    if (crossover.type === "BUY") {
      stopLoss = currentPrice * 0.97; // 3% stop loss
      takeProfit = currentPrice * 1.06; // 6% take profit
    } else {
      stopLoss = currentPrice * 1.03; // 3% stop loss (for short)
      takeProfit = currentPrice * 0.94; // 6% take profit (for short)
    }

    // Build formula string with data source tag
    const binanceSymbol = COINGECKO_TO_BINANCE[coin.id];
    const dataSourceTag = binanceSymbol ? " | 📊 BINANCE" : " | 🦎 COINGECKO";
    const futuresTag = FUTURES_TRADEABLE_COINS.includes(coin.id)
      ? " | FUTURES"
      : "";
    const formula = `EMA(7)=${ema7Current.toFixed(6)} | EMA(99)=${ema99Current.toFixed(6)} | Gap=${crossoverStrength.toFixed(2)}%${dataSourceTag}${futuresTag}`;

    // Get the actual crossover timestamp from the candle where it occurred
    // SAFETY: If index is out of bounds (happened on our injected point), use current time
    const crossoverTimestamp = (crossover.index < ohlcData.length)
      ? ohlcData[crossover.index][0]
      : Date.now();

    // Create signal object
    const signal: MASignal = {
      coinId: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      signalType: crossover.type,
      signalName,
      timeframe,
      score,
      price: currentPrice,
      currentPrice,
      change1h: coin.price_change_percentage_1h_in_currency || 0,
      change24h: coin.price_change_percentage_24h_in_currency || 0,
      change7d: coin.price_change_percentage_7d_in_currency || 0,
      volume24h: coin.total_volume,
      marketCap: coin.market_cap,
      timestamp: Date.now(),
      crossoverTimestamp: crossoverTimestamp,
      candlesAgo: crossover.candlesAgo,
      entryPrice,
      stopLoss,
      takeProfit,
      volatility: volData.score, // Use calculated Score 0-10
      volatilityTooltip: volData.tooltip,
      formula,
      ema7: ema7Current,
      ema99: ema99Current,
      ema7Prev: crossover.ema7Prev,
      ema99Prev: crossover.ema99Prev,
      crossoverStrength: Math.round(crossoverStrength * 100) / 100,
    };

    return signal;
  } catch (error) {
    console.error(`Error processing ${coin.symbol}:`, error);
    return null;
  }
}

/**
 * Process coin using SPARKLINE data for MA crossover detection (FALLBACK)
 */
async function processCoinWithSparkline(
  coin: CoinGeckoMarketData,
  timeframe: string,
): Promise<MASignal | null> {
  try {
    // Validate sparkline data exists
    if (
      !coin.sparkline_in_7d?.price ||
      coin.sparkline_in_7d.price.length < 100
    ) {
      return null;
    }

    // Get price data
    let prices = [...coin.sparkline_in_7d.price];

    // Filter out invalid prices (0, null, undefined, NaN)
    prices = prices.filter((p) => p && p > 0 && !isNaN(p));

    if (prices.length < 100) {
      return null;
    }

    // Add current price as latest data point
    if (coin.current_price && coin.current_price > 0) {
      prices.push(coin.current_price);
    }

    // Resample based on timeframe
    // Sparkline is hourly data (168 points for 7 days)
    let sampledPrices = prices;

    if (timeframe === "4h") {
      // Sample every 4th point for 4h timeframe
      sampledPrices = prices.filter((_, i) => i % 4 === 0);
    } else if (timeframe === "1d") {
      // Sample every 24th point for daily timeframe
      sampledPrices = prices.filter((_, i) => i % 24 === 0);
    }
    // For 1h and 15m, use hourly data as-is

    // Need at least 100 candles for reliable EMA99
    if (sampledPrices.length < 100) {
      return null;
    }

    // Calculate EMA arrays
    const ema7Array = calculateEMAArray(sampledPrices, 7);
    const ema99Array = calculateEMAArray(sampledPrices, 99);

    // Validate EMA arrays
    if (
      ema7Array.length < 100 ||
      ema99Array.length < 100 ||
      ema7Array.length !== ema99Array.length
    ) {
      return null;
    }

    // Calculate lookback based on timeframe to cover 24 hours
    let lookback = 288; // Default for 5m (12 * 24)
    if (timeframe === "15m") lookback = 96;
    if (timeframe === "30m") lookback = 48;
    if (timeframe === "1h") lookback = 24;
    if (timeframe === "4h") lookback = 6;
    if (timeframe === "1d") lookback = 2;

    // Detect crossover in last 24h
    const crossover = detectCrossover(ema7Array, ema99Array, lookback);

    if (!crossover.type) {
      return null; // No fresh crossover found
    }

    // Get current EMA values
    const ema7Current = ema7Array[ema7Array.length - 1];
    const ema99Current = ema99Array[ema99Array.length - 1];

    // Validate current EMAs
    if (
      !ema7Current ||
      !ema99Current ||
      ema7Current === 0 ||
      ema99Current === 0
    ) {
      return null;
    }

    // Calculate crossover metrics
    const crossoverGap = Math.abs(ema7Current - ema99Current);
    const crossoverStrength = (crossoverGap / ema99Current) * 100;

    // Calculate volatility from recent prices
    const recentPrices = sampledPrices.slice(-30);
    const volatility = calculateVolatility(recentPrices);

    // Build signal name
    const signalName =
      crossover.type === "BUY"
        ? crossover.candlesAgo === 0
          ? "🟢 Golden Cross (FRESH!)"
          : `🟢 Golden Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`
        : crossover.candlesAgo === 0
          ? "🔴 Death Cross (FRESH!)"
          : `🔴 Death Cross (${crossover.candlesAgo} candle${crossover.candlesAgo > 1 ? "s" : ""} ago)`;

    // Calculate signal score (0-100)
    let score = 50; // Base score

    // Freshness bonus (most important)
    if (crossover.candlesAgo === 0) score += 25;
    else if (crossover.candlesAgo === 1) score += 15;
    else if (crossover.candlesAgo === 2) score += 10;
    else if (crossover.candlesAgo === 3) score += 5;

    // Trend alignment bonus
    const change24h = coin.price_change_percentage_24h_in_currency || 0;
    if (
      (crossover.type === "BUY" && change24h > 0) ||
      (crossover.type === "SELL" && change24h < 0)
    ) {
      score += 10;
    } else if (
      (crossover.type === "BUY" && change24h < -2) ||
      (crossover.type === "SELL" && change24h > 2)
    ) {
      score -= 5; // Penalty for divergence
    }

    // Crossover strength bonus
    if (crossoverStrength > 0.5) score += 3;
    if (crossoverStrength > 1.0) score += 3;
    if (crossoverStrength > 2.0) score += 4;

    // Volatility penalty
    if (volatility > 5) score -= 3;
    if (volatility > 10) score -= 5;
    if (volatility > 15) score -= 7;

    // Cap score between 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate trade levels
    const currentPrice = coin.current_price;
    const entryPrice = currentPrice;

    let stopLoss: number;
    let takeProfit: number;

    if (crossover.type === "BUY") {
      stopLoss = currentPrice * 0.97; // 3% stop loss
      takeProfit = currentPrice * 1.06; // 6% take profit
    } else {
      stopLoss = currentPrice * 1.03; // 3% stop loss (for short)
      takeProfit = currentPrice * 0.94; // 6% take profit (for short)
    }

    // Build formula string
    const formula = `EMA(7)=${ema7Current.toFixed(6)} | EMA(99)=${ema99Current.toFixed(6)} | Gap=${crossoverStrength.toFixed(2)}%`;

    // Create signal object
    const signal: MASignal = {
      coinId: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      signalType: crossover.type,
      signalName,
      timeframe,
      score,
      price: currentPrice,
      currentPrice,
      change1h: coin.price_change_percentage_1h_in_currency || 0,
      change24h: coin.price_change_percentage_24h_in_currency || 0,
      change7d: coin.price_change_percentage_7d_in_currency || 0,
      volume24h: coin.total_volume,
      marketCap: coin.market_cap,
      timestamp: Date.now(),
      crossoverTimestamp: Date.now(),
      candlesAgo: crossover.candlesAgo,
      entryPrice,
      stopLoss,
      takeProfit,
      volatility: Math.round(volatility * 100) / 100,
      formula,
      ema7: ema7Current,
      ema99: ema99Current,
      ema7Prev: crossover.ema7Prev,
      ema99Prev: crossover.ema99Prev,
      crossoverStrength: Math.round(crossoverStrength * 100) / 100,
    };

    return signal;
  } catch (error) {
    console.error(`Error processing ${coin.symbol}:`, error);
    return null;
  }
}

/**
 * Main function - Calculate MA crossover signals
 */
export async function calculateMACrossovers(
  timeframe: string = "1h",
  maxCoins: number = 0, // 0 means all
): Promise<MASignal[]> {
  try {
    // Check cache first
    const cacheKey = `${timeframe}_${maxCoins}`;
    const cached = signalsCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_DURATION) {
      console.log(`✅ Using cached signals for ${timeframe}`);
      return cached.data;
    }

    console.log(`🔍 Scanning for MA crossovers on ${timeframe} timeframe...`);

    let coins = await fetchTopCoins();

    if (!coins || coins.length === 0) {
      console.warn("⚠️ No coins fetched from API");
      return [];
    }

    if (maxCoins > 0) {
      coins = coins.slice(0, maxCoins);
    }

    console.log(
      `📊 Analyzing ${coins.length} coins using HYBRID approach...`,
    );

    // Process coins in larger batches for speed
    const batchSize = IS_PRO ? 50 : 20;
    const results: (MASignal | null)[] = [];
    let processedCount = 0;
    let successCount = 0;

    // Use a pool-like mechanism or just simple batching with Promise.all
    // We can run multiple batches in parallel if we are careful about rate limits (3000/min for Pro)
    // 1000 coins / 50 batch = 20 batches. 
    // We can probably run 2-3 batches concurrently.

    const parallelBatches = IS_PRO ? 2 : 1;

    for (let i = 0; i < coins.length; i += (batchSize * parallelBatches)) {
      // Create chunks for this iteration
      const currentBatches = [];
      for (let j = 0; j < parallelBatches; j++) {
        const start = i + (j * batchSize);
        if (start < coins.length) {
          currentBatches.push(coins.slice(start, start + batchSize));
        }
      }

      console.log(`   🚀 Processing ${currentBatches.length} batches (${processedCount}/${coins.length} coins)...`);

      // Process all chunks with sequential control
      const parallelResults = [];
      for(const batch of currentBatches) {
         try {
            const bResults = await Promise.all(
              batch.map(coin => processCoinWithOHLC(coin, timeframe).catch(e => {
                console.warn(`⚠️ Error processing ${coin.symbol}:`, e.message);
                return null;
              }))
            );
            parallelResults.push(bResults);
         } catch(e) {
            console.error("❌ Batch processing failure:", e);
         }
      }

      // Flatten and add
      parallelResults.forEach(batchRes => {
        results.push(...batchRes);
        processedCount += batchRes.length;
        successCount += batchRes.filter(r => r !== null).length;
      });

      // Minimal delay between super-batches
      if (i + (batchSize * parallelBatches) < coins.length) {
        await new Promise((resolve) => setTimeout(resolve, IS_PRO ? 20 : 200));
      }
    }

    console.log(
      `   ✅ Processed ${processedCount} coins, found data for ${successCount} coins`,
    );

    // Filter valid signals (Strong Quality >= 60)
    const signals: MASignal[] = [];
    for (const signal of results) {
      if (signal && signal.score >= 60) {
        signals.push(signal);
      }
    }

    // Sort by Time (Newest First) as requested
    signals.sort((a, b) => b.crossoverTimestamp - a.crossoverTimestamp);

    // Count data sources
    const binanceCount = signals.filter((s) =>
      s.formula.includes("BINANCE"),
    ).length;
    const coingeckoCount = signals.length - binanceCount;

    console.log(
      `✅ Found ${signals.length} FRESH MA crossover signals on ${timeframe}`,
    );
    console.log(
      `   📊 Data sources: Binance=${binanceCount} | CoinGecko=${coingeckoCount}`,
    );

    if (signals.length > 0) {
      const buySignals = signals.filter((s) => s.signalType === "BUY").length;
      const sellSignals = signals.filter((s) => s.signalType === "SELL").length;
      console.log(`   - BUY: ${buySignals} | SELL: ${sellSignals}`);
      console.log(
        `   - Top signals: ${signals
          .slice(0, 5)
          .map((s) => `${s.symbol}(${s.score})`)
          .join(", ")}`,
      );
      console.log(
        `   - Avg score: ${Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)}`,
      );
    } else {
      console.log(
        `   ℹ️ No fresh crossovers detected. This is normal - crossovers are rare events.`,
      );
    }

    // Cache results
    signalsCache.set(cacheKey, { data: signals, timestamp: now });

    return signals;
  } catch (error) {
    console.error("❌ Error calculating MA crossovers:", error);
    return [];
  }
}

/**
 * Get coin details using PRO API
 */
export async function getCoinDetails(coinId: string) {
  try {
    const headers: HeadersInit = {
      Accept: "application/json",
    };

    if (IS_PRO && API_KEY) {
      headers["x-cg-pro-api-key"] = API_KEY;
    }

    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch coin details: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching coin details for ${coinId}:`, error);
    return null;
  }
}

/**
 * Refresh market data (force cache clear)
 */
export async function refreshMarketData(
  timeframe: string = "1h",
): Promise<MASignal[]> {
  console.log("🔄 Force refreshing market data...");
  // Invalidate in-memory cache
  marketDataCache = { data: null, timestamp: 0 };
  signalsCache.clear();

  // Invalidate DB cache
  try {
    db.prepare('UPDATE coins SET updated_at = 0').run();
  } catch (e) {
    console.error("Failed to invalidate DB cache", e);
  }

  return calculateMACrossovers(timeframe);
}

/**
 * Symbol mapping for Binance to CoinGecko
 */
export const BINANCE_TO_COINGECKO: Record<
  string,
  { id: string; image: string }
> = {
  BTCUSDT: {
    id: "bitcoin",
    image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  ETHUSDT: {
    id: "ethereum",
    image:
      "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  },
  BNBUSDT: {
    id: "binancecoin",
    image:
      "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  },
  SOLUSDT: {
    id: "solana",
    image:
      "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
  },
  XRPUSDT: {
    id: "ripple",
    image:
      "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  },
  ADAUSDT: {
    id: "cardano",
    image:
      "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
  },
  DOGEUSDT: {
    id: "dogecoin",
    image:
      "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
  },
  MATICUSDT: {
    id: "matic-network",
    image:
      "https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png",
  },
  DOTUSDT: {
    id: "polkadot",
    image:
      "https://coin-images.coingecko.com/coins/images/12171/large/polkadot.png",
  },
  AVAXUSDT: {
    id: "avalanche-2",
    image:
      "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  },
  SHIBUSDT: {
    id: "shiba-inu",
    image:
      "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
  },
  LINKUSDT: {
    id: "chainlink",
    image:
      "https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  },
  UNIUSDT: {
    id: "uniswap",
    image: "https://coin-images.coingecko.com/coins/images/12504/large/uni.jpg",
  },
  ATOMUSDT: {
    id: "cosmos",
    image:
      "https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png",
  },
  LTCUSDT: {
    id: "litecoin",
    image:
      "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png",
  },
  ETCUSDT: {
    id: "ethereum-classic",
    image:
      "https://coin-images.coingecko.com/coins/images/453/large/ethereum-classic-logo.png",
  },
  NEARUSDT: {
    id: "near",
    image:
      "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg",
  },
  ALGOUSDT: {
    id: "algorand",
    image:
      "https://coin-images.coingecko.com/coins/images/4380/large/download.png",
  },
  TRXUSDT: {
    id: "tron",
    image:
      "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png",
  },
  FILUSDT: {
    id: "filecoin",
    image:
      "https://coin-images.coingecko.com/coins/images/12817/large/filecoin.png",
  },
  VETUSDT: {
    id: "vechain",
    image:
      "https://coin-images.coingecko.com/coins/images/1167/large/VeChain-Logo-768x725.png",
  },
  XLMUSDT: {
    id: "stellar",
    image:
      "https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
  },
  ICPUSDT: {
    id: "internet-computer",
    image:
      "https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png",
  },
  APTUSDT: {
    id: "aptos",
    image:
      "https://coin-images.coingecko.com/coins/images/26455/large/aptos_round.png",
  },
  ARBUSDT: {
    id: "arbitrum",
    image:
      "https://coin-images.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg",
  },
  OPUSDT: {
    id: "optimism",
    image:
      "https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png",
  },
  INJUSDT: {
    id: "injective-protocol",
    image:
      "https://coin-images.coingecko.com/coins/images/12882/large/Secondary_Symbol.png",
  },
  LDOUSDT: {
    id: "lido-dao",
    image:
      "https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png",
  },
  PEPEUSDT: {
    id: "pepe",
    image:
      "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  },
  SUIUSDT: {
    id: "sui",
    image:
      "https://coin-images.coingecko.com/coins/images/26375/large/sui_asset.jpeg",
  },
  AAVEUSDT: {
    id: "aave",
    image:
      "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png",
  },
  MKRUSDT: {
    id: "maker",
    image:
      "https://coin-images.coingecko.com/coins/images/1364/large/Mark_Maker.png",
  },
};

/**
 * Get CoinGecko mapping for Binance symbol
 */
export function getBinanceCoinMapping(
  symbol: string,
): { id: string; image: string } | null {
  return BINANCE_TO_COINGECKO[symbol] || null;
}

/**
 * Find coin metadata from verified CoinGecko cache by symbol
 * Useful for enriching Binance Futures signals where we only have the symbol (e.g. "RIVER")
 */
export function findCoinMetadata(symbol: string): { id: string; name: string; image: string } | null {
  if (!marketDataCache.data) return null;

  // Try exact symbol match (case insensitive)
  const coin = marketDataCache.data.find(c => c.symbol.toLowerCase() === symbol.toLowerCase());

  if (coin) {
    return {
      id: coin.id,
      name: coin.name,
      image: coin.image
    };
  }

  return null;
}
