import { NextRequest, NextResponse } from 'next/server';
import {
  getHoldingById,
  updateHolding,
  deleteHolding,
  calculateHoldingMetrics,
  updateHoldingDesiredPercent,
} from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const holding = getHoldingById(id);

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    return NextResponse.json(holding);
  } catch (error) {
    console.error('Error fetching holding:', error);
    return NextResponse.json({ error: 'Failed to fetch holding' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const { ticker, company_name, cost_basis, shares, current_price, desired_percent } = body;

    if (!ticker || !company_name || cost_basis === undefined || shares === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const holding = updateHolding(
      id,
      ticker,
      company_name,
      cost_basis,
      shares,
      current_price || null,
      desired_percent ?? null
    );

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const holdingWithMetrics = calculateHoldingMetrics(holding);
    return NextResponse.json(holdingWithMetrics);
  } catch (error) {
    console.error('Error updating holding:', error);
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const desiredPercent = body?.desired_percent;

    if (desiredPercent !== null && desiredPercent !== undefined && typeof desiredPercent !== 'number') {
      return NextResponse.json({ error: 'desired_percent must be a number or null' }, { status: 400 });
    }

    const holding = updateHoldingDesiredPercent(id, desiredPercent ?? null);
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    const holdingWithMetrics = calculateHoldingMetrics(holding);
    return NextResponse.json(holdingWithMetrics);
  } catch (error) {
    console.error('Error patching holding:', error);
    return NextResponse.json({ error: 'Failed to patch holding' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id);
    const deleted = deleteHolding(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting holding:', error);
    return NextResponse.json({ error: 'Failed to delete holding' }, { status: 500 });
  }
}
