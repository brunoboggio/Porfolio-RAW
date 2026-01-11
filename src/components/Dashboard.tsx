import React, { useState, useEffect, useMemo } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
    Plus, Trash2, TrendingUp, TrendingDown,
    Wallet, Activity, AlertCircle, Calendar, Filter, DollarSign,
    ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchMarketData, type MarketData } from '../utils/marketData';
import { calculateMetrics } from '../utils/metrics';
import { getExchangeRate, getCurrencySymbol, SUPPORTED_CURRENCIES } from '../utils/forex';
import { SymbolSearch } from './SymbolSearch';
import { subscribeToPositions, addPosition, deletePosition, updatePosition, type Position } from '../services/positions';

import { logOperation, subscribeToOperations, type Operation } from '../services/operations';
import { subscribeToSettings, updateUserSettings, type UserSettings } from '../services/settings';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface AssetPerformance extends Position {
    currentPrice: number;
    currentPriceUSD: number;  // Current price converted to USD
    marketValue: number;       // Market value in USD
    gainLoss: number;          // Gain/Loss in USD
    gainLossPercent: number;
    sector: string;
    history: { date: string; close: number }[];
    isUnknown?: boolean;
    assetCurrency: string;     // Currency of the asset from Yahoo Finance
}

export function Dashboard() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);  // All operations for history calculation
    const [marketDataInfo, setMarketDataInfo] = useState<Record<string, MarketData | null>>({});
    const [forexRates, setForexRates] = useState<Record<string, number>>({});  // Currency -> USD rates
    const [loading, setLoading] = useState(false);
    const [userSettings, setUserSettings] = useState<UserSettings>({ nonLeveragedCapital: 0 });
    const [settingCapital, setSettingCapital] = useState(false);
    const [capitalInput, setCapitalInput] = useState('');

    // Form State
    const [newTicker, setNewTicker] = useState('');
    const [newQty, setNewQty] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [operationType, setOperationType] = useState<'BUY' | 'SELL'>('BUY');
    const [selectedBroker, setSelectedBroker] = useState<string>('All');
    const [newOperationBroker, setNewOperationBroker] = useState<string>(''); // For the form
    const [newOperationCurrency, setNewOperationCurrency] = useState<string>('USD');  // Currency for new operation
    const [detectedCurrency, setDetectedCurrency] = useState<string | null>(null);  // Auto-detected from ticker

    // Chart Time Range State
    const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM'>('1Y');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Effects
    useEffect(() => {

        const unsubscribe = subscribeToPositions((data) => {
            setPositions(data);
            // Sync legacy methods
            if (data.length > 0) {
                // Sync removed to prevent duplicate operations
                // syncPositionsToOperations(data).catch(console.error);
            }
        });
        const unsubscribeOperations = subscribeToOperations((ops) => {
            setOperations(ops);
        });
        const unsubscribeSettings = subscribeToSettings((settings) => {
            setUserSettings(settings);
            setCapitalInput(settings.nonLeveragedCapital.toString());
        });
        return () => {
            unsubscribe();
            unsubscribeOperations();
            unsubscribeSettings();
        };
    }, []);

    // Sync form broker with filter
    useEffect(() => {
        if (selectedBroker !== 'All') {
            setNewOperationBroker(selectedBroker);
        } else {
            setNewOperationBroker('');
        }
    }, [selectedBroker]);

    // Auto-detect currency when ticker changes
    useEffect(() => {
        const detectCurrency = async () => {
            if (newTicker.length >= 1) {
                const ticker = newTicker.toUpperCase();
                // Check if we already have market data for this ticker
                if (marketDataInfo[ticker]) {
                    const currency = marketDataInfo[ticker]?.currency || 'USD';
                    setDetectedCurrency(currency);
                    setNewOperationCurrency(currency);
                } else {
                    // Fetch market data to detect currency
                    try {
                        const data = await fetchMarketData(ticker);
                        if (data?.currency) {
                            setDetectedCurrency(data.currency);
                            setNewOperationCurrency(data.currency);
                        }
                    } catch (err) {
                        // Silently fail, default to USD
                    }
                }
            } else {
                setDetectedCurrency(null);
            }
        };

        const timeoutId = setTimeout(detectCurrency, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [newTicker, marketDataInfo]);

    const loadData = async () => {
        setLoading(true);
        const uniqueTickers = Array.from(new Set([
            ...positions.map(p => p.ticker),
            ...operations.map(o => o.ticker)
        ]));

        const newData: Record<string, MarketData | null> = {};
        const newForexRates: Record<string, number> = { USD: 1 };

        // Batch requests to prevent 429 errors (Rate Limiting)
        const BATCH_SIZE = 5;
        for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
            const batch = uniqueTickers.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (ticker) => {
                // Yahoo Finance: no API key needed
                const data = await fetchMarketData(ticker);
                newData[ticker] = data;

                // Collect unique currencies for forex rate fetching
                if (data && data.currency && data.currency !== 'USD' && !newForexRates[data.currency]) {
                    try {
                        const rate = await getExchangeRate(data.currency, 'USD');
                        newForexRates[data.currency] = rate;
                    } catch (err) {
                        console.warn(`Failed to get forex rate for ${data.currency}:`, err);
                        newForexRates[data.currency] = 1; // Fallback
                    }
                }
            }));

            // Add delay between batches if not the last batch
            if (i + BATCH_SIZE < uniqueTickers.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        setMarketDataInfo(newData);
        setForexRates(newForexRates);
        setLoading(false);
    };

    useEffect(() => {
        if (positions.length > 0 || operations.length > 0) {
            loadData();
        }
    }, [positions, operations]);

    // Derived Data
    const portfolioAssets: AssetPerformance[] = useMemo(() => {
        // First group by ticker
        const groups: Record<string, Position[]> = {};
        positions.forEach(p => {
            // Broker Filtering
            if (selectedBroker !== 'All' && p.broker !== selectedBroker) return;

            if (!groups[p.ticker]) groups[p.ticker] = [];
            groups[p.ticker].push(p);
        });

        // Now map to aggregated assets
        return Object.keys(groups).map(ticker => {
            const group = groups[ticker];
            const totalQty = group.reduce((sum, p) => sum + p.quantity, 0);
            // Use USD cost basis for proper P&L calculation
            const totalCostBasisUSD = group.reduce((sum, p) => sum + ((p.buyPriceUSD ?? p.buyPrice) * p.quantity), 0);
            const avgBuyPriceUSD = totalQty > 0 ? totalCostBasisUSD / totalQty : 0;
            const avgBuyPrice = totalQty > 0 ? group.reduce((sum, p) => sum + (p.buyPrice * p.quantity), 0) / totalQty : 0;
            const firstBuyDate = group.sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime())[0].buyDate;
            const positionCurrency = group[0].currency ?? 'USD';

            const aggregatedPos: Position = {
                id: group[0].id,
                ticker: ticker,
                quantity: totalQty,
                buyPrice: avgBuyPrice,
                buyPriceUSD: avgBuyPriceUSD,
                currency: positionCurrency,
                buyDate: firstBuyDate
            };

            const data = marketDataInfo[ticker];
            let currentPrice = aggregatedPos.buyPrice;
            let currentPriceUSD = avgBuyPriceUSD;
            let history: { date: string; close: number }[] = [];
            let sector = 'Unknown';
            let assetCurrency = 'USD';
            let marketValue = 0;
            let gainLoss = 0;
            let gainLossPercent = 0;

            if (data === null) {
                currentPrice = 0;
                currentPriceUSD = 0;
                sector = 'Unknown';
                marketValue = 0;
                gainLoss = 0 - totalCostBasisUSD;
                gainLossPercent = -100;
            } else if (data) {
                currentPrice = data.price;
                assetCurrency = data.currency || 'USD';
                // Convert current price to USD using forex rates
                const forexRate = forexRates[assetCurrency] || 1;
                currentPriceUSD = currentPrice * forexRate;
                history = data.history;
                sector = data.sector || 'Unknown';
                // Market value in USD
                marketValue = currentPriceUSD * totalQty;
                gainLoss = marketValue - totalCostBasisUSD;
                gainLossPercent = (totalCostBasisUSD > 0) ? (gainLoss / totalCostBasisUSD) * 100 : 0;
            } else {
                marketValue = totalCostBasisUSD;
            }

            return {
                ...aggregatedPos,
                currentPrice,
                currentPriceUSD,
                marketValue,
                gainLoss,
                gainLossPercent,
                sector,
                history,
                isUnknown: data === null,
                assetCurrency
            };
        });
    }, [positions, marketDataInfo, selectedBroker, forexRates]);

    const totalValue = portfolioAssets.reduce((sum, a) => sum + a.marketValue, 0);
    const totalCost = portfolioAssets.reduce((sum, a) => sum + (a.buyPriceUSD * a.quantity), 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    const dailyChangeValue = portfolioAssets.reduce((sum, a) => {
        const data = marketDataInfo[a.ticker];
        if (!data) return sum;

        const forexRate = forexRates[a.assetCurrency] || 1;
        const currentPriceUSD = a.currentPrice * forexRate;
        const changePercent = data.changePercent;

        // Calculate Previous Close USD: Current / (1 + %change)
        // This is more accurate than Current * %change
        const previousCloseUSD = currentPriceUSD / (1 + (changePercent / 100));

        const changePerShareUSD = currentPriceUSD - previousCloseUSD;

        return sum + (changePerShareUSD * a.quantity);
    }, 0);

    const dailyChangePercent = totalValue > 0 ? (dailyChangeValue / totalValue) * 100 : 0;

    // Portfolio History: Reconstruct portfolio value over time accounting for all operations
    const portfolioHistory = useMemo(() => {
        // Collect all available price history dates from ALL market data (current + historical assets)
        const allDates = new Set<string>();
        Object.values(marketDataInfo).forEach(data => {
            if (data?.history) {
                data.history.forEach(h => allDates.add(h.date));
            }
        });

        if (allDates.size === 0) return [];

        const sortedDates = Array.from(allDates).sort();
        const firstHistoryDate = sortedDates[0];
        const lastHistoryDate = sortedDates[sortedDates.length - 1];

        // Sort operations by date and filter by broker
        const sortedOps = operations
            .filter(op => selectedBroker === 'All' || op.broker === selectedBroker)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Build a map of ticker -> price history for quick lookup
        // Build a map of ticker -> price history for quick lookup
        const priceHistoryMap: Record<string, Record<string, number>> = {};
        Object.values(marketDataInfo).forEach(data => {
            if (!data) return;
            priceHistoryMap[data.symbol] = {};
            data.history.forEach(h => {
                // Convert to USD using forex rate
                const forexRate = forexRates[data.currency] || 1;
                priceHistoryMap[data.symbol][h.date] = h.close * forexRate;
            });
        });

        // Calculate portfolio value for each date
        return sortedDates.map(date => {
            // Rebuild portfolio state up to this date
            const holdings: Record<string, number> = {}; // ticker -> quantity

            sortedOps.forEach(op => {
                if (op.date <= date) {
                    if (!holdings[op.ticker]) holdings[op.ticker] = 0;

                    if (op.type === 'ADD') {
                        holdings[op.ticker] += op.quantity;
                    } else if (op.type === 'REMOVE') {
                        holdings[op.ticker] -= op.quantity;
                        if (holdings[op.ticker] < 0) holdings[op.ticker] = 0;
                    }
                }
            });

            // Calculate total value for this date
            let value = 0;
            Object.keys(holdings).forEach(ticker => {
                const qty = holdings[ticker];
                if (qty > 0) {
                    // Get price for this date
                    const priceHistory = priceHistoryMap[ticker];
                    if (priceHistory) {
                        // Find the closest price on or before this date
                        let priceUSD = priceHistory[date];
                        if (!priceUSD) {
                            // Find most recent price before this date
                            const availableDates = Object.keys(priceHistory).filter(d => d <= date).sort();
                            if (availableDates.length > 0) {
                                priceUSD = priceHistory[availableDates[availableDates.length - 1]];
                            }
                        }
                        if (priceUSD) {
                            value += priceUSD * qty;
                        }
                    }
                }
            });

            return { date, value };
        }).filter(h => h.value > 0);
    }, [portfolioAssets, operations, forexRates, selectedBroker]);

    const filteredHistory = useMemo(() => {
        if (portfolioHistory.length === 0) return [];

        // If "ALL" we still might want to filter out very old empty data or just show everything
        if (timeRange === 'ALL') return portfolioHistory;

        const now = new Date();
        const startDate = new Date();

        if (timeRange === 'CUSTOM') {
            if (!customStartDate) return portfolioHistory;
            const start = new Date(customStartDate);
            const end = customEndDate ? new Date(customEndDate) : now;

            // Adjust end date to include the full day
            end.setHours(23, 59, 59, 999);

            return portfolioHistory.filter(h => {
                const d = new Date(h.date);
                return d >= start && d <= end;
            });
        }

        switch (timeRange) {
            case '1M': startDate.setMonth(now.getMonth() - 1); break;
            case '3M': startDate.setMonth(now.getMonth() - 3); break;
            case '6M': startDate.setMonth(now.getMonth() - 6); break;
            case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
            default: return portfolioHistory;
        }

        return portfolioHistory.filter(h => new Date(h.date) >= startDate);
    }, [portfolioHistory, timeRange, customStartDate, customEndDate]);

    const metrics = useMemo(() => calculateMetrics(portfolioHistory), [portfolioHistory]);

    const allocationData = useMemo(() => {
        return portfolioAssets.map(a => ({
            name: a.ticker,
            value: a.marketValue
        })).sort((a, b) => b.value - a.value);
    }, [portfolioAssets]);

    // Leverage Metrics
    // Debt is now defined per broker in userSettings.brokerDebt
    const brokerDebt = userSettings.brokerDebt || {};

    // Calculate total debt based on broker filter
    const totalDebt = useMemo(() => {
        if (selectedBroker === 'All') {
            return Object.values(brokerDebt).reduce((sum, d) => sum + (d || 0), 0);
        } else {
            return brokerDebt[selectedBroker] || 0;
        }
    }, [brokerDebt, selectedBroker]);

    // Current Equity = Total Value - Total Debt
    const currentEquity = totalValue - totalDebt;

    // Leverage Ratio = Total Exposure / Equity
    const leverageRatio = currentEquity > 0 ? totalValue / currentEquity : 0;

    // Margin Usage: Debt / Total Value
    const marginUsagePercent = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;

    // Broker debt editing state
    const [editingBrokerDebt, setEditingBrokerDebt] = useState<string | null>(null);
    const [brokerDebtInput, setBrokerDebtInput] = useState('');

    const handleUpdateBrokerDebt = async (broker: string) => {
        const val = parseFloat(brokerDebtInput);
        if (!isNaN(val) && val >= 0) {
            const newBrokerDebt = { ...brokerDebt, [broker]: val };
            await updateUserSettings({ brokerDebt: newBrokerDebt });
            setEditingBrokerDebt(null);
        }
    };

    const startEditingBrokerDebt = (broker: string) => {
        setBrokerDebtInput((brokerDebt[broker] || 0).toString());
        setEditingBrokerDebt(broker);
    };


    // Actions
    const handleOperation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTicker || !newQty || !newPrice) return;

        try {
            const ticker = newTicker.toUpperCase();
            const quantity = parseFloat(newQty);
            const price = parseFloat(newPrice);
            const currency = newOperationCurrency || detectedCurrency || 'USD';

            // Get exchange rate for conversion to USD
            let exchangeRate = 1;
            let priceInUSD = price;

            if (currency !== 'USD') {
                try {
                    exchangeRate = await getExchangeRate(currency, 'USD');
                    priceInUSD = price * exchangeRate;
                } catch (err) {
                    console.warn('Failed to get exchange rate, using 1:1', err);
                }
            }

            if (operationType === 'BUY') {
                if (!newOperationBroker) {
                    alert("Please select a broker");
                    return;
                }

                // Only log operation - Position is derived automatically
                await logOperation({
                    type: 'ADD',
                    ticker,
                    quantity,
                    price,
                    currency,
                    priceInUSD,
                    exchangeRate,
                    date: newDate,
                    broker: newOperationBroker
                });
            } else {
                // SELL LOGIC
                // Just log the sale. The service calculates the remaining quantity.

                if (!newOperationBroker) {
                    alert("Please select a broker to sell from");
                    return;
                }

                // Optional: Check if we have enough quantity in the derived state before allowing sell?
                // For now, we trust the user or the derived state will just show negative if they oversell (or 0 if we clamped it).
                // Let's add a quick check against current 'positions' state which IS the derived state now.
                const currentPos = positions.find(p => p.ticker === ticker && p.broker === newOperationBroker);
                const currentQty = currentPos ? currentPos.quantity : 0;

                if (quantity > currentQty) {
                    alert(`Insufficient holdings. You only have ${currentQty} ${ticker} in ${newOperationBroker}.`);
                    return;
                }

                await logOperation({
                    type: 'REMOVE',
                    ticker,
                    quantity,
                    price, // Sale Price
                    currency,
                    priceInUSD,
                    exchangeRate,
                    date: newDate,
                    broker: newOperationBroker
                });
            }

            setNewTicker('');
            setNewQty('');
            setNewPrice('');
        } catch (error) {
            console.error("Failed to execute operation", error);
        }
    };



    const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1'];

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'ticker', direction: 'asc' });

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedAssets = useMemo(() => {
        const sorted = [...portfolioAssets];
        if (!sortConfig) return sorted;

        return sorted.sort((a, b) => {
            let aValue: any = a[sortConfig.key as keyof AssetPerformance];
            let bValue: any = b[sortConfig.key as keyof AssetPerformance];

            // Handle specific cases or derived keys if strictly needed, 
            // but most in AssetPerformance are direct values.
            // map 'pnl' to gainLoss for example if we use a virtual key, but we can just use property names.

            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [portfolioAssets, sortConfig]);

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-4 h-4 text-slate-600 ml-1 inline-block" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-4 h-4 text-emerald-500 ml-1 inline-block" />
            : <ArrowDown className="w-4 h-4 text-emerald-500 ml-1 inline-block" />;
    };

    return (
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Value */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-4 -mt-4 blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-slate-400 text-sm font-medium">Net Liquidation Value <span className="text-xs text-emerald-500">(USD)</span></p>
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
                            <p className="text-slate-400 text-sm font-medium">Total P&L <span className="text-xs text-slate-500">(USD)</span></p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className={cn("text-3xl font-bold", totalPnL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                    {totalPnL >= 0 ? '+' : ''}${Math.abs(totalPnL).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                            <p className="text-slate-400 text-sm font-medium">Daily Variation <span className="text-xs text-slate-500">(USD)</span></p>
                            <h3 className={cn("text-3xl font-bold mt-1", dailyChangeValue >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {dailyChangeValue >= 0 ? '+' : ''}${Math.abs(dailyChangeValue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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

                    {/* Time Range Filter Chips */}
                    <div className="flex flex-wrap items-center gap-2 mb-6">
                        {(['1M', '3M', '6M', '1Y', 'ALL', 'CUSTOM'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-3 py-1 text-xs font-medium rounded-full transition-all",
                                    timeRange === range
                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                                )}
                            >
                                {range === 'ALL' ? 'Máximo' : range === 'CUSTOM' ? 'Personalizado' : range}
                            </button>
                        ))}

                        {timeRange === 'CUSTOM' && (
                            <div className="flex items-center gap-2 ml-2 animate-in fade-in slide-in-from-left-4 duration-300">
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:ring-1 focus:ring-emerald-500 outline-none"
                                />
                                <span className="text-slate-500 text-xs">-</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:ring-1 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                        )}
                    </div>
                    <div className="h-[350px] w-full" style={{ minWidth: '200px', minHeight: '200px' }}>
                        {filteredHistory.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={filteredHistory}>
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
                                        domain={['dataMin', 'auto']}
                                        stroke="#64748b"
                                        tickFormatter={(val) => `$${val / 1000}k`}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                                        itemStyle={{ color: '#10b981' }}
                                        formatter={(value: any) => [`$${parseFloat(value).toFixed(2)}`, 'Value']}
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
                                Not enough history data available
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
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4 w-full text-left">Allocation</h3>
                        <div className="h-[200px] w-full relative" style={{ minWidth: '150px', minHeight: '150px' }}>
                            {allocationData.length > 0 ? (
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
                                            formatter={(val: any) => `$${parseFloat(val).toFixed(0)}`}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                                    No data
                                </div>
                            )}
                            {/* Center Text */}
                            {allocationData.length > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-xs text-slate-500 font-semibold">ASSETS</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Asset Management Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Asset Table */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[600px]">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-4">
                            <h3 className="text-lg font-semibold text-white">Active Operations</h3>

                            {/* Broker Filter */}
                            <div className="relative">
                                <select
                                    value={selectedBroker}
                                    onChange={(e) => setSelectedBroker(e.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-sm text-slate-300 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none pr-8 cursor-pointer"
                                >
                                    <option value="All">All Brokers</option>
                                    {(userSettings.brokers || []).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                    <option value="Unassigned">Unassigned</option>
                                </select>
                                <Filter className="absolute right-2 top-1.5 w-3 h-3 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        <button onClick={loadData} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <Activity className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="overflow-y-auto overflow-x-hidden">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-slate-950 z-10 shadow-sm">
                                <tr className="text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('ticker')}>
                                        Asset <SortIcon column="ticker" />
                                    </th>
                                    <th className="p-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('sector')}>
                                        Sector <SortIcon column="sector" />
                                    </th>
                                    <th className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('currentPriceUSD')}>
                                        Price (USD) <SortIcon column="currentPriceUSD" />
                                    </th>
                                    <th className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('buyPriceUSD')}>
                                        Cost Basis (USD) <SortIcon column="buyPriceUSD" />
                                    </th>
                                    <th className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('quantity')}>
                                        Holdings <SortIcon column="quantity" />
                                    </th>
                                    <th className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('marketValue')}>
                                        Value (USD) <SortIcon column="marketValue" />
                                    </th>
                                    <th className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('gainLossPercent')}>
                                        P&L (USD) <SortIcon column="gainLossPercent" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {sortedAssets.map(asset => (
                                    <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-white">{asset.ticker}</div>
                                                {asset.assetCurrency && asset.assetCurrency !== 'USD' && (
                                                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                                                        {asset.assetCurrency}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500">{asset.buyDate}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                                                {asset.sector}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className={cn("font-medium", asset.isUnknown ? "text-slate-500" : "text-white")}>
                                                {asset.isUnknown ? 'Unknown' : `$${asset.currentPriceUSD.toFixed(2)}`}
                                            </div>
                                            {asset.assetCurrency && asset.assetCurrency !== 'USD' && !asset.isUnknown && (
                                                <div className="text-xs text-slate-500">
                                                    {getCurrencySymbol(asset.assetCurrency)}{asset.currentPrice.toFixed(2)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="text-slate-400">${asset.buyPriceUSD.toFixed(2)}</div>
                                            {asset.currency && asset.currency !== 'USD' && (
                                                <div className="text-xs text-slate-500">
                                                    {getCurrencySymbol(asset.currency)}{asset.buyPrice.toFixed(2)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="text-slate-300">{asset.quantity}</div>
                                        </td>
                                        <td className="p-4 text-right font-medium text-white">
                                            {asset.isUnknown ? <span className="text-slate-500">---</span> : `$${asset.marketValue.toFixed(2)}`}
                                        </td>
                                        <td className="p-4 text-right">
                                            {asset.isUnknown ? (
                                                <span className="text-slate-500">---</span>
                                            ) : (
                                                <>
                                                    <div className={cn("font-medium", asset.gainLoss >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                                        {asset.gainLoss >= 0 ? '+' : ''}{asset.gainLossPercent.toFixed(2)}%
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        ${asset.gainLoss.toFixed(2)}
                                                    </div>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {sortedAssets.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-slate-500">
                                            No active operations. Executed operations will appear here.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add Asset Form */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-fit sticky top-24">


                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => setOperationType('BUY')}
                            className={cn(
                                "flex-1 py-2 rounded-lg font-medium transition-all text-sm",
                                operationType === 'BUY'
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            Buy
                        </button>
                        <button
                            onClick={() => setOperationType('SELL')}
                            className={cn(
                                "flex-1 py-2 rounded-lg font-medium transition-all text-sm",
                                operationType === 'SELL'
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            Sell
                        </button>
                    </div>

                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        {operationType === 'BUY' ? (
                            <Plus className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-rose-500" />
                        )}
                        {operationType === 'BUY' ? 'New Buy Order' : 'New Sell Order'}
                    </h3>
                    <form onSubmit={handleOperation} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Ticker Symbol</label>
                            <SymbolSearch
                                value={newTicker}
                                onChange={setNewTicker}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Broker</label>
                            <select
                                required
                                value={newOperationBroker}
                                onChange={(e) => setNewOperationBroker(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                            >
                                <option value="" disabled>Select a Broker</option>
                                {(userSettings.brokers || []).map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">
                                Currency
                                {detectedCurrency && (
                                    <span className="ml-2 text-xs text-emerald-400">
                                        (Auto-detected: {detectedCurrency})
                                    </span>
                                )}
                            </label>
                            <select
                                value={newOperationCurrency}
                                onChange={(e) => setNewOperationCurrency(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                            >
                                {SUPPORTED_CURRENCIES.map(c => (
                                    <option key={c} value={c}>{c} ({getCurrencySymbol(c)})</option>
                                ))}
                            </select>
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
                                <label className="block text-sm font-medium text-slate-400 mb-1">
                                    {operationType === 'BUY' ? 'Buy Price' : 'Sell Price'} ({getCurrencySymbol(newOperationCurrency)})
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="any"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    placeholder={`${getCurrencySymbol(newOperationCurrency)}0.00`}
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
                            className={cn(
                                "w-full font-medium py-2.5 rounded-lg shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]",
                                operationType === 'BUY'
                                    ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/20"
                                    : "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-rose-500/20"
                            )}
                        >
                            {operationType === 'BUY' ? 'Execute Buy' : 'Execute Sell'}
                        </button>

                        {loading && (
                            <div className="flex items-start gap-2 bg-slate-800/50 p-3 rounded-lg text-xs text-slate-400 mt-4">
                                <AlertCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p>Obteniendo datos de Yahoo Finance...</p>
                            </div>
                        )}
                    </form>

                </div>
            </div>
            {/* Leverage Dashboard Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-purple-500" />
                        Leverage & Margin Analysis <span className="text-xs text-purple-400 font-normal">(USD)</span>
                    </h3>
                </div>

                {/* Broker Debt Configuration */}
                <div className="mb-6">
                    <h4 className="text-sm font-medium text-slate-400 mb-3">Debt per Broker</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(userSettings.brokers || []).map(broker => (
                            <div key={broker} className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                                <p className="text-xs text-slate-500 mb-1">{broker}</p>
                                {editingBrokerDebt === broker ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            value={brokerDebtInput}
                                            onChange={(e) => setBrokerDebtInput(e.target.value)}
                                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm w-20 focus:ring-1 focus:ring-purple-500 outline-none"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateBrokerDebt(broker)}
                                        />
                                        <button onClick={() => handleUpdateBrokerDebt(broker)} className="text-emerald-400 text-xs px-2 py-1 hover:bg-emerald-500/10 rounded">✓</button>
                                        <button onClick={() => setEditingBrokerDebt(null)} className="text-slate-400 text-xs px-2 py-1 hover:bg-slate-700 rounded">✕</button>
                                    </div>
                                ) : (
                                    <div
                                        className="text-lg font-mono text-rose-400 cursor-pointer hover:text-rose-300 transition-colors"
                                        onClick={() => startEditingBrokerDebt(broker)}
                                    >
                                        ${(brokerDebt[broker] || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                    </div>
                                )}
                            </div>
                        ))}
                        {(userSettings.brokers || []).length === 0 && (
                            <p className="text-slate-500 text-sm col-span-4">No brokers configured. Add brokers in settings.</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                        <p className="text-slate-400 text-sm font-medium mb-1">Current Equity <span className="text-xs text-slate-500">(USD)</span></p>
                        <h4 className="text-2xl font-bold font-mono text-white">
                            ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </h4>
                        <p className="text-xs text-slate-500 mt-2">Assets - Debt</p>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                        <p className="text-slate-400 text-sm font-medium mb-1">Leverage Ratio</p>
                        <h4 className={cn("text-2xl font-bold font-mono", leverageRatio > 1.5 ? "text-amber-400" : "text-emerald-400")}>
                            {leverageRatio.toFixed(2)}x
                        </h4>
                        <p className="text-xs text-slate-500 mt-2">Target &lt; 1.5x</p>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                        <p className="text-slate-400 text-sm font-medium mb-1">Total Debt <span className="text-xs text-slate-500">(USD)</span></p>
                        <h4 className="text-2xl font-bold font-mono text-rose-400">
                            ${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </h4>
                        <p className="text-xs text-slate-500 mt-2">{selectedBroker === 'All' ? 'All Brokers' : selectedBroker}</p>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                        <p className="text-slate-400 text-sm font-medium mb-1">Margin Utilization</p>
                        <h4 className="text-2xl font-bold font-mono text-blue-400">
                            {marginUsagePercent.toFixed(1)}%
                        </h4>
                        <div className="w-full bg-slate-800 h-1.5 mt-3 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(marginUsagePercent, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
