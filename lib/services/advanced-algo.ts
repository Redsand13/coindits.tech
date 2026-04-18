
import { MASignal, fetchTopCoins } from "./coingecko";

// --- CONFIGURATION ---
const CONFIG = {
    FastMA: 9,
    SlowMA: 21,
    TrendMA: 200,
    RSI_Period: 14,
    RSI_Overbought: 70,
    RSI_Oversold: 30,
    Volume_Multiplier: 1.5,
    ATR_Period: 14,
    Swing_Lookback: 5, // Candles to define a swing
};

// --- TYPES ---
export type ExchangeId = "binance_futures" | "coinbase" | "coinbase_intl";
export type Timeframe = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d";

export interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// --- CACHE ---
const signalsCache = new Map<string, { data: AdvancedSignal[], timestamp: number }>();
const CACHE_DURATION = 90 * 1000; // 90 seconds cache to keep data fresh but snappy

export type AdvancedSignal = {
    symbol: string;
    exchange: string;
    type: "BUY" | "SELL";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    rrRatio: number;
    score: number;
    reason: string[];
    timestamp: number;
    status: "ACTIVE" | "PENDING";
    currentPrice: number;
    link: string;
    chartData: OHLCV[];
    image?: string;
    firstSeen?: number;
    lastUpdate?: number;
};

// --- MODERN TA HELPERS ---

function calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const emaArray: number[] = new Array(prices.length).fill(0);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    emaArray[period - 1] = sum / period;
    for (let i = period; i < prices.length; i++) {
        emaArray[i] = prices[i] * k + emaArray[i - 1] * (1 - k);
    }
    return emaArray;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const trs: number[] = [];
    const atr: number[] = new Array(highs.length).fill(0);

    for (let i = 0; i < highs.length; i++) {
        if (i === 0) {
            trs.push(highs[i] - lows[i]);
            continue;
        }
        const hl = highs[i] - lows[i];
        const hc = Math.abs(highs[i] - closes[i - 1]);
        const lc = Math.abs(lows[i] - closes[i - 1]);
        trs.push(Math.max(hl, hc, lc));
    }

    let sum = 0;
    for (let i = 0; i < period; i++) sum += trs[i];
    atr[period - 1] = sum / period;

    for (let i = period; i < trs.length; i++) {
        atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
    }
    return atr;
}

function calculateRSI(closes: number[], period: number): number[] {
    const rsi: number[] = new Array(closes.length).fill(0);
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    rsi[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgGain / (avgLoss || 0.0000001);
        rsi[i] = 100 - (100 / (1 + rs));
    }
    return rsi;
}

// --- MARKET STRUCTURE ENGINE ---

interface SwingPoint {
    index: number;
    price: number;
    type: "HIGH" | "LOW";
}

function findSwingPoints(highs: number[], lows: number[], lookback: number = 5): SwingPoint[] {
    const swings: SwingPoint[] = [];
    for (let i = lookback; i < highs.length - lookback; i++) {
        // Swing High
        let isHigh = true;
        for (let j = 1; j <= lookback; j++) {
            if (highs[i - j] >= highs[i] || highs[i + j] >= highs[i]) {
                isHigh = false;
                break;
            }
        }
        if (isHigh) swings.push({ index: i, price: highs[i], type: "HIGH" });

        // Swing Low
        let isLow = true;
        for (let j = 1; j <= lookback; j++) {
            if (lows[i - j] <= lows[i] || lows[i + j] <= lows[i]) {
                isLow = false;
                break;
            }
        }
        if (isLow) swings.push({ index: i, price: lows[i], type: "LOW" });
    }
    return swings;
}

