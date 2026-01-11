import React, { useEffect, useState, useMemo } from 'react';
import { subscribeToOperations, type Operation } from '../services/operations';
import { ArrowUpRight, ArrowDownLeft, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getCurrencySymbol } from '../utils/forex';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface ClosedTrade {
    id: string; // Composite ID
    ticker: string;
    openDate: string;
    closeDate: string;
    quantity: number;
    entryPrice: number;      // Original currency price
    exitPrice: number;       // Original currency price
    entryPriceUSD: number;   // USD price for P&L calculation
    exitPriceUSD: number;    // USD price for P&L calculation
    currency: string;        // Original currency
    pnl: number;             // P&L in USD
    pnlPercent: number;
}

export function ClosedOperations() {
    const [operations, setOperations] = useState<Operation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = subscribeToOperations((data) => {
            // Sort by date ascending to replay history correctly
            const sorted = [...data].sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return dateA - dateB;
            });
            setOperations(sorted);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const closedTrades = useMemo(() => {
        const trades: ClosedTrade[] = [];
        const inventory: Record<string, { quantity: number; price: number; priceUSD: number; currency: string; date: string }[]> = {};

        operations.forEach((op) => {
            if (!inventory[op.ticker]) {
                inventory[op.ticker] = [];
            }

            // Handle legacy operations without currency fields
            const opPriceUSD = op.priceInUSD ?? op.price;
            const opCurrency = op.currency ?? 'USD';

            if (op.type === 'ADD') {
                // Add to inventory with USD price
                inventory[op.ticker].push({
                    quantity: op.quantity,
                    price: op.price,
                    priceUSD: opPriceUSD,
                    currency: opCurrency,
                    date: op.date
                });
            } else if (op.type === 'REMOVE') {
                // FIFO Matching
                let quantityToClose = op.quantity;
                const tickerInventory = inventory[op.ticker];

                while (quantityToClose > 0 && tickerInventory.length > 0) {
                    const batch = tickerInventory[0]; // First in

                    if (batch.quantity <= quantityToClose) {
                        // Fully close this batch - P&L in USD
                        const pnl = (opPriceUSD - batch.priceUSD) * batch.quantity;
                        const pnlPercent = (pnl / (batch.priceUSD * batch.quantity)) * 100;

                        trades.push({
                            id: `${op.id}-${batch.date}`,
                            ticker: op.ticker,
                            openDate: batch.date,
                            closeDate: op.date,
                            quantity: batch.quantity,
                            entryPrice: batch.price,
                            exitPrice: op.price,
                            entryPriceUSD: batch.priceUSD,
                            exitPriceUSD: opPriceUSD,
                            currency: batch.currency,
                            pnl,
                            pnlPercent
                        });

                        quantityToClose -= batch.quantity;
                        tickerInventory.shift(); // Remove batch
                    } else {
                        // Partially close this batch - P&L in USD
                        const pnl = (opPriceUSD - batch.priceUSD) * quantityToClose;
                        const pnlPercent = (pnl / (batch.priceUSD * quantityToClose)) * 100;

                        trades.push({
                            id: `${op.id}-${batch.date}-partial`,
                            ticker: op.ticker,
                            openDate: batch.date,
                            closeDate: op.date,
                            quantity: quantityToClose,
                            entryPrice: batch.price,
                            exitPrice: op.price,
                            entryPriceUSD: batch.priceUSD,
                            exitPriceUSD: opPriceUSD,
                            currency: batch.currency,
                            pnl,
                            pnlPercent
                        });

                        batch.quantity -= quantityToClose;
                        quantityToClose = 0;
                    }
                }
            }
        });

        // Sort trades by close date descending (most recent first)
        return trades.sort((a, b) => new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime());
    }, [operations]);

    const totalStats = useMemo(() => {
        const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
        const winCount = closedTrades.filter(t => t.pnl > 0).length;
        const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;

        return { totalPnL, winRate, count: closedTrades.length };
    }, [closedTrades]);

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading closed operations...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Closed Operations Performance</h2>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <p className="text-slate-400 text-sm font-medium">Realized P&L <span className="text-xs text-emerald-500">(USD)</span></p>
                    <div className="flex items-center gap-2 mt-2">
                        <h3 className={cn("text-3xl font-bold", totalStats.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {totalStats.totalPnL >= 0 ? '+' : ''}${totalStats.totalPnL.toFixed(2)}
                        </h3>
                        {totalStats.totalPnL >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-500" /> : <TrendingDown className="w-5 h-5 text-rose-500" />}
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <p className="text-slate-400 text-sm font-medium">Win Rate</p>
                    <h3 className="text-3xl font-bold text-blue-400 mt-2">
                        {totalStats.winRate.toFixed(1)}%
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{totalStats.count} Total Trades</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <p className="text-slate-400 text-sm font-medium">Best Trade <span className="text-xs text-slate-500">(USD)</span></p>
                    {closedTrades.length > 0 ? (
                        <div className="mt-2">
                            <div className="text-2xl font-bold text-emerald-400">
                                +${Math.max(...closedTrades.map(t => t.pnl)).toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500">
                                {closedTrades.reduce((prev, current) => (prev.pnl > current.pnl) ? prev : current).ticker}
                            </div>
                        </div>
                    ) : (
                        <h3 className="text-2xl font-bold text-slate-600 mt-2">---</h3>
                    )}
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">Asset</th>
                                <th className="p-4 font-medium">Open / Close</th>
                                <th className="p-4 font-medium text-right">Quantity</th>
                                <th className="p-4 font-medium text-right">Entry / Exit (USD)</th>
                                <th className="p-4 font-medium text-right">Realized P&L (USD)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {closedTrades.map((trade) => (
                                <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className="font-bold text-white">{trade.ticker}</div>
                                            {trade.currency && trade.currency !== 'USD' && (
                                                <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                                                    {trade.currency}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-xs text-slate-400">
                                            <span className="text-slate-500">Open:</span> {trade.openDate}
                                        </div>
                                        <div className="text-xs text-slate-300">
                                            <span className="text-slate-500">Close:</span> {trade.closeDate}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-slate-300 font-mono">{trade.quantity}</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="text-xs text-slate-400">
                                            <span className="text-slate-500">In:</span> ${trade.entryPriceUSD.toFixed(2)}
                                            {trade.currency && trade.currency !== 'USD' && (
                                                <span className="text-slate-600 ml-1">({getCurrencySymbol(trade.currency)}{trade.entryPrice.toFixed(2)})</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-300">
                                            <span className="text-slate-500">Out:</span> ${trade.exitPriceUSD.toFixed(2)}
                                            {trade.currency && trade.currency !== 'USD' && (
                                                <span className="text-slate-600 ml-1">({getCurrencySymbol(trade.currency)}{trade.exitPrice.toFixed(2)})</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={cn("font-medium", trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                        </div>
                                        <div className={cn("text-xs", trade.pnl >= 0 ? "text-emerald-500/70" : "text-rose-500/70")}>
                                            {trade.pnlPercent.toFixed(2)}%
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {closedTrades.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                        No closed trades found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
