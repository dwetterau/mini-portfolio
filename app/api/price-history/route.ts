import { getAllUniqueTickers, getPriceHistory } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // If no ticker specified, return all tickers with their latest prices
    if (!ticker) {
      const tickers = getAllUniqueTickers();
      const result: Record<string, ReturnType<typeof getPriceHistory>> = {};

      for (const t of tickers) {
        result[t] = getPriceHistory(t, startDate || undefined, endDate || undefined);
      }

      return NextResponse.json(result);
    }

    // Return price history for specific ticker
    const history = getPriceHistory(
      ticker.toUpperCase(),
      startDate || undefined,
      endDate || undefined
    );

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