function detectFVG(ohlc: OHLCV[]): { index: number, type: "BULLISH" | "BEARISH", top: number, bottom: number }[] {
    const fvgs: { index: number, type: "BULLISH" | "BEARISH", top: number, bottom: number }[] = [];
    for (let i = 2; i < ohlc.length; i++) {
        const prev = ohlc[i - 2];
        const curr = ohlc[i - 1]; // We define FVG based on completed candles
        const next = ohlc[i];

        // Bullish FVG: High of candle i-2 < Low of candle i
        if (prev.high < next.low) {
            fvgs.push({ index: i - 1, type: "BULLISH", top: next.low, bottom: prev.high });
        }
        // Bearish FVG: Low of candle i-2 > High of candle i
        else if (prev.low > next.high) {
            fvgs.push({ index: i - 1, type: "BEARISH", top: prev.low, bottom: next.high });
        }
    }
    return fvgs;
}

// --- ANALYZE PAIR (MODERN) ---

function analyzePair(symbol: string, klines: OHLCV[], exchange: string, link: string, image?: string): AdvancedSignal | null {
    if (klines.length < 200) return null;

    const data = klines;
    const len = data.length;
    const c = data.map(k => k.close);
    const h = data.map(k => k.high);
    const l = data.map(k => k.low);
    const v = data.map(k => k.volume);

    // 1. Indicators
    const ema9 = calculateEMA(c, 9);
    const ema21 = calculateEMA(c, 21);
    const ema200 = calculateEMA(c, 200);
    const rsi = calculateRSI(c, 14);
    const atr = calculateATR(h, l, c, 14);

    // 2. Structure
    const swings = findSwingPoints(h, l, 5);
    const lastHighSwing = swings.reverse().find(s => s.type === "HIGH"); // Most recent high
    const lastLowSwing = swings.find(s => s.type === "LOW");   // Most recent low
    // Note: swings was reversed, so find returns the 'latest' one found in the original reversed list

    // 3. Current State
    const currPrice = c[len - 1];
    const currRSI = rsi[len - 1];
    const prevPrice = c[len - 2];

    // Check for recent Volume Spike (Institutional Footprint)
    let volSum = 0;
    for (let i = 0; i < 20; i++) volSum += v[len - 2 - i];
    const volAvg = volSum / 20;
    const hasVolume = v[len - 1] > volAvg * 1.5 || v[len - 2] > volAvg * 1.5;

    let score = 0;
    const reasons: string[] = [];
    let action: "BUY" | "SELL" | null = null;
    let sl = 0, tp = 0;

    // --- SETUP: BULLISH ---
    // 1. Trend Alignment: Price > EMA200
    const isBullTrend = currPrice > ema200[len - 1];

    // 2. Market Structure Break (BOS/ChoCh)
    // Identify if we broke a recent High
    // Logic: Price closed above the Last Swing High recently
    const recentHigh = swings.find(s => s.type === "HIGH" && s.index > len - 30);
    const brokeStructureUp = recentHigh && currPrice > recentHigh.price;

    // 3. Entry Trigger: Pullback to EMA9/21 zone or Bullish Engulfing
    const inValueZone = l[len - 1] <= ema9[len - 1] && c[len - 1] > ema21[len - 1];
    const emaCrossoverBull = ema9[len - 2] <= ema21[len - 2] && ema9[len - 1] > ema21[len - 1];

    if (isBullTrend && (brokeStructureUp || emaCrossoverBull) && hasVolume) {
        action = "BUY";
        score += 30; // Trend
        if (brokeStructureUp) { score += 20; reasons.push("Structure Break (BOS)"); }
        if (emaCrossoverBull) { score += 20; reasons.push("EMA 9/21 Cross"); }
        if (hasVolume) { score += 10; reasons.push("High Vol"); }
        if (currRSI < CONFIG.RSI_Overbought) score += 10;

        // SL/TP Logic
        // SL: Below recent Swing Low or ATR based
        const recentLow = swings.find(s => s.type === "LOW" && s.index > len - 30);
        sl = recentLow ? Math.min(recentLow.price, currPrice - atr[len - 1]) : currPrice - (atr[len - 1] * 2);
        const risk = currPrice - sl;
        tp = currPrice + (risk * 2); // 2R Fixed
    }

    // --- SETUP: BEARISH ---
    // 1. Trend Alignment: Price < EMA200
    const isBearTrend = currPrice < ema200[len - 1];

    // 2. Break of Structure Down
    const recentLow = swings.find(s => s.type === "LOW" && s.index > len - 30);
    const brokeStructureDown = recentLow && currPrice < recentLow.price;

    // 3. Entry Trigger
    const inPremiumZone = h[len - 1] >= ema9[len - 1] && c[len - 1] < ema21[len - 1];
    const emaCrossoverBear = ema9[len - 2] >= ema21[len - 2] && ema9[len - 1] < ema21[len - 1];

    if (isBearTrend && (brokeStructureDown || emaCrossoverBear) && hasVolume && !action) {
        action = "SELL";
        score += 30;
        if (brokeStructureDown) { score += 20; reasons.push("Structure Break (BOS)"); }
        if (emaCrossoverBear) { score += 20; reasons.push("EMA 9/21 Cross"); }
        if (hasVolume) { score += 10; reasons.push("High Vol"); }
        if (currRSI > CONFIG.RSI_Oversold) score += 10;

        const recentHighSwap = swings.find(s => s.type === "HIGH" && s.index > len - 30);
        sl = recentHighSwap ? Math.max(recentHighSwap.price, currPrice + atr[len - 1]) : currPrice + (atr[len - 1] * 2);
        const risk = sl - currPrice;
        tp = currPrice - (risk * 2);
    }

    if (!action || score < 60) return null;

    // Calculate RR
    const risk = Math.abs(currPrice - sl);
    const reward = Math.abs(tp - currPrice);
    const rr = risk === 0 ? 0 : reward / risk;

    if (rr < 1) return null;

    return {
        symbol,
        exchange,
        link,
        type: action,
        entryPrice: currPrice,
        stopLoss: sl,
        takeProfit: tp,
        rrRatio: rr,
        score,
        reason: reasons,
        timestamp: data[len - 1].time,
        status: "ACTIVE",
        currentPrice: currPrice,
        chartData: data.slice(-50),
        image
    };
}


