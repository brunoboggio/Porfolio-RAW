import React, { useEffect, useState } from 'react';
import { subscribeToOperations, updateOperation, deleteOperation, type Operation } from '../services/operations';
import { subscribeToSettings, type UserSettings } from '../services/settings';
import { ArrowUpRight, ArrowDownLeft, Calendar, Trash2, Pencil, Check, X, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export function OperationsHistory() {
    const [operations, setOperations] = useState<Operation[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Operation>>({});
    const [userSettings, setUserSettings] = useState<UserSettings>({ nonLeveragedCapital: 0, brokers: [] });

    const handleEditClick = (op: Operation) => {
        setEditingId(op.id);
        setEditForm({
            ticker: op.ticker,
            quantity: op.quantity,
            price: op.price,
            date: op.date,
            broker: op.broker || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editForm) return;
        try {
            await updateOperation(editingId, editForm);
            setEditingId(null);
            setEditForm({});
        } catch (error) {
            console.error("Failed to update operation", error);
            alert("Failed to update operation");
        }
    };

    const handleDeleteClick = async (id: string) => {
        if (confirm("Are you sure you want to delete this operation? This WILL act immediately on your active positions and cannot be undone.")) {
            try {
                await deleteOperation(id);
            } catch (error) {
                console.error("Failed to delete operation", error);
                alert("Failed to delete operation");
            }
        }
    };

    useEffect(() => {
        const unsubscribeOps = subscribeToOperations((data) => {
            setOperations(data);
            setLoading(false);
        });
        const unsubscribeSettings = subscribeToSettings((settings) => {
            setUserSettings(settings);
        });
        return () => {
            unsubscribeOps();
            unsubscribeSettings();
        };
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading operations...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Operations History</h2>
                <div className="text-slate-400 text-sm">
                    {operations.length} Transactions
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">Type</th>
                                <th className="p-4 font-medium">Asset</th>
                                <th className="p-4 font-medium">Broker</th>
                                <th className="p-4 font-medium">Date</th>
                                <th className="p-4 font-medium text-right">Quantity</th>
                                <th className="p-4 font-medium text-right">Price</th>
                                <th className="p-4 font-medium text-right">Total Value</th>
                                <th className="p-4 font-medium text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {operations.map((op) => (
                                <tr key={op.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="p-4">
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                            op.type === 'ADD'
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                        )}>
                                            {op.type === 'ADD' ? (
                                                <ArrowUpRight className="w-3 h-3" />
                                            ) : (
                                                <ArrowDownLeft className="w-3 h-3" />
                                            )}
                                            {op.type === 'ADD' ? 'BUY' : 'SELL'}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-bold text-white tracking-wide">{op.ticker}</span>
                                    </td>
                                    <td className="p-4">
                                        {editingId === op.id ? (
                                            <select
                                                value={editForm.broker || ''}
                                                onChange={e => setEditForm({ ...editForm, broker: e.target.value })}
                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none"
                                            >
                                                <option value="" disabled>Select Broker</option>
                                                {(userSettings.brokers || []).map(b => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="text-sm text-slate-300">
                                                {op.broker || <span className="text-slate-600 italic">Unassigned</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {editingId === op.id ? (
                                            <input
                                                type="date"
                                                value={editForm.date || ''}
                                                onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32 focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2 text-slate-400 text-sm">
                                                <Calendar className="w-4 h-4 text-slate-600" />
                                                {op.date}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === op.id ? (
                                            <input
                                                type="number"
                                                value={editForm.quantity || ''}
                                                onChange={e => setEditForm({ ...editForm, quantity: parseFloat(e.target.value) })}
                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-20 text-right focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                        ) : (
                                            <span className="text-slate-300 font-mono">{op.quantity}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === op.id ? (
                                            <input
                                                type="number"
                                                value={editForm.price || ''}
                                                onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) })}
                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-24 text-right focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                        ) : (
                                            <span className="text-slate-300 font-mono">${op.price.toFixed(2)}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-white font-medium font-mono">
                                            ${(op.quantity * op.price).toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {editingId === op.id ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={handleSaveEdit}
                                                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                    title="Save"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="p-1.5 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="Cancel"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEditClick(op)}
                                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(op.id)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {operations.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        No operations found.
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
