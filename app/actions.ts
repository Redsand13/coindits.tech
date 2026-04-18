"use server";

import {
  calculateMACrossovers,
  getCoinDetails,
  refreshMarketData,
  fetchTopCoins,
} from "@/lib/services/coingecko";
import type { MASignal } from "@/lib/services/coingecko";
import { getAdvancedSignalsAction as getAdvancedSignalsService } from "@/lib/services/advanced-algo";
import type { AdvancedSignal } from "@/lib/services/advanced-algo";
import { withCache } from "@/lib/utils/cache";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

/**
 * Get market snapshot data
 * Returns aggregated statistics about the crypto market
 */
export async function getMarketSnapshot() {
  return withCache("market_snapshot_fast", async () => {
    try {
      // Use FAST mode (limit 40 coins) for dashboard stats
      const signals = await calculateMACrossovers("1h", 40);

      // Calculate aggregate statistics from signals
      const totalCoins = signals.length;
      const bullishSignals = signals.filter((s) => s.signalType === "BUY").length;
      const bearishSignals = signals.filter(
        (s) => s.signalType === "SELL",
      ).length;

      const totalVolume = signals.reduce((sum, s) => sum + (s.volume24h || 0), 0);

      return {
        txn24h: totalCoins * 1000000,
        vol24h: `$${(totalVolume / 1e9).toFixed(2)}B`,
        gasPrice: 12,
        tokensTotal: totalCoins,
        bullishCount: bullishSignals,
        bearishCount: bearishSignals,
      };
    } catch (error) {
      console.error("Error fetching market snapshot:", error);
      return {
        txn24h: 48960297,
        vol24h: "$20.61B",
        gasPrice: 12,
        tokensTotal: 250,
        bullishCount: 0,
        bearishCount: 0,
      };
    }
  }, 60000, true); // 60s cache, persistent
}

/**
 * Get MA crossover signals (CoinGecko with Binance Spot hybrid)
 */
export async function getMACrossoverSignals(timeframe: string = "1h") {
  try {
    return await calculateMACrossovers(timeframe);
  } catch (error) {
    console.error("Error fetching MA crossover signals:", error);
    return [];
  }
}

/**
 * Get COMBINED signals from both Binance Futures AND CoinGecko/Spot
 * Merges both sources for maximum coverage
 */
export async function getCombinedSignals(timeframe: string = "1h") {
  try {
    console.log(
      `🔄 Fetching combined signals (Binance Futures + CoinGecko/Spot) for ${timeframe}...`,
    );

    // Fetch from both sources in parallel
    const [futuresSignals, spotSignals] = await Promise.all([
      getBinanceFuturesSignalsAction(timeframe),
      calculateMACrossovers(timeframe),
    ]);

    // Combine signals
    const allSignals: MASignal[] = [...futuresSignals, ...spotSignals];

    // Remove duplicates (same symbol)
    const seenSymbols = new Set<string>();
    const uniqueSignals = allSignals.filter((signal) => {
      if (seenSymbols.has(signal.symbol)) {
        return false; // Skip duplicate
      }
      seenSymbols.add(signal.symbol);
      return true;
    });

    // Sort by score (highest first), then by freshness
    uniqueSignals.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candlesAgo - b.candlesAgo;
    });

    return uniqueSignals;
  } catch (error) {
    console.error("Error fetching combined signals:", error);
    return [];
  }
}

/**
 * Get detailed coin information
 */
export async function getCoinDetailsAction(coinId: string) {
  try {
    return await getCoinDetails(coinId);
  } catch (error) {
    console.error(`Error fetching coin details for ${coinId}:`, error);
    return null;
  }
}

/**
 * Refresh market data cache
 */
export async function refreshMarketDataAction() {
  try {
    return await refreshMarketData();
  } catch (error) {
    console.error("Error refreshing market data:", error);
    return [];
  }
}

/**
 * Get Binance Futures MA crossover signals
 */
