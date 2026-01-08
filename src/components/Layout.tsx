import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
    currentView: 'dashboard' | 'history';
    onViewChange: (view: 'dashboard' | 'history') => void;
    onOpenSettings: () => void;
    children: React.ReactNode;
}

export function Layout({ currentView, onViewChange, onOpenSettings, children }: LayoutProps) {
    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
            <Sidebar
                currentView={currentView}
                onViewChange={onViewChange}
                onOpenSettings={onOpenSettings}
            />
            <main className="flex-1 overflow-y-auto h-screen">
                {children}
            </main>
        </div>
    );
}
