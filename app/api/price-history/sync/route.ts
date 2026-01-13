import { getAllUniqueTickers, getExistingPriceDates, insertPriceHistoryBatch } from '@/lib/db';
import { NextResponse } from 'next/server';

const ALPACA_BASE_URL = 'https://data.alpaca.markets/v2';
const START_DATE = '2026-01-01';

interface AlpacaBar {
  t: string; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n: number; // trade count
  vw: number; // vwap
}

interface AlpacaBarsResponse {
  bars: Record<string, AlpacaBar[]>;
  next_page_token?: string;
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
  return today.toISOString().split('T')[0];
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Exclude weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function getMissingDates(allDates: string[], existingDates: Set<string>): string[] {
  return allDates.filter((date) => !existingDates.has(date));
}

async function fetchBarsFromAlpaca(
  tickers: string[],
  startDate: string,
  endDate: string,
  credentials: { apiKey: string; secretKey: string },
  feed: 'iex' | 'otc' = 'iex'
): Promise<Record<string, AlpacaBar[]>> {
  const allBars: Record<string, AlpacaBar[]> = {};

  // Initialize arrays for each ticker
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
      adjustment: 'split', // Adjust for stock splits
      feed,
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
      // For OTC feed, don't throw on errors - just return empty (some tickers may not be available)
      if (feed === 'otc') {
        console.warn(`OTC feed warning for ${tickers.join(',')}: ${errorText}`);
        return allBars;
      }
      throw new Error(`Alpaca API error (${response.status}): ${errorText}`);
    }

    const data: AlpacaBarsResponse = await response.json();

    // Merge bars into allBars
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

export async function POST() {
  try {
    const credentials = getApiCredentials();
    const tickers = getAllUniqueTickers();

    if (tickers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tickers found in database',
        synced: 0,
      });
    }

    const endDate = getTodayDate();
    const allTradingDays = getTradingDays(START_DATE, endDate);

    // Collect which dates are missing for each ticker
    const tickersToSync: { ticker: string; missingDates: string[] }[] = [];

    for (const ticker of tickers) {
      const existingDates = new Set(getExistingPriceDates(ticker, START_DATE, endDate));
      const missingDates = getMissingDates(allTradingDays, existingDates);

      if (missingDates.length > 0) {
        tickersToSync.push({ ticker, missingDates });
      }
    }

    if (tickersToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All price data is up to date',
        synced: 0,
      });
    }

    // Fetch bars for all tickers that need syncing
    const tickersNeedingData = tickersToSync.map((t) => t.ticker);

    // Find the earliest missing date across all tickers
    const allMissingDates = tickersToSync.flatMap((t) => t.missingDates);
    const earliestMissing = allMissingDates.sort()[0];

    // First, try fetching with the IEX feed (covers most US stocks)
    const bars = await fetchBarsFromAlpaca(
      tickersNeedingData,
      earliestMissing,
      endDate,
      credentials,
      'iex'
    );

    // Find tickers that returned no data from IEX (likely OTC stocks)
    const tickersWithNoData = tickersNeedingData.filter(
      (ticker) => !bars[ticker] || bars[ticker].length === 0
    );

    // Retry OTC tickers with the OTC feed
    const otcTickersFetched: string[] = [];
    if (tickersWithNoData.length > 0) {
      console.log(
        `Retrying ${tickersWithNoData.length} tickers with OTC feed: ${tickersWithNoData.join(', ')}`
      );

      const otcBars = await fetchBarsFromAlpaca(
        tickersWithNoData,
        earliestMissing,
        endDate,
        credentials,
        'otc'
      );

      // Merge OTC bars into the main bars object
      for (const [ticker, tickerBars] of Object.entries(otcBars)) {
        if (tickerBars.length > 0) {
          bars[ticker] = tickerBars;
          otcTickersFetched.push(ticker);
        }
      }
    }

    // Prepare records for batch insert
    const records: Array<{
      ticker: string;
      date: string;
      open_price: number;
      high_price: number;
      low_price: number;
      close_price: number;
      volume: number;
      vwap: number | null;
      trade_count: number | null;
    }> = [];

    for (const { ticker, missingDates } of tickersToSync) {
      const tickerBars = bars[ticker] || [];
      const missingSet = new Set(missingDates);

      for (const bar of tickerBars) {
        // Extract date from timestamp
        const date = bar.t.split('T')[0];

        // Only add if this date is in the missing dates
        if (missingSet.has(date)) {
          records.push({
            ticker,
            date,
            open_price: bar.o,
            high_price: bar.h,
            low_price: bar.l,
            close_price: bar.c,
            volume: bar.v,
            vwap: bar.vw ?? null,
            trade_count: bar.n ?? null,
          });
        }
      }
    }

    // Batch insert all records
    const insertedCount = insertPriceHistoryBatch(records);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${insertedCount} price records`,
      synced: insertedCount,
      details: {
        tickersProcessed: tickersNeedingData.length,
        recordsFound: records.length,
        recordsInserted: insertedCount,
        otcTickers: otcTickersFetched,
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
    const tickers = getAllUniqueTickers();
    const endDate = getTodayDate();
    const allTradingDays = getTradingDays(START_DATE, endDate);

    const status: Record<string, { total: number; existing: number; missing: number }> = {};

    for (const ticker of tickers) {
      const existingDates = getExistingPriceDates(ticker, START_DATE, endDate);
      const missingCount = allTradingDays.length - existingDates.length;

      status[ticker] = {
        total: allTradingDays.length,
        existing: existingDates.length,
        missing: missingCount,
      };
    }

    return NextResponse.json({
      startDate: START_DATE,
      endDate,
      tradingDays: allTradingDays.length,
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