export async function getBinanceFuturesSignalsAction(timeframe: string = "1h") {
  try {
    // Dynamic import to avoid issues if file doesn't exist during build in some envs
    const { getBinanceFuturesSignals } = await import("@/lib/services/binance");
    return await getBinanceFuturesSignals(timeframe);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[getBinanceFuturesSignalsAction] ${msg}`);
    return [];
  }
}

export async function getBinanceBanStatusAction(): Promise<{ banned: boolean; banUntil: number | null }> {
  try {
    const { getBinanceBanStatus } = await import("@/lib/services/binance");
    return getBinanceBanStatus();
  } catch {
    return { banned: false, banUntil: null };
  }
}

// ─── helpers (sync, better-sqlite3 is synchronous) ───────────────────────────

function persistAdvancedSignals(signals: AdvancedSignal[], exchange: string, timeframe: string) {
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO advanced_signals
        (id, symbol, exchange, timeframe, signal_type, entry_price, stop_loss, take_profit,
         rr_ratio, score, reason, image, link, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const run = db.transaction((rows: AdvancedSignal[]) => {
      for (const s of rows) {
        // Deduplicate per 1-minute window per symbol+exchange+type+timeframe
        const bucket = Math.floor(s.timestamp / 60_000);
        const id = `${s.symbol}-${exchange}-${s.type}-${timeframe}-${bucket}`;
        stmt.run(
          id, s.symbol, exchange, timeframe, s.type,
          s.entryPrice, s.stopLoss, s.takeProfit, s.rrRatio,
          s.score, JSON.stringify(s.reason),
          s.image ?? null, s.link, s.timestamp
        );
      }
    });
    run(signals);
  } catch (err) {
    console.error("[db] persistAdvancedSignals failed:", err);
  }
}

// ─── public actions ───────────────────────────────────────────────────────────

export async function getAdvancedSignalsAction(exchangeId?: string, timeframe: string = "15m") {
  try {
    const exchange = exchangeId ?? "binance_futures";
    const results = await getAdvancedSignalsService(exchange, timeframe);
    if (results.length > 0) persistAdvancedSignals(results, exchange, timeframe);
    return results;
  } catch (error) {
    console.error("[action] getAdvancedSignalsAction failed:", error);
    return [];
  }
}

export async function getStoredAdvancedSignalsAction(exchangeId: string, timeframe: string): Promise<AdvancedSignal[]> {
  try {
    const rows = db.prepare(`
      SELECT * FROM advanced_signals
      WHERE exchange = ? AND timeframe = ?
      ORDER BY detected_at DESC
      LIMIT 1000
    `).all(exchangeId, timeframe) as any[];

    return rows.map(r => ({
      symbol:      r.symbol,
      exchange:    r.exchange,
      type:        r.signal_type as "BUY" | "SELL",
      entryPrice:  r.entry_price,
      stopLoss:    r.stop_loss,
      takeProfit:  r.take_profit,
      rrRatio:     r.rr_ratio,
      score:       r.score,
      reason:      JSON.parse(r.reason || "[]") as string[],
      timestamp:   r.detected_at,
      status:      "ACTIVE" as const,
      currentPrice: r.entry_price,
      link:        r.link ?? "",
      chartData:   [],
      image:       r.image ?? undefined,
    }));
  } catch (error) {
    console.error("[action] getStoredAdvancedSignalsAction failed:", error);
    return [];
  }
}


export async function getTop10Coins() {
  return withCache("top_10_coins_persist", async () => {
    try {
      const coins = await fetchTopCoins();
      return coins.slice(0, 10);
    } catch (error) {
      console.error("Error fetching top 10 coins:", error);
      return [];
    }
  }, 300000, true); // Cache for 5 mins, Persistent
}

export async function getLandingPageData() {
  return withCache("landing_page_data_persist", async () => {
    try {
      // Parallel fetch with DASHBOARD limits for speed
      const [marketStats, top10Coins] = await Promise.all([
        getMarketSnapshot(),
        getTop10Coins()
      ]);

      return {
        stats: marketStats,
        topCoins: top10Coins,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error fetching landing page data:", error);
      return null;
    }
  }, 30000, true); // 30s cache, persistent
}

export async function registerUser(formData: any) {
  const { name, email, password } = formData;

  try {
    // Check if user exists
    const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (existingUser) {
      return { error: "User already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, name, email, hashedPassword, Date.now());

    return { success: true };
  } catch (error) {
    console.error("Error registering user:", error);
    return { error: "Failed to register user" };
  }
}
export async function getBinanceHistoryAction(filters?: { timeframe?: string; searchQuery?: string }) {
  try {
    let query = "SELECT * FROM signal_history WHERE 1=1";
    const params: any[] = [];

    if (filters?.timeframe && filters.timeframe !== "all") {
      query += " AND timeframe = ?";
      params.push(filters.timeframe);
    }

    if (filters?.searchQuery) {
      query += " AND (symbol LIKE ? OR name LIKE ?)";
      params.push(`%${filters.searchQuery}%`, `%${filters.searchQuery}%`);
    }

    query += " ORDER BY crossover_timestamp DESC LIMIT 1000";

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => {
      const metadata = JSON.parse(row.metadata || "{}");
      return {
        ...row,
        ...metadata,
        timestamp: row.crossover_timestamp, // For compatibility
      };
    });
  } catch (error) {
    console.error("Error fetching binance history:", error);
    return [];
  }
}
