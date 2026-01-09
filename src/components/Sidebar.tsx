import React from 'react';
import { LayoutDashboard, History, Settings, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface SidebarProps {
    currentView: 'dashboard' | 'history' | 'closed';
    onViewChange: (view: 'dashboard' | 'history' | 'closed') => void;
    onOpenSettings: () => void;
}

export function Sidebar({ currentView, onViewChange, onOpenSettings }: SidebarProps) {
    const navItems = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            view: 'dashboard' as const
        },
        {
            id: 'history',
            label: 'History',
            icon: History,
            view: 'history' as const
        },
        {
            id: 'closed',
            label: 'Closed Ops',
            icon: CheckCircle, // CheckCircle needs to be imported
            view: 'closed' as const
        }
    ];

    return (
        <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen sticky top-0">
            <div className="p-6">
                <div className="flex items-center gap-2 mb-8">
                    <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                        <LayoutDashboard className="w-6 h-6 text-emerald-500" />
                    </div>
                    <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        QuantPortfolio
                    </span>
                </div>

                <nav className="space-y-2">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.view)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                                currentView === item.view
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-slate-800">
                <button
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
                >
                    <Settings className="w-5 h-5" />
                    <span className="font-medium">Settings</span>
                </button>
            </div>
        </div>
    );
}