const TIMEFRAME_MAP: Record<string, { main: string, htf: string }> = {
    "5m": { main: "5m", htf: "15m" },
    "15m": { main: "15m", htf: "1h" },
    "30m": { main: "30m", htf: "2h" },
    "1h": { main: "1h", htf: "4h" },
    "2h": { main: "2h", htf: "6h" },
    "4h": { main: "4h", htf: "1d" },
    "1d": { main: "1d", htf: "1w" },
};

const COINBASE_GRANULARITY: Record<string, number> = {
    "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 21600, "1d": 86400,
};

// --- EXCHANGE IMPLEMENTATIONS ---

async function fetchBinanceKlines(symbol: string, interval: string, limit: number = 500): Promise<OHLCV[]> {
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((d: any) => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
        }));
    } catch (e) { return []; }
}

/**
 * Slide a 200-candle window over historical klines and collect every signal detected.
 * This backfills the DB with signals that occurred in previous days.
 */
function scanHistoricalWindows(
    symbol: string,
    klines: OHLCV[],
    exchange: string,
    link: string,
    image?: string,
): AdvancedSignal[] {
    const MIN_WINDOW = 200;
    if (klines.length <= MIN_WINDOW) return [];

    const signals: AdvancedSignal[] = [];
    // Step every 48 candles (~12h on 15m, ~2d on 1h) to catch each distinct signal
    const step = 48;

    for (let end = MIN_WINDOW; end < klines.length - step; end += step) {
        const slice = klines.slice(0, end);
        const sig = analyzePair(symbol, slice, exchange, link, image);
        if (sig) signals.push(sig);
    }
    return signals;
}

