'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AddHolding() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    ticker: '',
    company_name: '',
    cost_basis: '',
    shares: '',
    current_price: '',
    target_allocation: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/holdings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: formData.ticker.toUpperCase(),
          company_name: formData.company_name,
          cost_basis: parseFloat(formData.cost_basis),
          shares: parseFloat(formData.shares),
          current_price: formData.current_price ? parseFloat(formData.current_price) : null,
          target_allocation: formData.target_allocation ? parseFloat(formData.target_allocation) : null,
        }),
      });

      if (response.ok) {
        router.push('/');
      } else {
        alert('Error creating holding');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error creating holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>Add Holding</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Ticker *
          </label>
          <input
            type="text"
            required
            value={formData.ticker}
            onChange={(e) => setFormData({ ...formData, ticker: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="AAPL"
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Company Name *
          </label>
          <input
            type="text"
            required
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="Apple Inc."
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Total Cost Basis *
          </label>
          <input
            type="number"
            step="0.01"
            required
            value={formData.cost_basis}
            onChange={(e) => setFormData({ ...formData, cost_basis: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="1500.00"
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Number of Shares *
          </label>
          <input
            type="number"
            step="0.0001"
            required
            value={formData.shares}
            onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="10"
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Current Price (per share)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.current_price}
            onChange={(e) => setFormData({ ...formData, current_price: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="175.00 (optional)"
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Target Allocation (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={formData.target_allocation}
            onChange={(e) => setFormData({ ...formData, target_allocation: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="10.0 (optional)"
          />
          <p style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Your desired percentage of this holding in your portfolio
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Adding...' : 'Add Holding'}
          </button>
        </div>
      </form>
    </main>
  );
}
