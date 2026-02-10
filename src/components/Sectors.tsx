import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { BarChart3, Loader2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from 'axios';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Sector ETF definitions
const SECTOR_ETFS = [
    { symbol: 'XLK', name: 'Tecnología', color: '#3b82f6' },
    { symbol: 'XLF', name: 'Financiero', color: '#10b981' },
    { symbol: 'XLE', name: 'Energía', color: '#f59e0b' },
    { symbol: 'XLV', name: 'Salud', color: '#ec4899' },
    { symbol: 'XLY', name: 'Consumo Disc.', color: '#8b5cf6' },
    { symbol: 'XLP', name: 'Consumo Básico', color: '#06b6d4' },
    { symbol: 'XLI', name: 'Industrial', color: '#f97316' },
    { symbol: 'XLB', name: 'Materiales', color: '#84cc16' },
    { symbol: 'XLU', name: 'Utilidades', color: '#a855f7' },
    { symbol: 'XLRE', name: 'Inmobiliario', color: '#14b8a6' },
    { symbol: 'XLC', name: 'Comunicaciones', color: '#e11d48' },
];

interface SectorMonthlyData {
    date: string;
    [sectorSymbol: string]: number | string;
}

interface SectorPerformance {
    symbol: string;
    name: string;
    color: string;
    perf1Q: number;
    perf2Q: number;
    perf1Y: number;
    perf2Y: number;
    perf4Y: number;
    currentPrice: number;
}

export function Sectors() {
    const [chartData, setChartData] = useState<SectorMonthlyData[]>([]);
    const [performances, setPerformances] = useState<SectorPerformance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [highlightedSector, setHighlightedSector] = useState<string | null>(null);

    const fetchSectorData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const allData: Record<string, { date: string; close: number }[]> = {};

            // Fetch data in batches to avoid rate limits
            const BATCH_SIZE = 4;
            for (let i = 0; i < SECTOR_ETFS.length; i += BATCH_SIZE) {
                const batch = SECTOR_ETFS.slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (sector) => {
                    try {
                        const res = await axios.get(`/api/yahoo/v8/finance/chart/${sector.symbol}`, {
                            params: {
                                interval: '3mo',
                                range: '5y'
                            }
                        });

                        const result = res.data?.chart?.result?.[0];
                        if (result?.timestamp && result?.indicators?.quote?.[0]?.close) {
                            const timestamps = result.timestamp;
                            const closes = result.indicators.quote[0].close;

                            allData[sector.symbol] = timestamps
                                .map((ts: number, idx: number) => ({
                                    date: new Date(ts * 1000).toISOString().slice(0, 7), // YYYY-MM
                                    close: closes[idx]
                                }))
                                .filter((h: { date: string; close: number | null }) => h.close !== null && h.close > 0);
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch data for ${sector.symbol}:`, err);
                    }
                }));

                // Delay between batches
                if (i + BATCH_SIZE < SECTOR_ETFS.length) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }

            // Build normalized chart data (base 100)
            // Get all unique months across all sectors
            const allMonths = new Set<string>();
            Object.values(allData).forEach(history => {
                history.forEach(h => allMonths.add(h.date));
            });
            const sortedMonths = Array.from(allMonths).sort();

            if (sortedMonths.length === 0) {
                setError('No se pudieron obtener datos de sectores');
                setLoading(false);
                return;
            }

            // Build base prices (first available month for each sector)
            const basePrices: Record<string, number> = {};
            SECTOR_ETFS.forEach(sector => {
                const history = allData[sector.symbol];
                if (history && history.length > 0) {
                    basePrices[sector.symbol] = history[0].close;
                }
            });

            // Build lookup maps for quick access
            const priceMaps: Record<string, Record<string, number>> = {};
            SECTOR_ETFS.forEach(sector => {
                priceMaps[sector.symbol] = {};
                const history = allData[sector.symbol];
                if (history) {
                    history.forEach(h => {
                        priceMaps[sector.symbol][h.date] = h.close;
                    });
                }
            });

            // Build chart data with normalized values
            const normalized: SectorMonthlyData[] = sortedMonths.map(month => {
                const entry: SectorMonthlyData = { date: month };
                SECTOR_ETFS.forEach(sector => {
                    const price = priceMaps[sector.symbol]?.[month];
                    const base = basePrices[sector.symbol];
                    if (price && base) {
                        entry[sector.symbol] = parseFloat(((price / base) * 100).toFixed(2));
                    }
                });
                return entry;
            });

            setChartData(normalized);

            // Build performance table
            const perfData: SectorPerformance[] = SECTOR_ETFS.map(sector => {
                const history = allData[sector.symbol];
                if (!history || history.length < 2) {
                    return {
                        symbol: sector.symbol,
                        name: sector.name,
                        color: sector.color,
                        perf1Q: 0, perf2Q: 0, perf1Y: 0, perf2Y: 0, perf4Y: 0,
                        currentPrice: 0
                    };
                }

                const currentPrice = history[history.length - 1].close;

                // Each entry = 1 quarter (3mo interval)
                const getPerf = (quartersBack: number): number => {
                    const idx = history.length - 1 - quartersBack;
                    if (idx < 0) return 0;
                    const oldPrice = history[idx].close;
                    if (!oldPrice) return 0;
                    return ((currentPrice - oldPrice) / oldPrice) * 100;
                };

                return {
                    symbol: sector.symbol,
                    name: sector.name,
                    color: sector.color,
                    perf1Q: getPerf(1),
                    perf2Q: getPerf(2),
                    perf1Y: getPerf(4),
                    perf2Y: getPerf(8),
                    perf4Y: getPerf(Math.min(16, history.length - 1)),
                    currentPrice
                };
            }).filter(p => p.currentPrice > 0);

            setPerformances(perfData);
        } catch (err) {
            console.error('Error fetching sector data:', err);
            setError('Error al cargar datos de sectores');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSectorData();
    }, [fetchSectorData]);

    // Sort table by 1Y performance descending
    const sortedPerformances = useMemo(() => {
        return [...performances].sort((a, b) => b.perf1Y - a.perf1Y);
    }, [performances]);

    // Custom tooltip for the chart
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || payload.length === 0) return null;

        // Format date
        const [year, month] = (label as string).split('-');
        const qNumber = Math.ceil(parseInt(month) / 3);
        const formattedDate = `Q${qNumber} ${year}`;

        // Sort payload by value descending
        const sorted = [...payload].sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0));

        return (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl shadow-black/50 min-w-[200px]">
                <p className="text-slate-400 text-xs font-medium mb-3 border-b border-slate-700 pb-2">{formattedDate}</p>
                <div className="space-y-1.5">
                    {sorted.map((entry: any) => {
                        const sector = SECTOR_ETFS.find(s => s.symbol === entry.dataKey);
                        if (!sector || entry.value === undefined) return null;
                        const change = entry.value - 100;
                        return (
                            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sector.color }} />
                                    <span className="text-xs text-slate-300">{sector.name}</span>
                                </div>
                                <span className={cn(
                                    "text-xs font-mono font-medium",
                                    change >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}>
                                    {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Custom legend with hover interaction
    const CustomLegend = () => {
        return (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 px-4">
                {SECTOR_ETFS.map(sector => {
                    const isHighlighted = highlightedSector === null || highlightedSector === sector.symbol;
                    return (
                        <button
                            key={sector.symbol}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 text-xs",
                                isHighlighted
                                    ? "opacity-100"
                                    : "opacity-30"
                            )}
                            onMouseEnter={() => setHighlightedSector(sector.symbol)}
                            onMouseLeave={() => setHighlightedSector(null)}
                        >
                            <div
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: sector.color }}
                            />
                            <span className="text-slate-300 font-medium">{sector.name}</span>
                        </button>
                    );
                })}
            </div>
        );
    };

    const PerfCell = ({ value }: { value: number }) => (
        <td className="px-4 py-3 text-right font-mono text-sm">
            <span className={cn(
                "inline-flex items-center gap-1",
                value >= 0 ? "text-emerald-400" : "text-rose-400"
            )}>
                {value > 0 ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                {value >= 0 ? '+' : ''}{value.toFixed(2)}%
            </span>
        </td>
    );

    return (
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20">
                        <BarChart3 className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Rendimiento por Sector</h2>
                        <p className="text-slate-400 text-sm mt-0.5">Últimos 4 años · Datos trimestrales vía ETFs sectoriales</p>
                    </div>
                </div>
                <button
                    onClick={fetchSectorData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50"
                >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    Actualizar
                </button>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-slate-400 text-sm">Cargando datos de sectores...</p>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center">
                    <p className="text-rose-400">{error}</p>
                    <button
                        onClick={fetchSectorData}
                        className="mt-3 text-sm text-slate-400 hover:text-white underline"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {/* Chart */}
            {!loading && !error && chartData.length > 0 && (
                <>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-400" />
                            Rendimiento Acumulado (Base 100)
                        </h3>
                        <p className="text-slate-500 text-xs mb-6">
                            Cada sector está normalizado a base 100 desde el inicio del período para facilitar la comparación
                        </p>

                        <div className="h-[450px] w-full" style={{ minWidth: '200px', minHeight: '200px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#64748b"
                                        tickFormatter={(str) => {
                                            const [year, month] = str.split('-');
                                            const q = Math.ceil(parseInt(month) / 3);
                                            return `Q${q}'${year.slice(2)}`;
                                        }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                        interval="preserveStartEnd"
                                        fontSize={11}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        tickFormatter={(val) => `${val}`}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                        fontSize={11}
                                        domain={['dataMin - 5', 'dataMax + 5']}
                                    />
                                    <Tooltip
                                        content={<CustomTooltip />}
                                        cursor={{ stroke: '#334155', strokeWidth: 1 }}
                                    />
                                    {/* Reference line at 100 */}
                                    {SECTOR_ETFS.map(sector => (
                                        <Line
                                            key={sector.symbol}
                                            type="monotone"
                                            dataKey={sector.symbol}
                                            name={sector.name}
                                            stroke={sector.color}
                                            strokeWidth={highlightedSector === sector.symbol ? 3.5 : 1.8}
                                            strokeOpacity={
                                                highlightedSector === null ? 0.85 :
                                                    highlightedSector === sector.symbol ? 1 : 0.12
                                            }
                                            dot={false}
                                            activeDot={
                                                highlightedSector === null || highlightedSector === sector.symbol
                                                    ? { r: 4, fill: sector.color, stroke: '#0f172a', strokeWidth: 2 }
                                                    : false
                                            }
                                            connectNulls
                                        />
                                    ))}
                                    <Legend content={<CustomLegend />} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Performance Table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="p-6 pb-4 border-b border-slate-800">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-blue-400" />
                                Tabla de Rendimientos
                            </h3>
                            <p className="text-slate-500 text-xs mt-1">Rendimiento porcentual por período</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            Sector
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            Precio
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            1 Trim
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            2 Trim
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            1 Año
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            2 Años
                                        </th>
                                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                                            4 Años
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedPerformances.map((perf, idx) => (
                                        <tr
                                            key={perf.symbol}
                                            className={cn(
                                                "border-b border-slate-800/50 transition-all duration-200 cursor-pointer",
                                                idx % 2 === 0 ? "bg-slate-900/30" : "bg-slate-900/60",
                                                highlightedSector === perf.symbol
                                                    ? "!bg-slate-800/80 scale-[1.01]"
                                                    : highlightedSector !== null ? "opacity-40" : "hover:bg-slate-800/50"
                                            )}
                                            onMouseEnter={() => setHighlightedSector(perf.symbol)}
                                            onMouseLeave={() => setHighlightedSector(null)}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                                        style={{ backgroundColor: perf.color }}
                                                    />
                                                    <div>
                                                        <span className="text-white text-sm font-medium">{perf.name}</span>
                                                        <span className="text-slate-500 text-xs ml-2">{perf.symbol}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-300 font-mono">
                                                ${perf.currentPrice.toFixed(2)}
                                            </td>
                                            <PerfCell value={perf.perf1Q} />
                                            <PerfCell value={perf.perf2Q} />
                                            <PerfCell value={perf.perf1Y} />
                                            <PerfCell value={perf.perf2Y} />
                                            <PerfCell value={perf.perf4Y} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