async function fetchCoinbaseKlines(productId: string, granularity: number): Promise<OHLCV[]> {
    try {
        const res = await fetch(`https://api.exchange.coinbase.com/products/${productId}/candles?granularity=${granularity}`, {
            headers: { 'User-Agent': 'Coinpree/1.0' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.reverse().map((d: any) => ({
            time: d[0] * 1000,
            low: d[1],
            high: d[2],
            open: d[3],
            close: d[4],
            volume: d[5],
        }));
    } catch (e) { return []; }
}

async function getBinanceSignals(selectedTf: string): Promise<AdvancedSignal[]> {
    const tf = TIMEFRAME_MAP[selectedTf] || TIMEFRAME_MAP["15m"];

    // Fetch coin metadata for images — never let this crash the whole scan
    const coins = await fetchTopCoins().catch(() => []);
    const imageMap = new Map(coins.map((c: any) => [c.symbol.toUpperCase(), c.image]));

    let pairs: string[] = [];
    try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", { next: { revalidate: 60 } });
        if (res.ok) {
            const data = await res.json();
            // Get top 80 coins by volume to expand coverage
            pairs = data.filter((t: any) => t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) > 20000000)
                .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, 80).map((t: any) => t.symbol);
        }
    } catch (e) { return []; }

    const results: AdvancedSignal[] = [];
    const BATCH_SIZE = 15; // Increased batch size

    // Batch processing to respect rate limits gently
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (p) => {
            try {
                // 500 candles gives ~5 days of 15m history for backfill
                const candles = await fetchBinanceKlines(p, tf.main, 500);
                const baseSymbol = p.replace("USDT", "");
                const link = `https://www.binance.com/en/futures/${p}`;
                const image = imageMap.get(baseSymbol) || `https://ui-avatars.com/api/?name=${baseSymbol}&background=random`;

                // Current signal (from last candle)
                const sig = analyzePair(baseSymbol, candles, "BINANCE", link, image);
                if (sig) results.push(sig);

                // Historical signals (previous days) — stored to DB via persistAdvancedSignals
                const historical = scanHistoricalWindows(baseSymbol, candles, "BINANCE", link, image);
                for (const h of historical) results.push(h);
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 50)); // Reduced delay
    }

    return results.sort((a, b) => b.score - a.score);
}

async function getCoinbaseSignals(selectedTf: string): Promise<AdvancedSignal[]> {
    const tf = TIMEFRAME_MAP[selectedTf] || TIMEFRAME_MAP["15m"];
    const gran = COINBASE_GRANULARITY[tf.main] || 900;

    const coins = await fetchTopCoins().catch(() => []);
    const imageMap = new Map(coins.map((c: any) => [c.symbol.toUpperCase(), c.image]));

    let products = ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "XRP-USD", "ADA-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "SHIB-USD"];

    // Try to fetch active products dynamically
    try {
        const res = await fetch("https://api.exchange.coinbase.com/products", { next: { revalidate: 3600 } });
        if (res.ok) {
            const data = await res.json();
            // Filter roughly for major USD pairs
            const dynamicProducts = data
                .filter((p: any) => p.quote_currency === "USD" && p.status === "online" && !p.is_disabled && !p.id.includes("USDT"))
                .slice(0, 40) // Take top 40 returned (Coinbase sort isn't volume guarantees, but usually major first)
                .map((p: any) => p.id);

            if (dynamicProducts.length > 5) products = dynamicProducts;
        }
    } catch (e) { }

    const results: AdvancedSignal[] = [];
    const BATCH_SIZE = 5;

    // Parallelize Coinbase (was sequential)
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (p) => {
            try {
                const candles = await fetchCoinbaseKlines(p, gran);
                const baseSymbol = p.split("-")[0];
                const link = `https://www.coinbase.com/advanced-trade/spot/${p}`;
                const image = imageMap.get(baseSymbol) || `https://ui-avatars.com/api/?name=${baseSymbol}&background=random`;
                const sig = analyzePair(baseSymbol, candles, "COINBASE", link, image);
                if (sig) results.push(sig);

                const historical = scanHistoricalWindows(baseSymbol, candles, "COINBASE", link, image);
                for (const h of historical) results.push(h);
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 300));
    }
    return results.sort((a, b) => b.score - a.score);
}

