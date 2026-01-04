import { NextRequest, NextResponse } from 'next/server';
import { calculateHoldingMetrics, createHolding, getHoldingByTicker } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawTicker = body?.ticker;
    const rawCompanyName = body?.company_name;

    if (!rawTicker || typeof rawTicker !== 'string') {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    const ticker = rawTicker.toUpperCase().trim();
    const companyName =
      typeof rawCompanyName === 'string' && rawCompanyName.trim().length > 0 ? rawCompanyName.trim() : ticker;

    const existing = getHoldingByTicker(ticker);
    if (existing) {
      return NextResponse.json(calculateHoldingMetrics(existing), { status: 200 });
    }

    // Create a placeholder holding (0 shares / 0 cost) so users can track a ticker before buying.
    const created = createHolding(ticker, companyName, 0, 0, null, null);
    return NextResponse.json(calculateHoldingMetrics(created), { status: 201 });
  } catch (error) {
    console.error('Error creating manual holding:', error);
    return NextResponse.json({ error: 'Failed to create holding' }, { status: 500 });
  }
}

