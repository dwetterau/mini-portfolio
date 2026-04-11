import {
  countTradingDaysOnOrBefore,
  getAllHoldings,
  getLatestPriceDate,
  insertPriceHistoryBatch,
} from '@/lib/airtable';
import { NextResponse } from 'next/server';

const ALPACA_BASE_URL = 'https://data.alpaca.markets/v2';
const START_DATE = process.env.PRICE_HISTORY_START_DATE || '2026-01-01';

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
}

interface AlpacaBarsResponse {
  bars: Record<string, AlpacaBar[]>;
  next_page_token?: string;
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { symbol: string };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

function getApiCredentials(): { apiKey: string; secretKey: string } {
  const apiKey = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!apiKey) {
    throw new Error('ALPACA_API_KEY environment variable is not set in .env.local');
  }
  if (!secretKey) {
    throw new Error('ALPACA_SECRET_KEY environment variable is not set in .env.local');
  }

  return { apiKey, secretKey };
}

function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0]!;
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]!);
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function fetchBarsFromAlpaca(
  tickers: string[],
  startDate: string,
  endDate: string,
  credentials: { apiKey: string; secretKey: string }
): Promise<Record<string, AlpacaBar[]>> {
  const allBars: Record<string, AlpacaBar[]> = {};

  for (const ticker of tickers) {
    allBars[ticker] = [];
  }

  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      symbols: tickers.join(','),
      start: `${startDate}T00:00:00Z`,
      end: `${endDate}T23:59:59Z`,
      timeframe: '1Day',
      limit: '10000',
      adjustment: 'split',
      feed: 'iex',
    });

    if (nextPageToken) {
      params.set('page_token', nextPageToken);
    }

    const url = `${ALPACA_BASE_URL}/stocks/bars?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': credentials.apiKey,
        'APCA-API-SECRET-KEY': credentials.secretKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alpaca API error (${response.status}): ${errorText}`);
    }

    const data: AlpacaBarsResponse = await response.json();

    if (data.bars) {
      for (const [ticker, bars] of Object.entries(data.bars)) {
        if (allBars[ticker]) {
          allBars[ticker].push(...bars);
        } else {
          allBars[ticker] = bars;
        }
      }
    }

    nextPageToken = data.next_page_token;
  } while (nextPageToken);

  return allBars;
}

