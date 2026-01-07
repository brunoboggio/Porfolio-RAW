import React, { useState, useEffect, useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  LayoutDashboard, Plus, Trash2, Settings, TrendingUp, TrendingDown,
  Wallet, Activity, AlertCircle, Calendar
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchMarketData, type MarketData } from './utils/marketData';
import { calculateMetrics } from './utils/metrics';

// Utils
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
import { subscribeToPositions, addPosition, deletePosition, type Position } from './services/positions';

interface AssetPerformance extends Position {
  currentPrice: number;
  marketValue: number;
  gainLoss: number;
  gainLossPercent: number;
  sector: string;
  history: { date: string; close: number }[];
}

// Main Component
function App() {
  // State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [positions, setPositions] = useState<Position[]>([]);

  const [marketDataInfo, setMarketDataInfo] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Form State
  const [newTicker, setNewTicker] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  // Effects
  useEffect(() => {
    const unsubscribe = subscribeToPositions((data) => {
      setPositions(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  const loadData = async () => {
    setLoading(true);
    const uniqueTickers = Array.from(new Set(positions.map(p => p.ticker)));

    // In a real app we would cache this or use SWR/React Query
    const newData: Record<string, MarketData> = {};

    await Promise.all(uniqueTickers.map(async (ticker) => {
      // If we already have fresh data, skip (simple cache logic could be here)
      const data = await fetchMarketData(ticker, apiKey);
      newData[ticker] = data;
    }));

    setMarketDataInfo(newData);
    setLoading(false);
  };

  // Initial Load & Refresh
  useEffect(() => {
    if (positions.length > 0) {
      loadData();
    }
  }, [positions, apiKey]); // Reload when positions change or API key changes

  // Derived Data
  const portfolioAssets: AssetPerformance[] = useMemo(() => {
    return positions.map(pos => {
      const data = marketDataInfo[pos.ticker];
      const currentPrice = data?.price || pos.buyPrice; // Fallback to buy price if loading/failed
      const history = data?.history || [];
      const marketValue = currentPrice * pos.quantity;
      const gainLoss = marketValue - (pos.buyPrice * pos.quantity);
      const gainLossPercent = (pos.buyPrice > 0) ? (gainLoss / (pos.buyPrice * pos.quantity)) * 100 : 0;

      return {
        ...pos,
        currentPrice,
        marketValue,
        gainLoss,
        gainLossPercent,
        sector: data?.sector || 'Unknown',
        history
      };
    });
  }, [positions, marketDataInfo]);

  const totalValue = portfolioAssets.reduce((sum, a) => sum + a.marketValue, 0);
  const totalCost = portfolioAssets.reduce((sum, a) => sum + (a.buyPrice * a.quantity), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Daily Change Calculation logic
  const dailyChangeValue = portfolioAssets.reduce((sum, a) => {
    const data = marketDataInfo[a.ticker];
    if (!data) return sum;
    const changeAmt = a.currentPrice * (data.changePercent / 100);
    return sum + (changeAmt * a.quantity);
  }, 0);

  const dailyChangePercent = totalValue > 0 ? (dailyChangeValue / totalValue) * 100 : 0;

  // Portfolio History Aggregation for Chart & Metrics
  const portfolioHistory = useMemo(() => {
    const allDates = new Set<string>();

    portfolioAssets.forEach(asset => {
      asset.history.forEach(h => allDates.add(h.date));
    });

    const sortedDates = Array.from(allDates).sort();

    const history = sortedDates.map(date => {
      let value = 0;
      portfolioAssets.forEach(asset => {
        const point = asset.history.find(h => h.date === date);
        const price = point ? point.close : asset.currentPrice;

        if (date >= asset.buyDate) {
          value += price * asset.quantity;
        }
      });
      return { date, value };
    }).filter(h => h.value > 0);

    return history;
  }, [portfolioAssets]);

  const metrics = useMemo(() => calculateMetrics(portfolioHistory), [portfolioHistory]);

  const allocationData = useMemo(() => {
    return portfolioAssets.map(a => ({
      name: a.ticker,
      value: a.marketValue
    })).sort((a, b) => b.value - a.value);
  }, [portfolioAssets]);

  // Actions
  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker || !newQty || !newPrice) return;

    try {
      await addPosition({
        ticker: newTicker.toUpperCase(),
        quantity: parseFloat(newQty),
        buyPrice: parseFloat(newPrice),
        buyDate: newDate
      });

      setNewTicker('');
      setNewQty('');
      setNewPrice('');
    } catch (error) {
      console.error("Failed to add position", error);
    }
  };

  const removePosition = async (id: string) => {
    await deletePosition(id);
  };

  // Colors
  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                <LayoutDashboard className="w-6 h-6 text-emerald-500" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                QuantPortfolio
              </span>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              <Settings className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
      </nav>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top-4">
          <div className="max-w-7xl mx-auto">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              API Key (Finnhub / AlphaVantage)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API Key..."
                className="bg-slate-950 border border-slate-700 rounded-md px-4 py-2 text-sm w-full max-w-md focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                onClick={loadData}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Save & Refresh
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Leave empty to use Mock Data. Data source handles fallback automatically.
            </p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Value */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-4 -mt-4 blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-slate-400 text-sm font-medium">Net Liquidation Value</p>
                <h3 className="text-3xl font-bold text-white mt-1">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="bg-emerald-950/30 p-2 rounded-lg">
                <Wallet className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Total Assets</span>
              <span className="text-emerald-400 text-sm font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {positions.length} Pos
              </span>
            </div>
          </div>

          {/* P&L */}
          <div className={cn(
            "bg-slate-900/50 border rounded-xl p-6 relative overflow-hidden transition-all",
            totalPnL >= 0 ? "border-slate-800 hover:border-emerald-500/30" : "border-slate-800 hover:border-rose-500/30"
          )}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-slate-400 text-sm font-medium">Total P&L</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className={cn("text-3xl font-bold", totalPnL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {totalPnL >= 0 ? '+' : ''}${Math.abs(totalPnL).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
              <div className={cn("p-2 rounded-lg", totalPnL >= 0 ? "bg-emerald-950/30" : "bg-rose-950/30")}>
                {totalPnL >= 0 ? <TrendingUp className="w-6 h-6 text-emerald-500" /> : <TrendingDown className="w-6 h-6 text-rose-500" />}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-sm font-medium px-2 py-0.5 rounded-full", totalPnLPercent >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                {totalPnLPercent.toFixed(2)}%
              </span>
              <span className="text-slate-500 text-sm">All Time</span>
            </div>
          </div>

          {/* Daily Change */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 relative overflow-hidden hover:border-slate-700 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-slate-400 text-sm font-medium">Daily Variation</p>
                <h3 className={cn("text-3xl font-bold mt-1", dailyChangeValue >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {dailyChangeValue >= 0 ? '+' : ''}${Math.abs(dailyChangeValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="bg-blue-950/30 p-2 rounded-lg">
                <Activity className="w-6 h-6 text-blue-500" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-sm font-medium px-2 py-0.5 rounded-full", dailyChangePercent >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                {dailyChangePercent.toFixed(2)}%
              </span>
              <span className="text-slate-500 text-sm">Today</span>
            </div>
          </div>
        </div>

        {/* Charts & Stats Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Portfolio Performance
            </h3>
            <div className="h-[350px] w-full">
              {portfolioHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioHistory}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      tickFormatter={(str) => {
                        const d = new Date(str);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke="#64748b"
                      tickFormatter={(val) => `$${val / 1000}k`}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                      itemStyle={{ color: '#10b981' }}
                      formatter={(value?: number | string | Array<number | string>) => {
                        if (typeof value === 'number') return [`$${value.toFixed(2)}`, 'Value'];
                        return [value, 'Value'];
                      }}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600">
                  No enough history data available
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Stats & Donut */}
          <div className="space-y-6">
            {/* Quant Stats */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Risk Metrics (Quant)</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400 text-sm">Annualized Volatility</span>
                  <span className="text-white font-mono">{(metrics.volatility * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400 text-sm">Sharpe Ratio (Rf 2%)</span>
                  <span className={cn("font-mono", metrics.sharpeRatio >= 1 ? "text-emerald-400" : "text-yellow-400")}>
                    {metrics.sharpeRatio.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400 text-sm">Max Drawdown</span>
                  <span className="text-rose-400 font-mono">{(metrics.maxDrawdown * 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center">
              <h3 className="text-lg font-semibold text-white mb-4 w-full text-left">Allocation</h3>
              <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {allocationData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                      formatter={(val?: number | string | Array<number | string>) => {
                        if (typeof val === 'number') return `$${val.toFixed(0)}`;
                        return `${val}`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Text */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-slate-500 font-semibold">ASSETS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Asset Management Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Asset Table */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Your Positions</h3>
              <button onClick={loadData} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                <Activity className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium">Asset</th>
                    <th className="p-4 font-medium">Sector</th>
                    <th className="p-4 font-medium text-right">Price</th>
                    <th className="p-4 font-medium text-right">Cost Basis</th>
                    <th className="p-4 font-medium text-right">Holdings</th>
                    <th className="p-4 font-medium text-right">Value</th>
                    <th className="p-4 font-medium text-right">P&L</th>
                    <th className="p-4 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {portfolioAssets.map(asset => (
                    <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="p-4">
                        <div className="font-bold text-white">{asset.ticker}</div>
                        <div className="text-xs text-slate-500">{asset.buyDate}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                          {asset.sector}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-white">${asset.currentPrice.toFixed(2)}</div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-slate-400">${asset.buyPrice.toFixed(2)}</div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-slate-300">{asset.quantity}</div>
                      </td>
                      <td className="p-4 text-right font-medium text-white">
                        ${asset.marketValue.toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        <div className={cn("font-medium", asset.gainLoss >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {asset.gainLoss >= 0 ? '+' : ''}{asset.gainLossPercent.toFixed(2)}%
                        </div>
                        <div className="text-xs text-slate-500">
                          ${asset.gainLoss.toFixed(2)}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => removePosition(asset.id)}
                          className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {portfolioAssets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        No assets found. Add a position to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Asset Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-fit sticky top-24">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-500" />
              Add Position
            </h3>
            <form onSubmit={handleAddPosition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  placeholder="e.g. AAPL"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none uppercase placeholder:normal-case"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Buy Price</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="$0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                  />
                  <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Add to Portfolio
              </button>

              {!apiKey && (
                <div className="flex items-start gap-2 bg-slate-800/50 p-3 rounded-lg text-xs text-slate-400 mt-4">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <p>Using mock data. Add a Finnhub API Key in settings for real-time rates.</p>
                </div>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
