import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { OperationsHistory } from './components/OperationsHistory';

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [currentView, setCurrentView] = useState<'dashboard' | 'history'>('dashboard');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  return (
    <>
      <Layout
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenSettings={() => setShowSettings(true)}
      >
        {currentView === 'dashboard' ? (
          <Dashboard apiKey={apiKey} />
        ) : (
          <OperationsHistory />
        )}
      </Layout>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  API Key (Finnhub)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API Key..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Leave empty to use Mock Data. Data source handles fallback automatically.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
