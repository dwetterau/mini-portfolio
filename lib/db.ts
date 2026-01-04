import Database from 'better-sqlite3';
import path from 'path';
import { existsSync } from 'fs';

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
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
  created_at: string;
  updated_at: string;
}

export interface HoldingWithCalculations extends Holding {
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

export function createHolding(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null
): Holding {
  const stmt = db.prepare(`
    INSERT INTO holdings (ticker, company_name, cost_basis, shares, current_price)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(ticker, company_name, cost_basis, shares, current_price);
  return getHoldingById(result.lastInsertRowid as number)!;
}

export function updateHolding(
  id: number,
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null
): Holding | null {
  const stmt = db.prepare(`
    UPDATE holdings 
    SET ticker = ?, company_name = ?, cost_basis = ?, shares = ?, current_price = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(ticker, company_name, cost_basis, shares, current_price, id);
  return getHoldingById(id);
}

export function deleteHolding(id: number): boolean {
  const stmt = db.prepare('DELETE FROM holdings WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function calculateHoldingMetrics(holding: Holding): HoldingWithCalculations {
  const totalCost = holding.cost_basis * holding.shares;
  const currentValue = holding.current_price ? holding.current_price * holding.shares : 0;
  const gainLoss = currentValue - totalCost;
  const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

  return {
    ...holding,
    current_value: currentValue,
    total_cost: totalCost,
    gain_loss: gainLoss,
    gain_loss_percent: gainLossPercent,
  };
}

export default db;
