'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Holding {
  id: number;
  ticker: string;
  company_name: string;
  cost_basis: number;
  cost_per_share: number;
  shares: number;
  current_price: number | null;
  current_value: number;
  total_cost: number;
  gain_loss: number;
  gain_loss_percent: number;
}

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHoldings();
  }, []);

  const fetchHoldings = async () => {
    try {
      const response = await fetch('/api/holdings');
      const data = await response.json();
      setHoldings(data);
    } catch (error) {
      console.error('Error fetching holdings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Portfolio</h1>
        <Link
          href="/add"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#0070f3',
            color: 'white',
            borderRadius: '8px',
            fontWeight: '500',
            display: 'inline-block',
          }}
        >
          Add Holding
        </Link>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Summary</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Total Cost
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {formatCurrency(totalCost)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Total Value
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {formatCurrency(totalValue)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Gain/Loss
            </div>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: totalGainLoss >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {formatCurrency(totalGainLoss)} ({formatPercent(totalGainLossPercent)})
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Ticker</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Company</th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Shares</th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Cost Basis</th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                Current Price
              </th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Total Cost</th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                Current Value
              </th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Gain/Loss</th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                  No holdings yet. Add your first holding to get started.
                </td>
              </tr>
            ) : (
              holdings.map((holding) => (
                <tr key={holding.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '1rem', fontWeight: '600' }}>{holding.ticker}</td>
                  <td style={{ padding: '1rem' }}>{holding.company_name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {holding.shares.toFixed(4)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {formatCurrency(holding.cost_per_share)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {holding.current_price ? formatCurrency(holding.current_price) : 'N/A'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {formatCurrency(holding.total_cost)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {formatCurrency(holding.current_value)}
                  </td>
                  <td
                    style={{
                      padding: '1rem',
                      textAlign: 'right',
                      color: holding.gain_loss >= 0 ? '#16a34a' : '#dc2626',
                      fontWeight: '500',
                    }}
                  >
                    {formatCurrency(holding.gain_loss)} ({formatPercent(holding.gain_loss_percent)})
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <Link
                      href={`/edit/${holding.id}`}
                      style={{
                        color: '#0070f3',
                        textDecoration: 'underline',
                        marginRight: '1rem',
                      }}
                    >
                      Edit
                    </Link>
                    <button
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this holding?')) {
                          await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' });
                          fetchHoldings();
                        }
                      }}
                      style={{
                        color: '#dc2626',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
