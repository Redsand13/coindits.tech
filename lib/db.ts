import Database from 'better-sqlite3';
import path from 'path';

// Singleton for database connection to prevent multiple connections in dev
let db: Database.Database;

const dbPath = path.join(process.cwd(), 'coinpree.db');

// Initialize DB
try {
  if (process.env.NODE_ENV === 'production') {
    db = new Database(dbPath);
  } else {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!(global as any).db) {
      (global as any).db = new Database(dbPath);
    }
    db = (global as any).db;
  }

  // Create tables if they don't exist
  // Added basic columns for CoinGecko market data
  db.exec(`
    CREATE TABLE IF NOT EXISTS coins (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      name TEXT,
      image TEXT,
      current_price REAL,
      market_cap REAL,
      market_cap_rank INTEGER,
      total_volume REAL,
      price_change_percentage_1h_in_currency REAL,
      price_change_percentage_24h_in_currency REAL,
      price_change_percentage_7d_in_currency REAL,
      circulating_supply REAL,
      total_supply REAL,
      max_supply REAL,
      ath REAL,
      ath_change_percentage REAL,
      ath_date TEXT,
      atl REAL,
      atl_change_percentage REAL,
      atl_date TEXT,
      last_updated TEXT,
      sparkline_in_7d TEXT,
      tradeable_on_binance INTEGER,
      tradeable_on_bybit INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS price_history (
      coin_id TEXT,
      price REAL,
      timestamp INTEGER,
      PRIMARY KEY (coin_id, timestamp)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      image TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS signal_history (
      id TEXT PRIMARY KEY,
      coin_id TEXT,
      symbol TEXT,
      name TEXT,
      image TEXT,
      signal_type TEXT,
      signal_name TEXT,
      timeframe TEXT,
      score INTEGER,
      price REAL,
      crossover_timestamp INTEGER,
      first_seen INTEGER,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS advanced_signals (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      entry_price REAL NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit REAL NOT NULL,
      rr_ratio REAL NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      image TEXT,
      link TEXT,
      detected_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  console.log('✅ SQLite Database initialized at ' + dbPath);
} catch (error) {
  console.error('❌ Failed to initialize SQLite database:', error);
  // Fallback to in-memory DB if file access fails (unlikely)
  db = new Database(':memory:');
}

export default db;
