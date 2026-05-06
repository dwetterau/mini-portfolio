import { NextRequest, NextResponse } from 'next/server';
import { upsertHoldingByTicker, calculateHoldingMetrics } from '@/lib/airtable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRequiredNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
      if (!isRecord(holding)) {
        errors.push({
          holding,
          error: 'Holding must be an object',
        });
        continue;
      }

      const ticker = typeof holding.ticker === 'string' ? holding.ticker.trim() : '';
      const company_name =
        typeof holding.company_name === 'string' ? holding.company_name.trim() : '';
      const cost_basis = parseRequiredNumber(holding.cost_basis);
      const shares = parseRequiredNumber(holding.shares);
      const current_price = parseOptionalNumber(holding.current_price);

      if (!ticker || !company_name || cost_basis === null || shares === null) {
        errors.push({
          holding,
          error: 'Missing required fields',
        });
        continue;
      }

      try {
        const created = await upsertHoldingByTicker(
          ticker,
          company_name,
          cost_basis,
          shares,
          current_price
        );
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

