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
      desired_percent REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lightweight migrations for existing DBs
  const columns = db.prepare(`PRAGMA table_info('holdings')`).all() as Array<{ name: string }>;
  const hasDesiredPercent = columns.some((c) => c.name === 'desired_percent');
  if (!hasDesiredPercent) {
    db.exec(`ALTER TABLE holdings ADD COLUMN desired_percent REAL`);
  }
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
  desired_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface HoldingWithCalculations extends Holding {
  cost_per_share: number;
  current_value: number;
  total_cost: number;
  gain_loss: number;
  gain_loss_percent: number;
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
  desired_percent: number | null = null
): Holding {
  const stmt = db.prepare(`
    INSERT INTO holdings (ticker, company_name, cost_basis, shares, current_price, desired_percent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(ticker, company_name, cost_basis, shares, current_price, desired_percent);
  return getHoldingById(result.lastInsertRowid as number)!;
}

export function updateHolding(
  id: number,
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  desired_percent: number | null = null
): Holding | null {
  const stmt = db.prepare(`
    UPDATE holdings
    SET ticker = ?, company_name = ?, cost_basis = ?, shares = ?, current_price = ?, desired_percent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(ticker, company_name, cost_basis, shares, current_price, desired_percent, id);
  return getHoldingById(id);
}

export function upsertHoldingByTicker(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  desired_percent: number | null = null
): Holding {
  const existing = getHoldingByTicker(ticker);
  if (existing) {
    return updateHolding(existing.id, ticker, company_name, cost_basis, shares, current_price, desired_percent)!;
  } else {
    return createHolding(ticker, company_name, cost_basis, shares, current_price, desired_percent);
  }
}

export function updateHoldingDesiredPercent(id: number, desired_percent: number | null): Holding | null {
  const stmt = db.prepare(`
    UPDATE holdings
    SET desired_percent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(desired_percent, id);
  return getHoldingById(id);
}

export function deleteHolding(id: number): boolean {
  const stmt = db.prepare('DELETE FROM holdings WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
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

export default db;
