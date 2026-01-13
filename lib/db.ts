import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'portfolio.db');
const db = new Database(dbPath);

// Initialize database schema if it doesn't exist
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      company_name TEXT NOT NULL,
      cost_basis REAL NOT NULL,
      shares REAL NOT NULL,
      current_price REAL,
      target_allocation REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add target_allocation column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE holdings ADD COLUMN target_allocation REAL`);
  } catch {
    // Column already exists, ignore error
  }

  // Create price_history table for storing historical stock prices
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      open_price REAL NOT NULL,
      high_price REAL NOT NULL,
      low_price REAL NOT NULL,
      close_price REAL NOT NULL,
      volume INTEGER NOT NULL,
      vwap REAL,
      trade_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ticker, date)
    )
  `);

  // Add fetched_at column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE price_history ADD COLUMN fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch {
    // Column already exists, ignore error
  }

  // Create index for faster queries on ticker and date
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date
    ON price_history(ticker, date)
  `);
}

// Initialize on import
initDatabase();

export interface Holding {
  id: number;
  ticker: string;
  company_name: string;
  cost_basis: number;
  shares: number;
  current_price: number | null;
  target_allocation: number | null;
  created_at: string;
  updated_at: string;
}

export interface HoldingWithCalculations extends Holding {
  cost_per_share: number;
  current_value: number;
  total_cost: number;
  gain_loss: number;
  gain_loss_percent: number;
  portfolio_percent?: number;
}

export interface PriceHistory {
  id: number;
  ticker: string;
  date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
  vwap: number | null;
  trade_count: number | null;
  created_at: string;
  fetched_at: string;
}

export function getAllHoldings(): Holding[] {
  const stmt = db.prepare('SELECT * FROM holdings ORDER BY ticker');
  return stmt.all() as Holding[];
}

export function getHoldingById(id: number): Holding | null {
  const stmt = db.prepare('SELECT * FROM holdings WHERE id = ?');
  const result = stmt.get(id) as Holding | undefined;
  return result || null;
}

export function getHoldingByTicker(ticker: string): Holding | null {
  const stmt = db.prepare('SELECT * FROM holdings WHERE ticker = ?');
  const result = stmt.get(ticker.toUpperCase()) as Holding | undefined;
  return result || null;
}

export function createHolding(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Holding {
  const stmt = db.prepare(`
    INSERT INTO holdings (ticker, company_name, cost_basis, shares, current_price, target_allocation)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    ticker,
    company_name,
    cost_basis,
    shares,
    current_price,
    target_allocation
  );
  return getHoldingById(result.lastInsertRowid as number)!;
}

