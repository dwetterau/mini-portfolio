import { NextRequest, NextResponse } from 'next/server';
import { upsertHoldingByTicker, calculateHoldingMetrics } from '@/lib/db';

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { holdings } = body;

    if (!Array.isArray(holdings)) {
      return NextResponse.json({ error: 'holdings must be an array' }, { status: 400, headers: corsHeaders });
    }

    const results = [];
    const errors = [];

    for (const holding of holdings) {
      const { ticker, company_name, cost_basis, shares, current_price } = holding;

      if (!ticker || !company_name || cost_basis === undefined || shares === undefined) {
        errors.push({
          holding,
          error: 'Missing required fields',
        });
        continue;
      }

      try {
        const created = upsertHoldingByTicker(ticker, company_name, cost_basis, shares, current_price || null);
        const holdingWithMetrics = calculateHoldingMetrics(created);
        results.push(holdingWithMetrics);
      } catch (error) {
        errors.push({
          holding,
          error: error instanceof Error ? error.message : 'Failed to upsert holding',
        });
      }
    }

    return NextResponse.json(
      {
        success: results.length,
        failed: errors.length,
        holdings: results,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error creating holdings:', error);
    return NextResponse.json({ error: 'Failed to create holdings' }, { status: 500, headers: corsHeaders });
  }
}

