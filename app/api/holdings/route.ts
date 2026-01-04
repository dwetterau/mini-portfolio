import { NextRequest, NextResponse } from 'next/server';
import { getAllHoldings, createHolding, calculateHoldingMetrics } from '@/lib/db';

export async function GET() {
  try {
    const holdings = getAllHoldings();
    const holdingsWithMetrics = holdings.map(calculateHoldingMetrics);
    return NextResponse.json(holdingsWithMetrics);
  } catch (error) {
    console.error('Error fetching holdings:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, company_name, cost_basis, shares, current_price } = body;

    if (!ticker || !company_name || cost_basis === undefined || shares === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const holding = createHolding(ticker, company_name, cost_basis, shares, current_price || null);
    const holdingWithMetrics = calculateHoldingMetrics(holding);

    return NextResponse.json(holdingWithMetrics, { status: 201 });
  } catch (error) {
    console.error('Error creating holding:', error);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 });
  }
}