export function updateHolding(
  id: number,
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Holding | null {
  const stmt = db.prepare(`
    UPDATE holdings
    SET ticker = ?, company_name = ?, cost_basis = ?, shares = ?, current_price = ?, target_allocation = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(ticker, company_name, cost_basis, shares, current_price, target_allocation, id);
  return getHoldingById(id);
}

export function updateTargetAllocation(
  id: number,
  target_allocation: number | null
): Holding | null {
  const stmt = db.prepare(`
    UPDATE holdings
    SET target_allocation = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(target_allocation, id);
  return getHoldingById(id);
}

export function upsertHoldingByTicker(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Holding {
  const existing = getHoldingByTicker(ticker);
  if (existing) {
    // Preserve existing target_allocation if not provided
    const newTargetAllocation = target_allocation ?? existing.target_allocation;
    return updateHolding(
      existing.id,
      ticker,
      company_name,
      cost_basis,
      shares,
      current_price,
      newTargetAllocation
    )!;
  } else {
    return createHolding(
      ticker,
      company_name,
      cost_basis,
      shares,
      current_price,
      target_allocation
    );
  }
}

export function deleteHolding(id: number): boolean {
  const stmt = db.prepare('DELETE FROM holdings WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteHoldingsWithoutTarget(): number {
  const stmt = db.prepare(
    'DELETE FROM holdings WHERE target_allocation IS NULL OR target_allocation = 0'
  );
  const result = stmt.run();
  return result.changes;
}

export function calculateHoldingMetrics(holding: Holding): HoldingWithCalculations {
  // cost_basis in the DB is the TOTAL cost basis (not per-share)
  const totalCost = holding.cost_basis;
  const costPerShare = holding.shares > 0 ? totalCost / holding.shares : 0;
  const currentValue = holding.current_price ? holding.current_price * holding.shares : 0;
  const gainLoss = currentValue - totalCost;
  const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

  return {
    ...holding,
    cost_per_share: costPerShare,
    current_value: currentValue,
    total_cost: totalCost,
    gain_loss: gainLoss,
    gain_loss_percent: gainLossPercent,
  };
}

// ==================== Price History Functions ====================

export function getAllUniqueTickers(): string[] {
  const stmt = db.prepare('SELECT DISTINCT ticker FROM holdings ORDER BY ticker');
  const results = stmt.all() as { ticker: string }[];
  return results.map((r) => r.ticker);
}

export function getExistingPriceDates(
  ticker: string,
  startDate: string,
  endDate: string
): string[] {
  // Exclude dates that were fetched today since they may be incomplete
  // (e.g., market not closed yet, or failed OTC fetch that needs retry)
  const today = new Date().toISOString().split('T')[0];

  const stmt = db.prepare(`
    SELECT date FROM price_history
    WHERE ticker = ? AND date >= ? AND date <= ?
      AND DATE(fetched_at) < DATE(?)
    ORDER BY date
  `);
  const results = stmt.all(ticker, startDate, endDate, today) as { date: string }[];
  return results.map((r) => r.date);
}

export function insertPriceHistory(data: {
  ticker: string;
  date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
  vwap?: number | null;
  trade_count?: number | null;
}): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_history
    (ticker, date, open_price, high_price, low_price, close_price, volume, vwap, trade_count, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker, date) DO UPDATE SET
      open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      volume = excluded.volume,
      vwap = excluded.vwap,
      trade_count = excluded.trade_count,
      fetched_at = excluded.fetched_at
  `);
  stmt.run(
    data.ticker,
    data.date,
    data.open_price,
    data.high_price,
    data.low_price,
    data.close_price,
    data.volume,
    data.vwap ?? null,
    data.trade_count ?? null,
    now
  );
}

export function insertPriceHistoryBatch(
  records: Array<{
    ticker: string;
    date: string;
    open_price: number;
    high_price: number;
    low_price: number;
    close_price: number;
    volume: number;
    vwap?: number | null;
    trade_count?: number | null;
  }>
): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_history
    (ticker, date, open_price, high_price, low_price, close_price, volume, vwap, trade_count, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker, date) DO UPDATE SET
      open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      volume = excluded.volume,
      vwap = excluded.vwap,
      trade_count = excluded.trade_count,
      fetched_at = excluded.fetched_at
  `);

  const insertMany = db.transaction((items: typeof records) => {
    let upserted = 0;
    for (const item of items) {
      const result = stmt.run(
        item.ticker,
        item.date,
        item.open_price,
        item.high_price,
        item.low_price,
        item.close_price,
        item.volume,
        item.vwap ?? null,
        item.trade_count ?? null,
        now
      );
      if (result.changes > 0) upserted++;
    }
    return upserted;
  });

  return insertMany(records);
}

export function getPriceHistory(
  ticker: string,
  startDate?: string,
  endDate?: string
): PriceHistory[] {
  let query = 'SELECT * FROM price_history WHERE ticker = ?';
  const params: (string | number)[] = [ticker];

  if (startDate) {
    query += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND date <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY date';

  const stmt = db.prepare(query);
  return stmt.all(...params) as PriceHistory[];
}

export function getLatestPriceDate(ticker: string): string | null {
  const stmt = db.prepare(`
    SELECT MAX(date) as latest_date FROM price_history WHERE ticker = ?
  `);
  const result = stmt.get(ticker) as { latest_date: string | null } | undefined;
  return result?.latest_date ?? null;
}

export default db;
