'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

interface Holding {
  id: number;
  ticker: string;
  company_name: string;
  cost_basis: number;
  shares: number;
  current_price: number | null;
  desired_percent: number | null;
}

export default function EditHolding() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [formData, setFormData] = useState({
    ticker: '',
    company_name: '',
    cost_basis: '',
    shares: '',
    current_price: '',
    desired_percent: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchHolding = useCallback(async () => {
    try {
      const response = await fetch(`/api/holdings/${id}`);
      if (response.ok) {
        const holding: Holding = await response.json();
        setFormData({
          ticker: holding.ticker,
          company_name: holding.company_name,
          cost_basis: holding.cost_basis.toString(),
          shares: holding.shares.toString(),
          current_price: holding.current_price?.toString() || '',
          desired_percent: holding.desired_percent?.toString() || '',
        });
      } else {
        alert('Error loading holding');
        router.push('/');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error loading holding');
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchHolding();
  }, [fetchHolding]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(`/api/holdings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: formData.ticker.toUpperCase(),
          company_name: formData.company_name,
          cost_basis: parseFloat(formData.cost_basis),
          shares: parseFloat(formData.shares),
          current_price: formData.current_price ? parseFloat(formData.current_price) : null,
          desired_percent: formData.desired_percent ? parseFloat(formData.desired_percent) : null,
        }),
      });

      if (response.ok) {
        router.push('/');
      } else {
        alert('Error updating holding');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error updating holding');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <main style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>Edit Holding</h1>

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
            Desired % (optional)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.desired_percent}
            onChange={(e) => setFormData({ ...formData, desired_percent: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            placeholder="10.00 (optional)"
          />
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
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </main>
  );
}
