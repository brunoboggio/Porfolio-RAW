import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { OperationsHistory } from './components/OperationsHistory';
import { ClosedOperations } from './components/ClosedOperations';
import { subscribeToSettings, updateUserSettings, type UserSettings } from './services/settings';
import { Trash2 } from 'lucide-react';


function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'history' | 'closed'>('dashboard');
  const [showSettings, setShowSettings] = useState(false);

  const [userSettings, setUserSettings] = useState<UserSettings>({ nonLeveragedCapital: 0, brokers: [] });
  const [newBrokerName, setNewBrokerName] = useState('');


  useEffect(() => {
    const unsubscribe = subscribeToSettings((settings) => {
      setUserSettings(settings);
    });
    return () => unsubscribe();
  }, []);

  const handleAddBroker = async () => {
    if (!newBrokerName.trim()) return;
    const currentBrokers = userSettings.brokers || [];
    if (currentBrokers.includes(newBrokerName.trim())) return;

    const updatedBrokers = [...currentBrokers, newBrokerName.trim()];
    await updateUserSettings({ brokers: updatedBrokers });
    setNewBrokerName('');
  };

  const handleRemoveBroker = async (broker: string) => {
    const currentBrokers = userSettings.brokers || [];
    const updatedBrokers = currentBrokers.filter(b => b !== broker);
    await updateUserSettings({ brokers: updatedBrokers });
  };

  return (
    <>
      <Layout
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenSettings={() => setShowSettings(true)}
      >
        {currentView === 'dashboard' ? (
          <Dashboard />
        ) : currentView === 'history' ? (
          <OperationsHistory />
        ) : (
          <ClosedOperations />
        )}
      </Layout>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>

            <div className="space-y-4">
              {/* Data Source Info */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-400 mb-1">
                  📈 Yahoo Finance Data
                </p>
                <p className="text-xs text-slate-400">
                  Datos de mercado en tiempo real via Yahoo Finance. No requiere API Key.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <label className="block text-sm font-medium text-slate-400 mb-3">
                  Manage Brokers
                </label>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newBrokerName}
                    onChange={(e) => setNewBrokerName(e.target.value)}
                    placeholder="Add new broker..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddBroker();
                    }}
                  />
                  <button
                    onClick={handleAddBroker}
                    disabled={!newBrokerName.trim()}
                    className="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-lg hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {(userSettings.brokers || []).map(broker => (
                    <div key={broker} className="flex items-center justify-between bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 group">
                      <span className="text-sm text-slate-300">{broker}</span>
                      <button
                        onClick={() => handleRemoveBroker(broker)}
                        className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(!userSettings.brokers || userSettings.brokers.length === 0) && (
                    <p className="text-xs text-slate-600 text-center py-2">No brokers added yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
