'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PORTFOLIO_RESET_DATE, PORTFOLIO_RESET_DATE_LABEL } from '../lib/constants';

export const dynamic = 'force-dynamic';

// Custom hook for persisted state in localStorage
function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  // Use lazy initialization to read from localStorage
  const [value, setValue] = useState<T>(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') {
      return defaultValue;
    }
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      try {
        return JSON.parse(saved) as T;
      } catch {
        return saved as T;
      }
    }
    return defaultValue;
  });

  // Save to localStorage when value changes
  useEffect(() => {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

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
type TabView = 'holdings' | 'performance' | 'history';

interface PriceHistoryRecord {
  date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

interface PriceHistoryData {
  [ticker: string]: PriceHistoryRecord[];
}

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = usePersistedState<SortKey>('portfolio-sort-key', 'ticker');
  const [sortDirection, setSortDirection] = usePersistedState<SortDirection>('portfolio-sort-direction', 'asc');
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [editingTargetValue, setEditingTargetValue] = useState<string>('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = usePersistedState<TabView>('portfolio-active-tab', 'history');
  const menuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const tickersInitializedRef = useRef(false);

  // Quick add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({
    ticker: '',
    company_name: '',
    current_price: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // Historical price data state
  const [priceHistory, setPriceHistory] = useState<PriceHistoryData>({});
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [syncingPrices, setSyncingPrices] = useState(false);

  // Performance comparison mode - shared between performance chart and holdings table
  const [performanceCompareMode, setPerformanceCompareMode] = usePersistedState<'costBasis' | 'resetDate'>('portfolio-performance-compare-mode', 'costBasis');

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const fetchPriceHistory = useCallback(async () => {
    setPriceHistoryLoading(true);
    try {
      const response = await fetch('/api/price-history');
      const data = await response.json();
      setPriceHistory(data);
    } catch (error) {
      console.error('Error fetching price history:', error);
    } finally {
      setPriceHistoryLoading(false);
    }
  }, []);

  const syncPriceHistory = async () => {
    setSyncingPrices(true);
    try {
      const response = await fetch('/api/price-history/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        await fetchPriceHistory();
      } else {
        alert('Error syncing prices: ' + data.error);
      }
    } catch (error) {
      console.error('Error syncing price history:', error);
      alert('Error syncing price history');
    } finally {
      setSyncingPrices(false);
    }
  };

  // Fetch price history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && Object.keys(priceHistory).length === 0) {
      fetchPriceHistory();
    }
  }, [activeTab, priceHistory, fetchPriceHistory]);

  // Initialize selected tickers when holdings load (only on first load)
  useEffect(() => {
    if (holdings.length > 0 && !tickersInitializedRef.current) {
      setSelectedTickers(new Set(holdings.map((h) => h.ticker)));
      tickersInitializedRef.current = true;
    }
  }, [holdings]);

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

  // Calculate adjusted total gain/loss based on compare mode
  const { adjustedTotalGainLoss, adjustedTotalGainLossPercent, adjustedTotalCost } = useMemo(() => {
    let totalResetDateValue = 0;
    let hasAllResetDateData = true;

    holdings.forEach((h) => {
      const tickerHistory = priceHistory[h.ticker] || [];
      const resetDateRecord = tickerHistory.find((r) => r.date === PORTFOLIO_RESET_DATE);
      if (resetDateRecord) {
        totalResetDateValue += resetDateRecord.close_price * h.shares;
      } else {
        hasAllResetDateData = false;
        totalResetDateValue += h.total_cost; // Fall back to cost basis
      }
    });

    const compareValue = performanceCompareMode === 'resetDate' && hasAllResetDateData
      ? totalResetDateValue
      : totalCost;

    const gainLoss = totalValue - compareValue;
    const gainLossPercent = compareValue > 0 ? (gainLoss / compareValue) * 100 : 0;

    return {
      adjustedTotalGainLoss: gainLoss,
      adjustedTotalGainLossPercent: gainLossPercent,
      adjustedTotalCost: compareValue,
    };
  }, [holdings, priceHistory, performanceCompareMode, totalCost, totalValue]);

  // Holdings with adjusted gain/loss based on compare mode (cost basis vs reset date)
  const holdingsWithAdjustedGainLoss = useMemo(() => {
    return holdingsWithPercent.map((h) => {
      // Get reset date closing price for this ticker
      const tickerHistory = priceHistory[h.ticker] || [];
      const resetDateRecord = tickerHistory.find((r) => r.date === PORTFOLIO_RESET_DATE);
      const resetDateValue = resetDateRecord ? resetDateRecord.close_price * h.shares : null;

      // Use the selected comparison mode
      const compareValue = performanceCompareMode === 'resetDate' && resetDateValue !== null
        ? resetDateValue
        : h.total_cost;

      const adjustedGainLoss = h.current_value - compareValue;
      const adjustedGainLossPercent = compareValue > 0
        ? (adjustedGainLoss / compareValue) * 100
        : 0;

      return {
        ...h,
        adjusted_gain_loss: adjustedGainLoss,
        adjusted_gain_loss_percent: adjustedGainLossPercent,
        has_reset_date_data: resetDateValue !== null,
      };
    });
  }, [holdingsWithPercent, priceHistory, performanceCompareMode]);

  // Sorted holdings
  const sortedHoldings = useMemo(() => {
    return [...holdingsWithAdjustedGainLoss].sort((a, b) => {
      // Map gain_loss and gain_loss_percent to adjusted values for sorting
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      // Use adjusted values for gain/loss sorting
      if (sortKey === 'gain_loss') {
        aVal = a.adjusted_gain_loss;
        bVal = b.adjusted_gain_loss;
      } else if (sortKey === 'gain_loss_percent') {
        aVal = a.adjusted_gain_loss_percent;
        bVal = b.adjusted_gain_loss_percent;
      }

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
  }, [holdingsWithAdjustedGainLoss, sortKey, sortDirection]);

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
      .map((h) => {
        // Get reset date closing price for this ticker
        const tickerHistory = priceHistory[h.ticker] || [];
        const resetDateRecord = tickerHistory.find((r) => r.date === PORTFOLIO_RESET_DATE);
        const resetDateValue = resetDateRecord ? resetDateRecord.close_price * h.shares : null;

        // Use the selected comparison mode
        const compareValue = performanceCompareMode === 'resetDate' && resetDateValue !== null
          ? resetDateValue
          : h.total_cost;

        const changePercent = compareValue > 0
          ? ((h.current_value - compareValue) / compareValue) * 100
          : 0;

        return {
          ticker: h.ticker,
          costBasis: compareValue,
          currentValue: h.current_value,
          isGain: h.current_value >= compareValue,
          changePercent,
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [sortedHoldings, priceHistory, performanceCompareMode]);

  // Historical chart data - calculate portfolio value over time using current shares
  const historicalChartData = useMemo(() => {
    if (Object.keys(priceHistory).length === 0 || holdings.length === 0) {
      return [];
    }

    // Only show data from the reset date onwards
    const START_DISPLAY_DATE = PORTFOLIO_RESET_DATE;

    // Create a map of ticker -> shares for quick lookup
    const sharesMap = new Map<string, number>();
    holdings.forEach((h) => {
      sharesMap.set(h.ticker, h.shares);
    });

    // Get all unique dates across all tickers (filtered to start date)
    const allDates = new Set<string>();
    Object.values(priceHistory).forEach((records) => {
      records.forEach((r) => {
        if (r.date >= START_DISPLAY_DATE) {
          allDates.add(r.date);
        }
      });
    });

    // Convert price history to a map of date -> ticker -> price
    const priceMap = new Map<string, Map<string, number>>();
    Object.entries(priceHistory).forEach(([ticker, records]) => {
      records.forEach((r) => {
        if (!priceMap.has(r.date)) {
          priceMap.set(r.date, new Map());
        }
        priceMap.get(r.date)!.set(ticker, r.close_price);
      });
    });

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort();

    // Calculate portfolio value for each date
    let previousTotal = 0;
    let previousTickerValues: Record<string, number> = {};
    const data = sortedDates.map((date, index) => {
      const prices = priceMap.get(date) || new Map();
      let totalValue = 0;
      const tickerValues: Record<string, number> = {};
      const tickerChanges: Record<string, number> = {};

      // Calculate value for each selected ticker
      selectedTickers.forEach((ticker) => {
        const shares = sharesMap.get(ticker) || 0;
        const price = prices.get(ticker);
        if (price !== undefined && shares > 0) {
          const value = price * shares;
          tickerValues[ticker] = value;
          totalValue += value;

          // Calculate per-ticker daily change
          const prevValue = previousTickerValues[ticker];
          if (index > 0 && prevValue && prevValue > 0) {
            tickerChanges[`${ticker}_change`] = ((value - prevValue) / prevValue) * 100;
          } else {
            tickerChanges[`${ticker}_change`] = 0;
          }
        }
      });

      // Calculate daily percent change
      const dailyChange = index > 0 && previousTotal > 0
        ? ((totalValue - previousTotal) / previousTotal) * 100
        : 0;

      const result = {
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        total: totalValue,
        dailyChange,
        ...tickerValues,
        ...tickerChanges,
      };

      previousTotal = totalValue;
      previousTickerValues = { ...tickerValues };
      return result;
    });

    return data;
  }, [priceHistory, holdings, selectedTickers]);

  // Generate distinct colors for each ticker
  const tickerColors = useMemo(() => {
    const colors = [
      '#6366f1', // indigo
      '#059669', // emerald
      '#dc2626', // red
      '#f59e0b', // amber
      '#8b5cf6', // violet
      '#06b6d4', // cyan
      '#ec4899', // pink
      '#84cc16', // lime
      '#f97316', // orange
      '#14b8a6', // teal
    ];
    const colorMap = new Map<string, string>();
    holdings.forEach((h, index) => {
      colorMap.set(h.ticker, colors[index % colors.length]);
    });
    return colorMap;
  }, [holdings]);

  // Sort selected tickers by value (smallest first for stacking, so largest ends up on top)
  const sortedSelectedTickers = useMemo(() => {
    if (historicalChartData.length === 0) return Array.from(selectedTickers);

    // Get the latest data point to determine current values
    const latestData = historicalChartData[historicalChartData.length - 1] as Record<
      string,
      unknown
    >;

    return Array.from(selectedTickers).sort((a, b) => {
      const valueA = (latestData[a] as number) || 0;
      const valueB = (latestData[b] as number) || 0;
      // Sort ascending so largest is rendered last (appears on top)
      return valueA - valueB;
    });
  }, [selectedTickers, historicalChartData]);

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      const allTickers = new Set(holdings.map((h) => h.ticker));
      const allSelected = prev.size === allTickers.size &&
        Array.from(allTickers).every((t) => prev.has(t));

      // If all are selected and we click one, select only that one
      if (allSelected) {
        return new Set([ticker]);
      }

      // Otherwise toggle the ticker
      const newSet = new Set(prev);
      if (newSet.has(ticker)) {
        newSet.delete(ticker);
      } else {
        newSet.add(ticker);
      }
      return newSet;
    });
  };

  const selectAllTickers = () => {
    setSelectedTickers(new Set(holdings.map((h) => h.ticker)));
  };

  const deselectAllTickers = () => {
    setSelectedTickers(new Set());
  };

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
    const count = holdings.filter(
      (h) => h.target_allocation === null || h.target_allocation === 0
    ).length;
    if (count === 0) {
      alert('No holdings without target allocation to delete.');
      return;
    }
    if (
      confirm(
        `Delete ${count} holding${count !== 1 ? 's' : ''} without target allocation? Holdings with a target % set will be kept.`
      )
    ) {
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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Sync Prices Button */}
          <button
            onClick={syncPriceHistory}
            disabled={syncingPrices}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: syncingPrices ? '#9ca3af' : '#3b82f6',
              color: 'white',
              borderRadius: '8px',
              fontWeight: '500',
              border: 'none',
              cursor: syncingPrices ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            onMouseEnter={(e) => {
              if (!syncingPrices) e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              if (!syncingPrices) e.currentTarget.style.backgroundColor = '#3b82f6';
            }}
          >
            {syncingPrices ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid #fff',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Syncing...
              </>
            ) : (
              <>🔄 Sync Prices</>
            )}
          </button>

          {/* Overflow Menu */}
          <div style={{ position: 'relative' }} ref={headerMenuRef}>
            <button
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              style={{
                padding: '0.75rem',
                backgroundColor: showHeaderMenu ? '#374151' : '#f3f4f6',
                color: showHeaderMenu ? 'white' : '#374151',
                borderRadius: '8px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontSize: '1.25rem',
                lineHeight: 1,
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                if (!showHeaderMenu) e.currentTarget.style.backgroundColor = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                if (!showHeaderMenu) e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
            >
              ⋯
            </button>
            {showHeaderMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '0.5rem',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                  zIndex: 50,
                  minWidth: '180px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => {
                    setShowAddForm(!showAddForm);
                    setShowHeaderMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    color: '#374151',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textAlign: 'left',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  ➕ Quick Add Holding
                </button>
                <Link
                  href="/add"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    color: '#374151',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => setShowHeaderMenu(false)}
                >
                  📝 Full Add Form
                </Link>
                {holdings.some(
                  (h) => h.target_allocation === null || h.target_allocation === 0
                ) && (
                  <>
                    <div
                      style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '0.25rem 0' }}
                    />
                    <button
                      onClick={() => {
                        handleDeleteUntargeted();
                        setShowHeaderMenu(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.75rem 1rem',
                        color: '#dc2626',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        textAlign: 'left',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      🗑️ Delete Untargeted
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
              {performanceCompareMode === 'resetDate' ? PORTFOLIO_RESET_DATE_LABEL : 'Total Cost'}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(adjustedTotalCost)}
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
                color: adjustedTotalGainLoss >= 0 ? '#059669' : '#dc2626',
              }}
            >
              {formatCurrency(adjustedTotalGainLoss)}
              <span style={{ fontSize: '1rem', marginLeft: '0.5rem' }}>
                ({formatPercent(adjustedTotalGainLossPercent)})
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
          onClick={() => setActiveTab('history')}
          style={{
            flex: 1,
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9375rem',
            transition: 'all 0.15s',
            backgroundColor: activeTab === 'history' ? '#059669' : 'transparent',
            color: activeTab === 'history' ? 'white' : '#6b7280',
          }}
        >
          📊 Historical
        </button>
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
                    formatter={(value, name) => [
                      `${(value as number).toFixed(1)}%`,
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
                        fill={Math.abs(entry.current - entry.target) > 1 ? '#dc2626' : '#059669'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontWeight: '600',
                color: '#374151',
                fontSize: '1.125rem',
                margin: 0,
              }}
            >
              {performanceCompareMode === 'costBasis' ? 'Cost Basis' : PORTFOLIO_RESET_DATE_LABEL} vs. Current Value
            </h3>
            <div
              style={{
                display: 'flex',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '4px',
              }}
            >
              <button
                onClick={() => setPerformanceCompareMode('costBasis')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  transition: 'all 0.15s',
                  backgroundColor: performanceCompareMode === 'costBasis' ? '#059669' : 'transparent',
                  color: performanceCompareMode === 'costBasis' ? 'white' : '#6b7280',
                }}
              >
                Cost Basis
              </button>
              <button
                onClick={() => setPerformanceCompareMode('resetDate')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  transition: 'all 0.15s',
                  backgroundColor: performanceCompareMode === 'resetDate' ? '#059669' : 'transparent',
                  color: performanceCompareMode === 'resetDate' ? 'white' : '#6b7280',
                }}
              >
                {PORTFOLIO_RESET_DATE_LABEL}
              </button>
            </div>
          </div>
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
                    formatter={(value, name, props) => {
                      const dataPoint = props.payload as { changePercent: number; isGain: boolean };
                      const label = name === 'costBasis'
                        ? (performanceCompareMode === 'resetDate' ? PORTFOLIO_RESET_DATE_LABEL : 'Cost Basis')
                        : 'Current Value';

                      // Only show percentage on the Current Value line
                      if (name === 'currentValue') {
                        const changePercent = dataPoint.changePercent;
                        const changeColor = changePercent >= 0 ? '#059669' : '#dc2626';
                        return [
                          <span key="current">
                            {formatCurrency(value as number)}
                            <span style={{ color: changeColor, fontWeight: 600, marginLeft: '6px' }}>
                              ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
                            </span>
                          </span>,
                          label,
                        ];
                      }

                      return [formatCurrency(value as number), label];
                    }}
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
                        {value === 'costBasis'
                          ? (performanceCompareMode === 'resetDate' ? PORTFOLIO_RESET_DATE_LABEL : 'Cost Basis')
                          : 'Current Value'}
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

      {/* Historical Performance View */}
      {activeTab === 'history' && (
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
              fontWeight: '600',
              color: '#374151',
              fontSize: '1.125rem',
              marginBottom: '1.5rem',
            }}
          >
            Historical Portfolio Value (2026)
          </h3>

          {/* Ticker Selector */}
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <span style={{ fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>
                Select Stocks to Display
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={selectAllTickers}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    backgroundColor: '#e0e7ff',
                    color: '#3730a3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllTickers}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {holdings.map((h) => {
                const isSelected = selectedTickers.has(h.ticker);
                const color = tickerColors.get(h.ticker) || '#6366f1';
                return (
                  <button
                    key={h.ticker}
                    onClick={() => toggleTicker(h.ticker)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.8125rem',
                      fontWeight: '600',
                      border: '2px solid',
                      borderColor: isSelected ? color : '#d1d5db',
                      backgroundColor: isSelected ? color : 'white',
                      color: isSelected ? 'white' : '#6b7280',
                      borderRadius: '9999px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {h.ticker}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart */}
          {priceHistoryLoading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '4rem',
                color: '#6b7280',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '32px',
                  height: '32px',
                  border: '3px solid #e5e7eb',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '1rem',
                }}
              />
              <div>Loading price history...</div>
            </div>
          ) : historicalChartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <div style={{ marginBottom: '0.5rem', fontWeight: '500' }}>
                No historical price data available
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                Click &quot;Sync Prices&quot; to fetch historical data from Alpaca
              </div>
            </div>
          ) : (
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={historicalChartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  stackOffset="none"
                >
                  <defs>
                    {sortedSelectedTickers.map((ticker) => (
                      <linearGradient
                        key={`gradient-${ticker}`}
                        id={`gradient-${ticker}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={tickerColors.get(ticker)} stopOpacity={0.9} />
                        <stop offset="95%" stopColor={tickerColors.get(ticker)} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="displayDate"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value, name, props) => {
                      const dataPoint = props.payload as Record<string, number>;
                      const tickerChange = dataPoint[`${name}_change`] || 0;
                      const changeColor = tickerChange >= 0 ? '#059669' : '#dc2626';
                      const changeText = tickerChange !== 0
                        ? ` (${tickerChange >= 0 ? '+' : ''}${tickerChange.toFixed(2)}%)`
                        : '';
                      return [
                        <span key={name as string}>
                          {formatCurrency(value as number)}
                          {changeText && (
                            <span style={{ color: changeColor, fontWeight: 600, marginLeft: '4px' }}>
                              {changeText}
                            </span>
                          )}
                        </span>,
                        name
                      ];
                    }}
                    labelFormatter={(label, payload) => {
                      const total = payload?.reduce(
                        (sum, item) => sum + ((item.value as number) || 0),
                        0
                      );
                      // Get daily change from the payload's first item
                      const dataPoint = payload?.[0]?.payload as { dailyChange?: number } | undefined;
                      const dailyChange = dataPoint?.dailyChange || 0;
                      const changeColor = dailyChange >= 0 ? '#059669' : '#dc2626';
                      const changeText = dailyChange !== 0
                        ? ` (${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(2)}%)`
                        : '';
                      return (
                        <span>
                          {label} — Total: {formatCurrency(total || 0)}
                          {changeText && (
                            <span style={{ color: changeColor, fontWeight: 600 }}>
                              {changeText}
                            </span>
                          )}
                        </span>
                      );
                    }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      padding: '0.75rem 1rem',
                    }}
                    wrapperStyle={{ zIndex: 1000 }}
                    itemSorter={(item) => -(item.value as number)}
                  />
                  <Legend wrapperStyle={{ position: 'relative', zIndex: 1 }} />
                  {/* Stacked areas for each stock - sorted smallest to largest so biggest is on top */}
                  {sortedSelectedTickers.map((ticker) => (
                    <Area
                      key={ticker}
                      type="monotone"
                      dataKey={ticker}
                      name={ticker}
                      stackId="portfolio"
                      stroke={tickerColors.get(ticker)}
                      strokeWidth={1}
                      fill={`url(#gradient-${ticker})`}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Stats row */}
          {historicalChartData.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginTop: '1.5rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  Start Value (Jan 8)
                </div>
                <div style={{ fontWeight: '600', fontSize: '1.125rem', fontFamily: 'monospace' }}>
                  {formatCurrency(historicalChartData[0]?.total || 0)}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  Current Value
                </div>
                <div style={{ fontWeight: '600', fontSize: '1.125rem', fontFamily: 'monospace' }}>
                  {formatCurrency(historicalChartData[historicalChartData.length - 1]?.total || 0)}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  Change
                </div>
                {(() => {
                  const startVal = historicalChartData[0]?.total || 0;
                  const endVal = historicalChartData[historicalChartData.length - 1]?.total || 0;
                  const change = endVal - startVal;
                  const changePercent = startVal > 0 ? (change / startVal) * 100 : 0;
                  return (
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '1.125rem',
                        fontFamily: 'monospace',
                        color: change >= 0 ? '#059669' : '#dc2626',
                      }}
                    >
                      {formatCurrency(change)}{' '}
                      <span style={{ fontSize: '0.875rem' }}>({formatPercent(changePercent)})</span>
                    </div>
                  );
                })()}
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  Data Points
                </div>
                <div style={{ fontWeight: '600', fontSize: '1.125rem', fontFamily: 'monospace' }}>
                  {historicalChartData.length} days
                </div>
              </div>
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
        {/* Holdings Table Header with Compare Mode Toggle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#fafafa',
          }}
        >
          <h3
            style={{
              fontWeight: '600',
              color: '#374151',
              fontSize: '1rem',
              margin: 0,
            }}
          >
            Holdings
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Compare to:</span>
            <div
              style={{
                display: 'flex',
                backgroundColor: '#e5e7eb',
                borderRadius: '6px',
                padding: '2px',
              }}
            >
              <button
                onClick={() => setPerformanceCompareMode('costBasis')}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.8125rem',
                  transition: 'all 0.15s',
                  backgroundColor: performanceCompareMode === 'costBasis' ? '#059669' : 'transparent',
                  color: performanceCompareMode === 'costBasis' ? 'white' : '#6b7280',
                }}
              >
                Cost Basis
              </button>
              <button
                onClick={() => setPerformanceCompareMode('resetDate')}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.8125rem',
                  transition: 'all 0.15s',
                  backgroundColor: performanceCompareMode === 'resetDate' ? '#059669' : 'transparent',
                  color: performanceCompareMode === 'resetDate' ? 'white' : '#6b7280',
                }}
              >
                {PORTFOLIO_RESET_DATE_LABEL}
              </button>
            </div>
          </div>
        </div>
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
                          color: holding.adjusted_gain_loss >= 0 ? '#059669' : '#dc2626',
                          fontWeight: '500',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatCurrency(holding.adjusted_gain_loss)}
                      </td>
                      <td
                        style={{
                          ...cellStyle('right'),
                          color: holding.adjusted_gain_loss_percent >= 0 ? '#059669' : '#dc2626',
                          fontWeight: '500',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatPercent(holding.adjusted_gain_loss_percent)}
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