async function fetchBarsFromYahoo(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<AlpacaBar[]> {
  const start = Math.floor(new Date(startDate).getTime() / 1000);
  const end = Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${start}&period2=${end}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Yahoo Finance error for ${ticker}: ${response.status}`);
      return [];
    }

    const data: YahooChartResponse = await response.json();

    if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
      console.warn(`Yahoo Finance: No data for ${ticker}`);
      return [];
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];

    const bars: AlpacaBar[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      const volume = quote.volume[i];

      if (open == null || high == null || low == null || close == null) {
        continue;
      }

      const date = new Date(timestamps[i] * 1000);
      const isoDate = date.toISOString();

      bars.push({
        t: isoDate,
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume ?? 0,
        n: 0,
        vw: 0,
      });
    }

    return bars;
  } catch (error) {
    console.error(`Yahoo Finance fetch error for ${ticker}:`, error);
    return [];
  }
}

type PositionSyncPlan = {
  ticker: string;
  positionRecordId: string;
  shares: number;
  missingDates: string[];
};

export async function POST() {
  try {
    const credentials = getApiCredentials();
    const holdings = await getAllHoldings();

    if (holdings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No holdings found',
        synced: 0,
      });
    }

    const endDate = getTodayDate();
    const allTradingDays = getTradingDays(START_DATE, endDate);

    const positionsToSync: PositionSyncPlan[] = [];

    for (const h of holdings) {
      const latest = await getLatestPriceDate(h.ticker);
      let start = latest ? addOneDay(latest) : START_DATE;
      if (start < START_DATE) start = START_DATE;
      const missingDates = allTradingDays.filter((d) => d >= start && d <= endDate);

      if (missingDates.length > 0) {
        positionsToSync.push({
          ticker: h.ticker,
          positionRecordId: h.id,
          shares: h.shares,
          missingDates,
        });
      }
    }

    if (positionsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All price data is up to date',
        synced: 0,
      });
    }

    const tickersNeedingData = [...new Set(positionsToSync.map((p) => p.ticker))];
    const allMissingDates = positionsToSync.flatMap((p) => p.missingDates);
    const earliestMissing = allMissingDates.sort()[0]!;

    const bars = await fetchBarsFromAlpaca(tickersNeedingData, earliestMissing, endDate, credentials);

    const tickersWithNoData = tickersNeedingData.filter(
      (ticker) => !bars[ticker] || bars[ticker].length === 0
    );

    const alpacaDatesSet = new Set<string>();
    for (const [ticker, tickerBars] of Object.entries(bars)) {
      if (tickersWithNoData.includes(ticker)) continue;
      for (const bar of tickerBars) {
        alpacaDatesSet.add(bar.t.split('T')[0]!);
      }
    }

    const yahooTickersFetched: string[] = [];
    if (tickersWithNoData.length > 0 && alpacaDatesSet.size > 0) {
      console.log(
        `Fetching ${tickersWithNoData.length} tickers from Yahoo Finance: ${tickersWithNoData.join(', ')}`
      );

      for (const ticker of tickersWithNoData) {
        const yahooBars = await fetchBarsFromYahoo(ticker, earliestMissing, endDate);
        const filteredBars = yahooBars.filter((bar) => alpacaDatesSet.has(bar.t.split('T')[0]!));
        if (filteredBars.length > 0) {
          bars[ticker] = filteredBars;
          yahooTickersFetched.push(ticker);
        }
      }
    } else if (tickersWithNoData.length > 0) {
      console.log(
        `All tickers need Yahoo Finance (no Alpaca data): ${tickersWithNoData.join(', ')}`
      );

      for (const ticker of tickersWithNoData) {
        const yahooBars = await fetchBarsFromYahoo(ticker, earliestMissing, endDate);
        if (yahooBars.length > 0) {
          bars[ticker] = yahooBars;
          yahooTickersFetched.push(ticker);
        }
      }
    }

    const airTableRows: Array<{
      ticker: string;
      positionRecordId: string;
      date: string;
      close_price: number;
      quantity: number;
    }> = [];

    for (const plan of positionsToSync) {
      const tickerBars = bars[plan.ticker] || [];
      const missingSet = new Set(plan.missingDates);

      for (const bar of tickerBars) {
        const date = bar.t.split('T')[0]!;
        if (missingSet.has(date)) {
          airTableRows.push({
            ticker: plan.ticker,
            positionRecordId: plan.positionRecordId,
            date,
            close_price: bar.c,
            quantity: plan.shares,
          });
        }
      }
    }

    const insertedCount = await insertPriceHistoryBatch(airTableRows);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${insertedCount} price records`,
      synced: insertedCount,
      details: {
        tickersProcessed: tickersNeedingData.length,
        recordsFound: airTableRows.length,
        recordsInserted: insertedCount,
        yahooTickers: yahooTickersFetched,
      },
    });
  } catch (error) {
    console.error('Error syncing price history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const holdings = await getAllHoldings();
    const endDate = getTodayDate();
    const allTradingDays = getTradingDays(START_DATE, endDate);
    const sorted = [...allTradingDays].sort();

    const byTicker = new Map<string, typeof holdings>();
    for (const h of holdings) {
      const list = byTicker.get(h.ticker) ?? [];
      list.push(h);
      byTicker.set(h.ticker, list);
    }

    const status: Record<string, { total: number; existing: number; missing: number }> = {};

    for (const [ticker, list] of byTicker) {
      let minExisting = sorted.length;
      for (const h of list) {
        const latest = await getLatestPriceDate(h.ticker);
        const c = countTradingDaysOnOrBefore(sorted, latest);
        minExisting = Math.min(minExisting, c);
      }
      status[ticker] = {
        total: sorted.length,
        existing: minExisting,
        missing: sorted.length - minExisting,
      };
    }

    return NextResponse.json({
      startDate: START_DATE,
      endDate,
      tradingDays: sorted.length,
      tickers: status,
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
