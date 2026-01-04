import { NextRequest, NextResponse } from 'next/server';
import { getAllHoldings, createHolding, calculateHoldingMetrics } from '@/lib/db';

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const holdings = getAllHoldings();
    const holdingsWithMetrics = holdings.map(calculateHoldingMetrics);
    return NextResponse.json(holdingsWithMetrics, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, company_name, cost_basis, shares, current_price, target_allocation } = body;

    if (!ticker || !company_name || cost_basis === undefined || shares === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const holding = createHolding(ticker, company_name, cost_basis, shares, current_price || null, target_allocation ?? null);
    const holdingWithMetrics = calculateHoldingMetrics(holding);

    return NextResponse.json(holdingWithMetrics, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Error creating holding:', error);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500, headers: corsHeaders });
  }
}
