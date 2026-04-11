/**
 * One-time migration: copy close_price rows from portfolio.db (SQLite) into Airtable
 * "Price History". Requires .env.local with AIRTABLE_API_KEY and AIRTABLE_BASE_ID.
 *
 * Run: npx tsx scripts/migrate-price-history.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn('No .env.local found; using existing process.env only.');
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

type SqlRow = { ticker: string; date: string; close_price: number };

async function readSqlitePriceHistory(dbPath: string): Promise<SqlRow[]> {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  try {
    const result = db.exec(
      'SELECT ticker, date, close_price FROM price_history ORDER BY ticker ASC, date ASC'
    );
    if (!result.length || !result[0].values) {
      return [];
    }
    const { columns, values } = result[0];
    return values.map((row) => {
      const obj: Record<string, string | number | null | undefined> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i] as string | number | null | undefined;
      });
      const ticker = String(obj.ticker ?? '').toUpperCase();
      const rawDate = String(obj.date ?? '');
      const date = rawDate.includes('T') ? rawDate.split('T')[0]! : rawDate;
      return {
        ticker,
        date,
        close_price: Number(obj.close_price ?? 0),
      };
    });
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const dbPath = path.join(process.cwd(), 'portfolio.db');
  if (!fs.existsSync(dbPath)) {
    console.log('No portfolio.db found; nothing to migrate.');
    process.exit(0);
  }

  const { getAllHoldings, insertPriceHistoryBatch } = await import('../lib/airtable');

  const sqliteRows = await readSqlitePriceHistory(dbPath);
  if (sqliteRows.length === 0) {
    console.log('No rows in price_history; nothing to migrate.');
    process.exit(0);
  }

  const holdings = await getAllHoldings();
  const byTicker = new Map(holdings.map((h) => [h.ticker, h]));

  const batch: Array<{
    ticker: string;
    positionRecordId: string;
    date: string;
    close_price: number;
    quantity: number;
  }> = [];

  let skipped = 0;
  for (const r of sqliteRows) {
    const h = byTicker.get(r.ticker);
    if (!h) {
      skipped++;
      continue;
    }
    batch.push({
      ticker: r.ticker,
      positionRecordId: h.id,
      date: r.date,
      close_price: r.close_price,
      quantity: h.shares,
    });
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} rows (no matching Schwab position for ticker).`);
  }

  console.log(`Inserting ${batch.length} price history rows into Airtable...`);
  const inserted = await insertPriceHistoryBatch(batch);
  console.log(`Done. Inserted ${inserted} records.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
