'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  target_allocation: number | null;
  portfolio_percent?: number;
  shares_to_target?: number;
}

type SortKey = keyof Holding;
type SortDirection = 'asc' | 'desc';
type TabView = 'holdings' | 'performance';

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [editingTargetValue, setEditingTargetValue] = useState<string>('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('holdings');
  const menuRef = useRef<HTMLDivElement>(null);

  // Quick add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({
    ticker: '',
    company_name: '',
    current_price: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load sort preferences and tab from localStorage on mount
  useEffect(() => {
    const savedSortKey = localStorage.getItem('portfolio-sort-key');
    const savedSortDirection = localStorage.getItem('portfolio-sort-direction');
    const savedTab = localStorage.getItem('portfolio-active-tab');
    if (savedSortKey) {
      setSortKey(savedSortKey as SortKey);
    }
    if (savedSortDirection) {
      setSortDirection(savedSortDirection as SortDirection);
    }
    if (savedTab) {
      setActiveTab(savedTab as TabView);
    }
  }, []);

  // Save sort preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('portfolio-sort-key', sortKey);
    localStorage.setItem('portfolio-sort-direction', sortDirection);
  }, [sortKey, sortDirection]);

  // Save tab preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('portfolio-active-tab', activeTab);
  }, [activeTab]);

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

  // Calculate totals and portfolio percentages
  const { totalCost, totalValue, totalGainLoss, totalGainLossPercent, holdingsWithPercent } =
    useMemo(() => {
      const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
      const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
      const totalGainLoss = totalValue - totalCost;
      const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

      const holdingsWithPercent = holdings.map((h) => {
        const portfolioPercent = totalValue > 0 ? (h.current_value / totalValue) * 100 : 0;

        // Calculate shares to buy/sell to reach target
        let sharesToTarget: number | undefined;
        if (h.target_allocation !== null && h.current_price && h.current_price > 0) {
          const targetValue = (h.target_allocation / 100) * totalValue;
          const valueDiff = targetValue - h.current_value;
          sharesToTarget = valueDiff / h.current_price;
        }

        return {
          ...h,
          portfolio_percent: portfolioPercent,
          shares_to_target: sharesToTarget,
        };
      });

      return { totalCost, totalValue, totalGainLoss, totalGainLossPercent, holdingsWithPercent };
    }, [holdings]);

  // Sorted holdings
  const sortedHoldings = useMemo(() => {
    return [...holdingsWithPercent].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [holdingsWithPercent, sortKey, sortDirection]);

  // Chart data for target allocations
  const chartData = useMemo(() => {
    return sortedHoldings
      .filter((h) => h.target_allocation !== null && h.target_allocation > 0)
      .map((h) => ({
        ticker: h.ticker,
        target: h.target_allocation || 0,
        current: h.portfolio_percent || 0,
      }))
      .sort((a, b) => b.target - a.target);
  }, [sortedHoldings]);

  // Chart data for cost basis vs current value
  const performanceChartData = useMemo(() => {
    return sortedHoldings
      .filter((h) => h.total_cost > 0 || h.current_value > 0)
      .map((h) => ({
        ticker: h.ticker,
        costBasis: h.total_cost,
        currentValue: h.current_value,
        isGain: h.current_value >= h.total_cost,
      }))
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [sortedHoldings]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span style={{ opacity: 0.3, marginLeft: '4px' }}>⇅</span>;
    }
    return <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleTargetClick = (holding: Holding) => {
    setEditingTargetId(holding.id);
    setEditingTargetValue(holding.target_allocation?.toString() || '');
  };

  const handleTargetSave = async (holdingId: number) => {
    try {
      const target = editingTargetValue.trim() === '' ? null : parseFloat(editingTargetValue);
      await fetch(`/api/holdings/${holdingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_allocation: target }),
      });
      setEditingTargetId(null);
      fetchHoldings();
    } catch (error) {
      console.error('Error updating target allocation:', error);
    }
  };

  const handleTargetKeyDown = (e: React.KeyboardEvent, holdingId: number) => {
    if (e.key === 'Enter') {
      handleTargetSave(holdingId);
    } else if (e.key === 'Escape') {
      setEditingTargetId(null);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);

    try {
      const response = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: addFormData.ticker.toUpperCase(),
          company_name: addFormData.company_name,
          cost_basis: 0,
          shares: 0,
          current_price: addFormData.current_price ? parseFloat(addFormData.current_price) : null,
        }),
      });

      if (response.ok) {
        setAddFormData({ ticker: '', company_name: '', current_price: '' });
        setShowAddForm(false);
        fetchHoldings();
      } else {
        alert('Error creating holding');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error creating holding');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (holdingId: number) => {
    if (confirm('Are you sure you want to delete this holding?')) {
      await fetch(`/api/holdings/${holdingId}`, { method: 'DELETE' });
      setOpenMenuId(null);
      fetchHoldings();
    }
  };

  const handleDeleteUntargeted = async () => {
    const count = holdings.filter(h => h.target_allocation === null || h.target_allocation === 0).length;
    if (count === 0) {
      alert('No holdings without target allocation to delete.');
      return;
    }
    if (confirm(`Delete ${count} holding${count !== 1 ? 's' : ''} without target allocation? Holdings with a target % set will be kept.`)) {
      await fetch('/api/holdings', { method: 'DELETE' });
      fetchHoldings();
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
          }}
        >
          <div style={{ fontSize: '1.25rem', color: '#666' }}>Loading portfolio...</div>
        </div>
      </main>
    );
  }

  const headerStyle = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
    padding: '0.875rem 1rem',
    textAlign: align,
    fontWeight: '600',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s',
    fontSize: '0.8125rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#374151',
  });

  const cellStyle = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
    padding: '1rem',
    textAlign: align,
  });

  const totalTargetAllocation = sortedHoldings
    .filter((h) => h.target_allocation !== null)
    .reduce((sum, h) => sum + (h.target_allocation || 0), 0);

  const hasTargetAllocations = sortedHoldings.some((h) => h.target_allocation !== null);

  return (
    <main style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>Portfolio</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {holdings.some(h => h.target_allocation === null || h.target_allocation === 0) && (
            <button
              onClick={handleDeleteUntargeted}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc2626',
                color: 'white',
                borderRadius: '8px',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#b91c1c')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
            >
              🗑️ Delete Untargeted
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: showAddForm ? '#374151' : '#059669',
              color: 'white',
              borderRadius: '8px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            {showAddForm ? 'Cancel' : '+ Quick Add'}
          </button>
        </div>
      </div>

      {/* Quick Add Form */}
      {showAddForm && (
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginBottom: '1rem', fontWeight: '600', color: '#374151' }}>
            Quick Add Holding
          </h3>
          <form onSubmit={handleQuickAdd}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '1rem',
                alignItems: 'end',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#4b5563',
                  }}
                >
                  Ticker *
                </label>
                <input
                  type="text"
                  required
                  value={addFormData.ticker}
                  onChange={(e) => setAddFormData({ ...addFormData, ticker: e.target.value })}
                  placeholder="AAPL"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9375rem',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#4b5563',
                  }}
                >
                  Company *
                </label>
                <input
                  type="text"
                  required
                  value={addFormData.company_name}
                  onChange={(e) => setAddFormData({ ...addFormData, company_name: e.target.value })}
                  placeholder="Apple Inc."
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9375rem',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#4b5563',
                  }}
                >
                  Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={addFormData.current_price}
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, current_price: e.target.value })
                  }
                  placeholder="175.00"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9375rem',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={addLoading}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: addLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  opacity: addLoading ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {addLoading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary Cards */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          border: '1px solid #e5e7eb',
        }}
      >
        <h2
          style={{
            fontSize: '1.125rem',
            marginBottom: '1rem',
            fontWeight: '600',
            color: '#374151',
          }}
        >
          Summary
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
              Total Cost
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(totalCost)}
            </div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
              Total Value
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(totalValue)}
            </div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
              Gain/Loss
            </div>
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 'bold',
                color: totalGainLoss >= 0 ? '#059669' : '#dc2626',
              }}
            >
              {formatCurrency(totalGainLoss)}
              <span style={{ fontSize: '1rem', marginLeft: '0.5rem' }}>
                ({formatPercent(totalGainLossPercent)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          backgroundColor: 'white',
          padding: '0.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb',
        }}
      >
        <button
          onClick={() => setActiveTab('holdings')}
          style={{
            flex: 1,
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9375rem',
            transition: 'all 0.15s',
            backgroundColor: activeTab === 'holdings' ? '#059669' : 'transparent',
            color: activeTab === 'holdings' ? 'white' : '#6b7280',
          }}
        >
          🎯 Target Allocation
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          style={{
            flex: 1,
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9375rem',
            transition: 'all 0.15s',
            backgroundColor: activeTab === 'performance' ? '#059669' : 'transparent',
            color: activeTab === 'performance' ? 'white' : '#6b7280',
          }}
        >
          📈 Performance
        </button>
      </div>

      {/* Target Allocation Chart */}
      {activeTab === 'holdings' && hasTargetAllocations && (
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginBottom: '1rem', fontWeight: '600', color: '#374151' }}>
            Target Allocation
          </h3>

          {/* Summary stats */}
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Total Target: </span>
              <span
                style={{
                  fontWeight: '600',
                  fontFamily: 'monospace',
                  color: Math.abs(totalTargetAllocation - 100) < 0.1 ? '#059669' : '#f59e0b',
                }}
              >
                {totalTargetAllocation.toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Unallocated: </span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
                {(100 - totalTargetAllocation).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Horizontal Bar Chart */}
          {chartData.length > 0 && (
            <div style={{ height: Math.max(200, chartData.length * 40 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    domain={[0, 'dataMax']}
                    tickFormatter={(v) => `${v}%`}
                    fontSize={12}
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    width={50}
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(1)}%`,
                      name === 'target' ? 'Target' : 'Current',
                    ]}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="current" name="Current" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.current > entry.target ? '#dc2626' : '#059669'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Performance Chart */}
      {activeTab === 'performance' && (
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              marginBottom: '1.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '1.125rem',
            }}
          >
            Cost Basis vs. Current Value
          </h3>
          {performanceChartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              No holdings with cost data to display.
            </div>
          ) : (
            <div style={{ height: Math.max(300, performanceChartData.length * 50 + 80) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={performanceChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 20 }}
                  barGap={2}
                  barCategoryGap={12}
                >
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${v.toLocaleString()}`}
                    fontSize={12}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    width={70}
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    fontWeight={600}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'costBasis' ? 'Cost Basis' : 'Current Value',
                    ]}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      padding: '0.75rem 1rem',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: '0.5rem' }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '1rem' }}
                    formatter={(value) => (
                      <span style={{ color: '#374151', fontWeight: 500 }}>
                        {value === 'costBasis' ? 'Cost Basis' : 'Current Value'}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="costBasis"
                    name="costBasis"
                    fill="#94a3b8"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                  />
                  <Bar
                    dataKey="currentValue"
                    name="currentValue"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                  >
                    {performanceChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isGain ? '#059669' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Holdings Table */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          border: '1px solid #e5e7eb',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1350px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ ...headerStyle('center'), cursor: 'default', width: '50px' }}>#</th>
                <th
                  style={headerStyle('left')}
                  onClick={() => handleSort('ticker')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Ticker <SortIcon columnKey="ticker" />
                </th>
                <th
                  style={headerStyle('left')}
                  onClick={() => handleSort('company_name')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Company <SortIcon columnKey="company_name" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('shares')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Shares <SortIcon columnKey="shares" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('current_value')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Value <SortIcon columnKey="current_value" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('gain_loss')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Gain/Loss <SortIcon columnKey="gain_loss" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('gain_loss_percent')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  G/L % <SortIcon columnKey="gain_loss_percent" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('portfolio_percent')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  % Portfolio <SortIcon columnKey="portfolio_percent" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('target_allocation')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Target % <SortIcon columnKey="target_allocation" />
                </th>
                <th
                  style={headerStyle('right')}
                  onClick={() => handleSort('shares_to_target')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  To Target <SortIcon columnKey="shares_to_target" />
                </th>
                <th style={{ ...headerStyle('center'), cursor: 'default', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}
                  >
                    No holdings yet. Add your first holding to get started.
                  </td>
                </tr>
              ) : (
                sortedHoldings.map((holding, index) => {
                  const targetDiff =
                    holding.target_allocation !== null && holding.portfolio_percent !== undefined
                      ? holding.portfolio_percent - holding.target_allocation
                      : null;

                  return (
                    <tr
                      key={holding.id}
                      style={{ borderBottom: '1px solid #e5e7eb' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td
                        style={{ ...cellStyle('center'), color: '#9ca3af', fontSize: '0.875rem' }}
                      >
                        {index + 1}
                      </td>
                      <td style={{ ...cellStyle('left'), fontWeight: '600', color: '#111827' }}>
                        {holding.ticker}
                      </td>
                      <td
                        style={{
                          ...cellStyle('left'),
                          color: '#4b5563',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {holding.company_name}
                      </td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'monospace' }}>
                        {holding.shares.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'monospace' }}>
                        {formatCurrency(holding.current_value)}
                      </td>
                      <td
                        style={{
                          ...cellStyle('right'),
                          color: holding.gain_loss >= 0 ? '#059669' : '#dc2626',
                          fontWeight: '500',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatCurrency(holding.gain_loss)}
                      </td>
                      <td
                        style={{
                          ...cellStyle('right'),
                          color: holding.gain_loss_percent >= 0 ? '#059669' : '#dc2626',
                          fontWeight: '500',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatPercent(holding.gain_loss_percent)}
                      </td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'monospace' }}>
                        <div
                          style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.625rem',
                            borderRadius: '9999px',
                            backgroundColor: '#e0e7ff',
                            color: '#3730a3',
                            fontWeight: '500',
                            fontSize: '0.875rem',
                          }}
                        >
                          {holding.portfolio_percent?.toFixed(1)}%
                        </div>
                      </td>
                      <td style={{ ...cellStyle('right') }}>
                        {editingTargetId === holding.id ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '0.25rem',
                            }}
                          >
                            <input
                              type="number"
                              step="0.1"
                              value={editingTargetValue}
                              onChange={(e) => setEditingTargetValue(e.target.value)}
                              onKeyDown={(e) => handleTargetKeyDown(e, holding.id)}
                              onBlur={() => handleTargetSave(holding.id)}
                              autoFocus
                              style={{
                                width: '60px',
                                padding: '0.25rem 0.375rem',
                                border: '2px solid #3b82f6',
                                borderRadius: '4px',
                                textAlign: 'right',
                                fontSize: '0.875rem',
                                fontFamily: 'monospace',
                              }}
                            />
                            <span style={{ color: '#6b7280' }}>%</span>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleTargetClick(holding)}
                            style={{
                              cursor: 'pointer',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px dashed #d1d5db',
                              minWidth: '60px',
                              display: 'inline-block',
                              transition: 'all 0.15s',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#3b82f6';
                              e.currentTarget.style.backgroundColor = '#eff6ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#d1d5db';
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Click to edit target allocation"
                          >
                            {holding.target_allocation !== null ? (
                              <span style={{ fontFamily: 'monospace' }}>
                                {holding.target_allocation.toFixed(1)}%
                                {targetDiff !== null && Math.abs(targetDiff) >= 0.1 && (
                                  <span
                                    style={{
                                      marginLeft: '0.25rem',
                                      fontSize: '0.75rem',
                                      color: targetDiff > 0 ? '#059669' : '#dc2626',
                                    }}
                                  >
                                    ({targetDiff > 0 ? '+' : ''}
                                    {targetDiff.toFixed(1)})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Set</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...cellStyle('right'), fontFamily: 'monospace' }}>
                        {holding.shares_to_target !== undefined ? (
                          <span
                            style={{
                              color: holding.shares_to_target >= 0 ? '#059669' : '#dc2626',
                              fontWeight: '500',
                            }}
                          >
                            {holding.shares_to_target >= 0 ? '+' : ''}
                            {holding.shares_to_target.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...cellStyle('center'), position: 'relative' }}>
                        <div ref={openMenuId === holding.id ? menuRef : null}>
                          <button
                            onClick={() =>
                              setOpenMenuId(openMenuId === holding.id ? null : holding.id)
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.5rem',
                              borderRadius: '4px',
                              fontSize: '1.25rem',
                              lineHeight: 1,
                              color: '#6b7280',
                              transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = '#f3f4f6')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = 'transparent')
                            }
                          >
                            ⋯
                          </button>
                          {openMenuId === holding.id && (
                            <div
                              style={{
                                position: 'absolute',
                                right: '1rem',
                                top: '100%',
                                backgroundColor: 'white',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                boxShadow:
                                  '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                                zIndex: 50,
                                minWidth: '120px',
                                overflow: 'hidden',
                              }}
                            >
                              <Link
                                href={`/edit/${holding.id}`}
                                style={{
                                  display: 'block',
                                  padding: '0.75rem 1rem',
                                  color: '#374151',
                                  textDecoration: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.875rem',
                                  transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor = '#f9fafb')
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.backgroundColor = 'transparent')
                                }
                              >
                                ✏️ Edit
                              </Link>
                              <button
                                onClick={() => handleDelete(holding.id)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '0.75rem 1rem',
                                  color: '#dc2626',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor = '#fef2f2')
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.backgroundColor = 'transparent')
                                }
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