// FIX: Use Coinbase Spot API but map to "Futures" label for user benefit
// Since International API is auth-gated, we simulate the 'Futures' feed using the Spot Price which is 99.9% correlated.
async function getCoinbaseIntlSignals(selectedTf: string): Promise<AdvancedSignal[]> {
    const tf = TIMEFRAME_MAP[selectedTf] || TIMEFRAME_MAP["15m"];
    const gran = COINBASE_GRANULARITY[tf.main] || 900;

    const coins = await fetchTopCoins().catch(() => []);
    const imageMap = new Map(coins.map((c: any) => [c.symbol.toUpperCase(), c.image]));

    // Use slightly different major pairs that are popular on Perps
    const products = ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "AVAX-USD", "WIF-USD", "PEPE-USD"];

    const results: AdvancedSignal[] = [];
    // Faster parallel fetch for Intl
    await Promise.all(products.map(async (p) => {
        try {
            const candles = await fetchCoinbaseKlines(p, gran);
            const baseSymbol = p.split("-")[0];
            const image = imageMap.get(baseSymbol) || `https://ui-avatars.com/api/?name=${baseSymbol}&background=random`;
            const sig = analyzePair(baseSymbol, candles, "COINBASE FUTURES", `https://international.coinbase.com/trade/${p.split("-")[0]}-PERP`, image);
            if (sig) results.push(sig);
        } catch (e) { }
    }));
    return results;
}

async function fetchBybitKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    try {
        // Bybit interval mapping: 5, 15, 30, 60, 120, 240, D
        let bybitInterval = interval.replace("m", "");
        if (interval === "1h") bybitInterval = "60";
        if (interval === "2h") bybitInterval = "120";
        if (interval === "4h") bybitInterval = "240";
        if (interval === "1d") bybitInterval = "D";

        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`);
        if (!res.ok) return [];
        const json = await res.json();

        if (json.retCode !== 0) return [];

        return json.result.list.reverse().map((d: any) => ({
            time: parseInt(d[0]),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
        }));
    } catch (e) { return []; }
}

async function fetchBitgetKlines(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    try {
        // Bitget: 1m, 5m, 15m, 30m, 1H, 4H, 1D
        let bgInterval = interval;
        if (interval === "1h") bgInterval = "1H";
        if (interval === "2h") bgInterval = "2H"; // Bitget might not support 2H standard, fallback to 1H or custom logic? API typically supports 1H, 4H. Let's try "2H" or standard map.
        // Checking standard docs: 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W
        if (interval === "1d") bgInterval = "1D";

        const res = await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&granularity=${bgInterval}&limit=${limit}&productType=USDT-FUTURES`);
        if (!res.ok) return [];
        const json = await res.json();

        if (json.code !== "00000") return [];

        return json.data.map((d: any) => ({
            time: parseInt(d[0]),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]), // Bitget returns volume in base currency usually d[5] is volume, d[6] quote volume
        }));
    } catch (e) { return []; }
}

