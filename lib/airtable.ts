import Airtable from 'airtable';
import type { FieldSet, Record as AirtableRecord } from 'airtable';

const POSITIONS_TABLE = 'Positions';
const PRICE_HISTORY_TABLE = 'Price History';

/**
 * Investment Accounts record id to set on Positions.{Account} when creating rows.
 */
const SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID = process.env.SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID?.trim();

/**
 * Airtable view that lists Schwab brokerage positions (same as “Schwab Stocks” in UI).
 * Listing uses this view because filterByFormula + ARRAYJOIN({Account}) is unreliable in the API.
 */
const SCHWAB_POSITIONS_VIEW_ID = process.env.SCHWAB_POSITIONS_VIEW_ID?.trim();

function getRequiredEnvConstant(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name} in environment`);
  }
  return value;
}

export async function getSchwabBrokerageAccountRecordId(): Promise<string> {
  return getRequiredEnvConstant(
    'SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID',
    SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID
  );
}

function positionAccountLinksToSchwab(account: string[] | undefined): boolean {
  if (!account?.length) return false;
  const currentSchwabId = getRequiredEnvConstant(
    'SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID',
    SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID
  );
  return account.includes(currentSchwabId);
}

const AIRTABLE_BATCH_SIZE = 10;
const AIRTABLE_THROTTLE_MS = 220;

function getBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  }
  return new Airtable({ apiKey }).base(baseId);
}

function tickerHistoryNamePrefixFormula(ticker: string): string {
  const escaped = ticker.toUpperCase().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `FIND('${escaped}-', {Name}) = 1`;
}

async function throttleBetweenBatches(): Promise<void> {
  await new Promise((r) => setTimeout(r, AIRTABLE_THROTTLE_MS));
}

function recordCreatedTime(record: AirtableRecord<FieldSet>): string {
  const raw = record as unknown as { _rawJson?: { createdTime?: string } };
  return raw._rawJson?.createdTime ?? new Date().toISOString();
}

/** Airtable percent field (e.g. 0.15) -> app display percent (15) */
function targetPercentFromAirtable(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n * 100;
}

/** App percent (15 for 15%) -> Airtable percent field */
function targetPercentToAirtable(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return value / 100;
}

function currentPriceFromValueAndQuantity(value: unknown, quantity: unknown): number | null {
  const q = Number(quantity);
  const v = Number(value);
  if (!q || Number.isNaN(q)) return null;
  if (value === undefined || value === null || Number.isNaN(v)) return null;
  return v / q;
}

function formatAirtableDate(d: string): string {
  return d.split('T')[0]!;
}

// --- Public types (aligned with former lib/db.ts) ---

export interface Holding {
  id: string;
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
  id: string;
  ticker: string;
  date: string;
  close_price: number;
  quantity: number;
  open_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  created_at: string;
  fetched_at: string;
}

function mapPositionRecord(record: AirtableRecord<FieldSet>): Holding {
  const ticker = String(record.get('Ticker') ?? '').toUpperCase();
  const name = String(record.get('Name') ?? '');
  const costBasis = Number(record.get('Cost Basis') ?? 0);
  const shares = Number(record.get('Quantity') ?? 0);
  const value = record.get('Value');
  const current_price = currentPriceFromValueAndQuantity(value, shares);
  const target_allocation = targetPercentFromAirtable(record.get('Target %'));
  const ts = recordCreatedTime(record);

  return {
    id: record.id,
    ticker,
    company_name: name,
    cost_basis: costBasis,
    shares,
    current_price,
    target_allocation,
    created_at: ts,
    updated_at: ts,
  };
}

export function calculateHoldingMetrics(holding: Holding): HoldingWithCalculations {
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

export async function getAllHoldings(): Promise<Holding[]> {
  const viewId = getRequiredEnvConstant('SCHWAB_POSITIONS_VIEW_ID', SCHWAB_POSITIONS_VIEW_ID);
  const base = getBase();
  const records = await base(POSITIONS_TABLE)
    .select({
      view: viewId,
      sort: [{ field: 'Ticker', direction: 'asc' }],
    })
    .all();

  return records.map(mapPositionRecord);
}

export async function getHoldingById(id: string): Promise<Holding | null> {
  const base = getBase();
  try {
    const record = await base(POSITIONS_TABLE).find(id);
    const account = record.get('Account') as string[] | undefined;
    if (!positionAccountLinksToSchwab(account)) {
      return null;
    }
    return mapPositionRecord(record);
  } catch {
    return null;
  }
}

export async function getHoldingByTicker(ticker: string): Promise<Holding | null> {
  const upper = ticker.toUpperCase();
  const holdings = await getAllHoldings();
  return holdings.find((h) => h.ticker === upper) ?? null;
}

export async function createHolding(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Promise<Holding> {
  const schwabRecordId = await getSchwabBrokerageAccountRecordId();
  const base = getBase();
  const value =
    current_price !== null && current_price !== undefined
      ? current_price * shares
      : 0;

  const fields: FieldSet = {
    Name: company_name,
    Ticker: ticker.toUpperCase(),
    Quantity: shares,
    Value: value,
    'Cost Basis': cost_basis,
    Account: [schwabRecordId],
  };
  const tp = targetPercentToAirtable(target_allocation);
  if (tp !== undefined) {
    fields['Target %'] = tp as number;
  }

  const [record] = await base(POSITIONS_TABLE).create([{ fields }], { typecast: true });
  return mapPositionRecord(record);
}

export async function updateHolding(
  id: string,
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Promise<Holding | null> {
  const existing = await getHoldingById(id);
  if (!existing) return null;

  const base = getBase();
  let valueNum: number;
  if (current_price !== null && current_price !== undefined) {
    valueNum = current_price * shares;
  } else {
    const existingRec = await base(POSITIONS_TABLE).find(id);
    valueNum = Number(existingRec.get('Value') ?? 0);
  }

  const fields: FieldSet = {
    Name: company_name,
    Ticker: ticker.toUpperCase(),
    Quantity: shares,
    Value: valueNum,
    'Cost Basis': cost_basis,
  };
  const tp = targetPercentToAirtable(target_allocation);
  if (tp !== undefined) {
    fields['Target %'] = tp as number;
  } else {
    (fields as Record<string, unknown>)['Target %'] = null;
  }

  const record = await base(POSITIONS_TABLE).update(id, fields as FieldSet, { typecast: true });
  return mapPositionRecord(record);
}

export async function updateTargetAllocation(
  id: string,
  target_allocation: number | null
): Promise<Holding | null> {
  const existing = await getHoldingById(id);
  if (!existing) return null;

  const fields: Record<string, unknown> = {};
  if (target_allocation === null) {
    fields['Target %'] = null;
  } else {
    fields['Target %'] = targetPercentToAirtable(target_allocation)!;
  }

  const record = await getBase()(POSITIONS_TABLE).update(id, fields as FieldSet, { typecast: true });
  return mapPositionRecord(record);
}

export async function upsertHoldingByTicker(
  ticker: string,
  company_name: string,
  cost_basis: number,
  shares: number,
  current_price: number | null = null,
  target_allocation: number | null = null
): Promise<Holding> {
  const existing = await getHoldingByTicker(ticker);
  if (existing) {
    const newTarget = target_allocation ?? existing.target_allocation;
    return (
      (await updateHolding(
        existing.id,
        ticker,
        company_name,
        cost_basis,
        shares,
        current_price,
        newTarget
      ))!
    );
  }
  return createHolding(ticker, company_name, cost_basis, shares, current_price, target_allocation);
}

export async function deleteHolding(id: string): Promise<boolean> {
  try {
    await getBase()(POSITIONS_TABLE).destroy(id);
    return true;
  } catch {
    return false;
  }
}

export async function deleteHoldingsWithoutTarget(): Promise<number> {
  const viewId = getRequiredEnvConstant('SCHWAB_POSITIONS_VIEW_ID', SCHWAB_POSITIONS_VIEW_ID);
  const base = getBase();
  const records = await base(POSITIONS_TABLE)
    .select({
      view: viewId,
      filterByFormula: `OR({Target %} = BLANK(), {Target %} = 0)`,
    })
    .all();

  let deleted = 0;
  for (let i = 0; i < records.length; i += AIRTABLE_BATCH_SIZE) {
    const chunk = records.slice(i, i + AIRTABLE_BATCH_SIZE).map((r) => r.id);
    await base(POSITIONS_TABLE).destroy(chunk);
    deleted += chunk.length;
    if (i + AIRTABLE_BATCH_SIZE < records.length) {
      await throttleBetweenBatches();
    }
  }
  return deleted;
}

export async function getAllUniqueTickers(): Promise<string[]> {
  const holdings = await getAllHoldings();
  return [...new Set(holdings.map((h) => h.ticker))].sort();
}

/** Latest stored trading date for a ticker, or null if none. */
export async function getLatestPriceDate(ticker: string): Promise<string | null> {
  const base = getBase();
  const records = await base(PRICE_HISTORY_TABLE)
    .select({
      filterByFormula: tickerHistoryNamePrefixFormula(ticker),
      sort: [{ field: 'Date', direction: 'desc' }],
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) return null;
  const d = records[0]!.get('Date');
  if (!d) return null;
  return typeof d === 'string' ? formatAirtableDate(d) : formatAirtableDate(String(d));
}

export type PriceHistoryBatchRow = {
  ticker: string;
  positionRecordId: string;
  date: string;
  close_price: number;
  quantity: number;
};

export async function insertPriceHistoryBatch(rows: PriceHistoryBatchRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const base = getBase();
  let created = 0;

  for (let i = 0; i < rows.length; i += AIRTABLE_BATCH_SIZE) {
    const chunk = rows.slice(i, i + AIRTABLE_BATCH_SIZE);
    const payload = chunk.map((row) => ({
      fields: {
        Name: `${row.ticker}-${row.date}`,
        Position: [row.positionRecordId],
        Date: row.date,
        'Close Price': row.close_price,
        Quantity: row.quantity,
      } as FieldSet,
    }));

    await base(PRICE_HISTORY_TABLE).create(payload, { typecast: true });
    created += chunk.length;

    if (i + AIRTABLE_BATCH_SIZE < rows.length) {
      await throttleBetweenBatches();
    }
  }

  return created;
}

function mapPriceHistoryRecord(record: AirtableRecord<FieldSet>, ticker: string): PriceHistory {
  const d = record.get('Date');
  const dateStr = d ? (typeof d === 'string' ? formatAirtableDate(d) : formatAirtableDate(String(d))) : '';
  const close = Number(record.get('Close Price') ?? 0);
  const qty = Number(record.get('Quantity') ?? 0);
  const ts = recordCreatedTime(record);

  return {
    id: record.id,
    ticker,
    date: dateStr,
    close_price: close,
    quantity: qty,
    open_price: close,
    high_price: close,
    low_price: close,
    volume: 0,
    created_at: ts,
    fetched_at: ts,
  };
}

export async function getPriceHistory(
  ticker: string,
  startDate?: string,
  endDate?: string
): Promise<PriceHistory[]> {
  const base = getBase();
  const parts: string[] = [tickerHistoryNamePrefixFormula(ticker)];
  if (startDate) {
    parts.push(`{Date} >= '${startDate}'`);
  }
  if (endDate) {
    parts.push(`{Date} <= '${endDate}'`);
  }
  const filterByFormula = parts.length === 1 ? parts[0]! : `AND(${parts.join(', ')})`;

  const records = await base(PRICE_HISTORY_TABLE)
    .select({
      filterByFormula,
      sort: [{ field: 'Date', direction: 'asc' }],
    })
    .all();

  return records.map((r) => mapPriceHistoryRecord(r, ticker.toUpperCase()));
}

/** For sync status: count trading days on or before lastDate (inclusive). */
export function countTradingDaysOnOrBefore(sortedTradingDays: string[], lastDate: string | null): number {
  if (!lastDate) return 0;
  return sortedTradingDays.filter((d) => d <= lastDate).length;
}
