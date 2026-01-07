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
  const result = stmt.run(ticker, company_name, cost_basis, shares, current_price, target_allocation);
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

export function updateTargetAllocation(id: number, target_allocation: number | null): Holding | null {
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
    return updateHolding(existing.id, ticker, company_name, cost_basis, shares, current_price, newTargetAllocation)!;
  } else {
    return createHolding(ticker, company_name, cost_basis, shares, current_price, target_allocation);
  }
}

export function deleteHolding(id: number): boolean {
  const stmt = db.prepare('DELETE FROM holdings WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteHoldingsWithoutTarget(): number {
  const stmt = db.prepare('DELETE FROM holdings WHERE target_allocation IS NULL OR target_allocation = 0');
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

export default db;