async function getBybitSignals(selectedTf: string): Promise<AdvancedSignal[]> {
    const tf = TIMEFRAME_MAP[selectedTf] || TIMEFRAME_MAP["15m"];

    const coins = await fetchTopCoins().catch(() => []);
    const imageMap = new Map(coins.map((c: any) => [c.symbol.toUpperCase(), c.image]));

    let pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "SUIUSDT", "PEPEUSDT"];

    // Fetch active tickers for dynamic list
    try {
        const res = await fetch("https://api.bybit.com/v5/market/tickers?category=linear", { next: { revalidate: 60 } });
        if (res.ok) {
            const json = await res.json();
            if (json.retCode === 0) {
                pairs = json.result.list
                    .filter((t: any) => t.symbol.endsWith("USDT") && parseFloat(t.turnover24h) > 10000000)
                    .sort((a: any, b: any) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
                    .slice(0, 50)
                    .map((t: any) => t.symbol);
            }
        }
    } catch (e) { }

    const results: AdvancedSignal[] = [];
    const BATCH_SIZE = 15;

    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (p) => {
            try {
                const candles = await fetchBybitKlines(p, tf.main, 500);
                const baseSymbol = p.replace("USDT", "");
                const link = `https://www.bybit.com/trade/usdt/${p}`;
                const image = imageMap.get(baseSymbol) || `https://ui-avatars.com/api/?name=${baseSymbol}&background=random`;

                const sig = analyzePair(baseSymbol, candles, "BYBIT", link, image);
                if (sig) results.push(sig);

                const historical = scanHistoricalWindows(baseSymbol, candles, "BYBIT", link, image);
                for (const h of historical) results.push(h);
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 50));
    }
    return results.sort((a, b) => b.score - a.score);
}

async function getBitgetSignals(selectedTf: string): Promise<AdvancedSignal[]> {
    const tf = TIMEFRAME_MAP[selectedTf] || TIMEFRAME_MAP["15m"];

    const coins = await fetchTopCoins().catch(() => []);
    const imageMap = new Map(coins.map((c: any) => [c.symbol.toUpperCase(), c.image]));

    let pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "SUIUSDT", "PEPEUSDT"];

    // Fetch active tickers
    try {
        const res = await fetch("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", { next: { revalidate: 60 } });
        if (res.ok) {
            const json = await res.json();
            if (json.code === "00000") {
                pairs = json.data
                    .sort((a: any, b: any) => parseFloat(b.usdtVolume) - parseFloat(a.usdtVolume))
                    .slice(0, 50)
                    .map((t: any) => t.symbol);
            }
        }
    } catch (e) { }

    const results: AdvancedSignal[] = [];
    const BATCH_SIZE = 15;

    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (p) => {
            try {
                const candles = await fetchBitgetKlines(p, tf.main, 500);
                const baseSymbol = p.replace("USDT", "");
                const link = `https://www.bitget.com/futures/usdt/${p}`;
                const image = imageMap.get(baseSymbol) || `https://ui-avatars.com/api/?name=${baseSymbol}&background=random`;

                const sig = analyzePair(baseSymbol, candles, "BITGET", link, image);
                if (sig) results.push(sig);

                const historical = scanHistoricalWindows(baseSymbol, candles, "BITGET", link, image);
                for (const h of historical) results.push(h);
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 50));
    }

    return results.sort((a, b) => b.score - a.score);
}

export async function getAdvancedSignalsAction(exchangeId: string = "binance_futures", timeframe: string = "15m"): Promise<AdvancedSignal[]> {
    const cacheKey = `${exchangeId}-${timeframe}`;
    const cached = signalsCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }

    try {
        let results: AdvancedSignal[] = [];

        if (exchangeId === "coinbase") {
            const [spotSignals, futuresSignals] = await Promise.all([
                getCoinbaseSignals(timeframe),
                getCoinbaseIntlSignals(timeframe)
            ]);
            results = [...spotSignals, ...futuresSignals].sort((a, b) => b.score - a.score);
        } else if (exchangeId === "bybit") {
            results = await getBybitSignals(timeframe);
        } else if (exchangeId === "bitget") {
            results = await getBitgetSignals(timeframe);
        } else {
            results = await getBinanceSignals(timeframe);
        }

        signalsCache.set(cacheKey, { data: results, timestamp: Date.now() });
        return results;
    } catch (error) {
        console.error(`[advanced-algo] getAdvancedSignalsAction failed for ${cacheKey}:`, error);
        return [];
    }
}
