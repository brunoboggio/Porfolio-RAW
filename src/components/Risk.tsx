import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, ReferenceArea
} from 'recharts';
import {
    Shield, Loader2, TrendingUp, TrendingDown, RefreshCw,
    AlertTriangle, Activity, Zap, Flame, Snowflake, Sun
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from 'axios';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// ─── FRED Series Definitions ──────────────────────────────────────
const FRED_SERIES = {
    ICSA: { id: 'ICSA', name: 'Initial Claims', category: 'growth', frequency: 'weekly' },
    UMCSENT: { id: 'UMCSENT', name: 'Consumer Sentiment (UMich)', category: 'growth', frequency: 'monthly' },
    T5YIE: { id: 'T5YIE', name: '5Y Breakeven Inflation', category: 'inflation', frequency: 'daily' },
    PCEPILFE: { id: 'PCEPILFE', name: 'Core PCE', category: 'inflation', frequency: 'monthly' },
    M2SL: { id: 'M2SL', name: 'M2 Money Supply', category: 'liquidity', frequency: 'monthly' },
    BAMLH0A0HYM2: { id: 'BAMLH0A0HYM2', name: 'HY Credit Spread', category: 'liquidity', frequency: 'daily' },
} as const;

type SeriesId = keyof typeof FRED_SERIES;

// ─── Quadrant Types ───────────────────────────────────────────────
type Quadrant = 'goldilocks' | 'inflationary_boom' | 'stagflation' | 'recession';

interface QuadrantInfo {
    id: Quadrant;
    name: string;
    nameES: string;
    icon: typeof Sun;
    color: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    description: string;
    buy: string;
    avoid: string;
}

const QUADRANT_MAP: Record<Quadrant, QuadrantInfo> = {
    goldilocks: {
        id: 'goldilocks',
        name: 'Goldilocks',
        nameES: 'Goldilocks (Boom Desinflacionario)',
        icon: Sun,
        color: '#10b981',
        bgColor: 'rgba(16,185,129,0.1)',
        borderColor: 'rgba(16,185,129,0.25)',
        textColor: 'text-emerald-400',
        description: 'Crecimiento Alto + Inflación Baja. El mejor escenario para activos de riesgo.',
        buy: 'Acciones Growth, Tecnología, Consumo Discrecional, Industriales',
        avoid: 'Sectores defensivos, Utilities, Consumo Básico',
    },
    inflationary_boom: {
        id: 'inflationary_boom',
        name: 'Inflationary Boom',
        nameES: 'Boom Inflacionario',
        icon: Flame,
        color: '#f59e0b',
        bgColor: 'rgba(245,158,11,0.1)',
        borderColor: 'rgba(245,158,11,0.25)',
        textColor: 'text-amber-400',
        description: 'Crecimiento Alto + Inflación Alta. Favorecer cíclicos y commodities.',
        buy: 'Financieras, Energía, Materias Primas, Cíclicos',
        avoid: 'Defensivos, Salud, Bonos de larga duración',
    },
    stagflation: {
        id: 'stagflation',
        name: 'Stagflation',
        nameES: 'Estanflación',
        icon: AlertTriangle,
        color: '#f43f5e',
        bgColor: 'rgba(244,63,94,0.1)',
        borderColor: 'rgba(244,63,94,0.25)',
        textColor: 'text-rose-400',
        description: 'Crecimiento Bajo + Inflación Alta. PELIGRO. Proteger capital.',
        buy: 'Cash, Oro, Commodities, Renta Fija Corta',
        avoid: 'Casi todo el mercado de acciones',
    },
    recession: {
        id: 'recession',
        name: 'Recession',
        nameES: 'Recesión / Deflación',
        icon: Snowflake,
        color: '#3b82f6',
        bgColor: 'rgba(59,130,246,0.1)',
        borderColor: 'rgba(59,130,246,0.25)',
        textColor: 'text-blue-400',
        description: 'Crecimiento Bajo + Inflación Baja. La FED bajará tipos (Dovish).',
        buy: 'Bonos Gobierno (TLT), Dólar, Defensivos (Salud, Utilities)',
        avoid: 'Cíclicos, Financiero, Energía, Tecnología',
    },
};

// ─── Data Interfaces ─────────────────────────────────────────────
interface FREDObservation {
    date: string;
    value: string;
}

interface WeeklyDataPoint {
    date: string;
    riskScore: number;
    quadrant: Quadrant;
    growthTrend: number;
    inflationTrend: number;
    subScores: {
        m2: number;
        spread: number;
        claims: number;
        sentiment: number;
    };
}

interface IndicatorCard {
    id: string;
    name: string;
    category: string;
    color: string;
    currentValue: number;
    trend: 'up' | 'down' | 'flat';
    subScore: number;
    signal: string;
    unit: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
function computeSMA(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j];
            result.push(sum / period);
        }
    }
    return result;
}

function rateOfChange(data: number[], periodsBack: number): (number | null)[] {
    return data.map((val, i) => {
        if (i < periodsBack) return null;
        const prev = data[i - periodsBack];
        if (!prev || prev === 0) return null;
        return ((val - prev) / Math.abs(prev)) * 100;
    });
}

function interpolateToWeekly(
    dates: string[],
    values: number[],
    weeklyDates: string[]
): number[] {
    // Build lookup
    const lookup: Record<string, number> = {};
    dates.forEach((d, i) => { lookup[d] = values[i]; });

    // For each weekly date, find closest prior data point
    const result: number[] = [];
    let lastKnown = NaN;

    for (const wd of weeklyDates) {
        if (lookup[wd] !== undefined) {
            lastKnown = lookup[wd];
        } else {
            // Find the most recent date <= wd
            for (let di = dates.length - 1; di >= 0; di--) {
                if (dates[di] <= wd) {
                    lastKnown = values[di];
                    break;
                }
            }
        }
        result.push(isNaN(lastKnown) ? 0 : lastKnown);
    }
    return result;
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function lerp(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = clamp((val - inMin) / (inMax - inMin), 0, 1);
    return outMin + t * (outMax - outMin);
}

// ─── FRED API Key (for dev mode — in prod, proxy.php appends it) ──
const FRED_API_KEY = import.meta.env.VITE_FRED_API_KEY || '';

// ─── Main Component ──────────────────────────────────────────────
interface RiskProps {
    fredApiKey?: string;
}

export function Risk({ fredApiKey }: RiskProps) {
    const [chartData, setChartData] = useState<WeeklyDataPoint[]>([]);
    const [indicators, setIndicators] = useState<IndicatorCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFREDSeries = useCallback(async (seriesId: string, startDate: string): Promise<{ dates: string[]; values: number[] }> => {
        const apiKey = fredApiKey || FRED_API_KEY;
        const params: Record<string, string> = {
            series_id: seriesId,
            observation_start: startDate,
            file_type: 'json',
            sort_order: 'asc',
        };
        // Pass API key as query param (in dev Vite proxies directly, in prod proxy.php also appends it)
        if (apiKey) {
            params.api_key = apiKey;
        }

        const res = await axios.get('/api/fred/series/observations', { params });
        const observations: FREDObservation[] = res.data?.observations || [];

        const dates: string[] = [];
        const values: number[] = [];

        observations.forEach(obs => {
            const val = parseFloat(obs.value);
            if (!isNaN(val) && obs.value !== '.') {
                dates.push(obs.date);
                values.push(val);
            }
        });

        return { dates, values };
    }, [fredApiKey]);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch 3 years of data to have enough for 6-month RoC
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 3);
            const startStr = startDate.toISOString().slice(0, 10);

            // Fetch all 6 series
            const seriesIds: SeriesId[] = ['ICSA', 'UMCSENT', 'T5YIE', 'PCEPILFE', 'M2SL', 'BAMLH0A0HYM2'];

            const results: Record<string, { dates: string[]; values: number[] }> = {};

            // Batch fetch (2 at a time to be kind to FRED)
            for (let i = 0; i < seriesIds.length; i += 2) {
                const batch = seriesIds.slice(i, i + 2);
                const batchResults = await Promise.all(
                    batch.map(id => fetchFREDSeries(id, startStr).catch(err => {
                        console.warn(`Failed to fetch FRED ${id}:`, err);
                        return { dates: [], values: [] };
                    }))
                );
                batch.forEach((id, idx) => { results[id] = batchResults[idx]; });

                if (i + 2 < seriesIds.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            // Validate we have data
            const hasData = Object.values(results).some(r => r.dates.length > 20);
            if (!hasData) {
                setError('No se pudieron obtener datos de FRED. Verificá que la API Key esté configurada en proxy.php o en la variable VITE_FRED_API_KEY.');
                setLoading(false);
                return;
            }

            // ─── Build weekly timeline ────────────────────────────
            // Use ICSA (weekly) as reference, or generate weekly dates
            let weeklyDates: string[];
            if (results.ICSA.dates.length > 10) {
                weeklyDates = results.ICSA.dates;
            } else {
                // Generate weekly dates from start to now
                weeklyDates = [];
                const d = new Date(startStr);
                const now = new Date();
                while (d <= now) {
                    weeklyDates.push(d.toISOString().slice(0, 10));
                    d.setDate(d.getDate() + 7);
                }
            }

            // ─── Interpolate all series to weekly ─────────────────
            const weekly: Record<string, number[]> = {};
            seriesIds.forEach(id => {
                if (results[id].dates.length > 0) {
                    weekly[id] = interpolateToWeekly(results[id].dates, results[id].values, weeklyDates);
                } else {
                    weekly[id] = new Array(weeklyDates.length).fill(0);
                }
            });

            // ─── Compute derived metrics ──────────────────────────
            const ROC_PERIODS = 26; // ~6 months in weekly data
            const SMA_PERIOD_CLAIMS = 20; // 20-week SMA for claims

            // M2 Year-over-Year (52 weeks)
            const m2YoY = rateOfChange(weekly.M2SL, 52);

            // ICSA SMA
            const icsaSMA = computeSMA(weekly.ICSA, SMA_PERIOD_CLAIMS);

            // Sentiment RoC (6 months)
            const sentimentRoC = rateOfChange(weekly.UMCSENT, ROC_PERIODS);

            // Growth trend: ICSA (inverted) + UMCSENT
            const icsaRoC = rateOfChange(weekly.ICSA, ROC_PERIODS);

            // Inflation: T5YIE level + PCEPILFE RoC
            const pcepilfeRoC = rateOfChange(weekly.PCEPILFE, ROC_PERIODS);

            // ─── ALGORITHM: Compute weekly Risk Score ─────────────
            const weeklyData: WeeklyDataPoint[] = [];

            for (let i = 0; i < weeklyDates.length; i++) {
                // Need enough history for RoC and SMA
                if (i < 52) continue;

                const date = weeklyDates[i];

                // ── Step 1: Quadrant Detection ──
                // Growth trend
                const icsaChange = icsaRoC[i];
                const sentChange = sentimentRoC[i];
                const icsaCurrent = weekly.ICSA[i];
                const icsaSma = icsaSMA[i];

                let growthScore = 0;
                // ICSA falling = good growth (inverted)
                if (icsaChange !== null) {
                    growthScore += icsaChange < -5 ? 1 : icsaChange > 10 ? -1 : -icsaChange / 10;
                }
                // Sentiment rising = good growth
                if (sentChange !== null) {
                    growthScore += sentChange > 5 ? 1 : sentChange < -5 ? -1 : sentChange / 5;
                }
                const growthTrend = clamp(growthScore / 2, -1, 1); // Normalize to -1..1

                // Inflation trend
                const t5yie = weekly.T5YIE[i];
                const pcepilfeChange = pcepilfeRoC[i];

                let inflationScore = 0;
                // T5YIE level
                if (t5yie > 2.8) inflationScore += 1;
                else if (t5yie > 2.3) inflationScore += 0.3;
                else if (t5yie < 1.5) inflationScore -= 1;
                else if (t5yie < 2.0) inflationScore -= 0.3;

                // Core PCE trend
                if (pcepilfeChange !== null) {
                    inflationScore += pcepilfeChange > 1 ? 0.5 : pcepilfeChange < -0.5 ? -0.5 : pcepilfeChange * 0.5;
                }
                const inflationTrend = clamp(inflationScore / 1.5, -1, 1);

                // Determine quadrant
                let quadrant: Quadrant;
                if (growthTrend > 0 && inflationTrend <= 0) {
                    quadrant = 'goldilocks';
                } else if (growthTrend > 0 && inflationTrend > 0) {
                    quadrant = 'inflationary_boom';
                } else if (growthTrend <= 0 && inflationTrend > 0) {
                    quadrant = 'stagflation';
                } else {
                    quadrant = 'recession';
                }

                // ── Step 2: Risk Score (-10 to +10) ──
                // Liquidity (M2 YoY) — Weight 30%
                const m2 = m2YoY[i];
                let m2Score = 0;
                if (m2 !== null) {
                    m2Score = m2 > 5 ? 10 : m2 > 0 ? lerp(m2, 0, 5, 0, 10) :
                        m2 > -3 ? lerp(m2, -3, 0, -10, 0) : -10;
                }

                // Credit Spread — Weight 30%
                const spread = weekly.BAMLH0A0HYM2[i];
                let spreadScore = 0;
                if (spread > 0) {
                    spreadScore = spread < 3.0 ? 10 : spread < 3.5 ? lerp(spread, 3.0, 3.5, 10, 5) :
                        spread < 5.0 ? lerp(spread, 3.5, 5.0, 5, -5) :
                            spread < 7.0 ? lerp(spread, 5.0, 7.0, -5, -10) : -10;
                }

                // Employment (Claims vs SMA) — Weight 20%
                let claimsScore = 0;
                if (icsaCurrent > 0 && icsaSma !== null && icsaSma > 0) {
                    const ratio = icsaCurrent / icsaSma;
                    claimsScore = ratio < 0.9 ? 10 : ratio < 1.0 ? lerp(ratio, 0.9, 1.0, 10, 0) :
                        ratio < 1.1 ? lerp(ratio, 1.0, 1.1, 0, -5) :
                            ratio < 1.3 ? lerp(ratio, 1.1, 1.3, -5, -10) : -10;
                }

                // Sentiment — Weight 20%
                let sentScore = 0;
                if (sentChange !== null) {
                    sentScore = sentChange > 10 ? 10 : sentChange > 0 ? lerp(sentChange, 0, 10, 0, 10) :
                        sentChange > -10 ? lerp(sentChange, -10, 0, -10, 0) : -10;
                }

                // Composite
                const riskScore = parseFloat(
                    (0.30 * m2Score + 0.30 * spreadScore + 0.20 * claimsScore + 0.20 * sentScore).toFixed(1)
                );

                weeklyData.push({
                    date,
                    riskScore: clamp(riskScore, -10, 10),
                    quadrant,
                    growthTrend: parseFloat(growthTrend.toFixed(2)),
                    inflationTrend: parseFloat(inflationTrend.toFixed(2)),
                    subScores: {
                        m2: parseFloat(m2Score.toFixed(1)),
                        spread: parseFloat(spreadScore.toFixed(1)),
                        claims: parseFloat(claimsScore.toFixed(1)),
                        sentiment: parseFloat(sentScore.toFixed(1)),
                    },
                });
            }

            setChartData(weeklyData);

            // ─── Build indicator cards ────────────────────────────
            const lastIdx = weeklyDates.length - 1;
            const prevIdx = lastIdx - 4; // ~1 month ago

            const cards: IndicatorCard[] = [
                {
                    id: 'ICSA', name: 'Initial Claims', category: 'Empleo',
                    color: '#f43f5e',
                    currentValue: weekly.ICSA[lastIdx],
                    trend: weekly.ICSA[lastIdx] < weekly.ICSA[prevIdx] ? 'down' : weekly.ICSA[lastIdx] > weekly.ICSA[prevIdx] ? 'up' : 'flat',
                    subScore: weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].subScores.claims : 0,
                    signal: (weekly.ICSA[lastIdx] && icsaSMA[lastIdx]) ?
                        (weekly.ICSA[lastIdx] < icsaSMA[lastIdx]! ? '✅ Bajo SMA20' : '⚠️ Sobre SMA20') : '—',
                    unit: 'K',
                },
                {
                    id: 'UMCSENT', name: 'Consumer Sentiment', category: 'Sentimiento',
                    color: '#8b5cf6',
                    currentValue: weekly.UMCSENT[lastIdx],
                    trend: weekly.UMCSENT[lastIdx] > weekly.UMCSENT[prevIdx] ? 'up' : weekly.UMCSENT[lastIdx] < weekly.UMCSENT[prevIdx] ? 'down' : 'flat',
                    subScore: weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].subScores.sentiment : 0,
                    signal: sentimentRoC[lastIdx] !== null ?
                        (sentimentRoC[lastIdx]! > 0 ? '📈 Tendencia alcista' : '📉 Tendencia bajista') : '—',
                    unit: '',
                },
                {
                    id: 'T5YIE', name: '5Y Breakeven Inflation', category: 'Inflación',
                    color: '#f59e0b',
                    currentValue: weekly.T5YIE[lastIdx],
                    trend: weekly.T5YIE[lastIdx] > weekly.T5YIE[prevIdx] ? 'up' : weekly.T5YIE[lastIdx] < weekly.T5YIE[prevIdx] ? 'down' : 'flat',
                    subScore: 0,
                    signal: weekly.T5YIE[lastIdx] > 2.5 ? '🔴 Inflación elevada' :
                        weekly.T5YIE[lastIdx] < 2.0 ? '🟢 Inflación controlada' : '🟡 Neutral',
                    unit: '%',
                },
                {
                    id: 'PCEPILFE', name: 'Core PCE', category: 'Inflación',
                    color: '#ec4899',
                    currentValue: weekly.PCEPILFE[lastIdx],
                    trend: weekly.PCEPILFE[lastIdx] > weekly.PCEPILFE[prevIdx] ? 'up' : 'down',
                    subScore: 0,
                    signal: pcepilfeRoC[lastIdx] !== null ?
                        (pcepilfeRoC[lastIdx]! > 0 ? '⬆️ Subiendo' : '⬇️ Bajando') : '—',
                    unit: '',
                },
                {
                    id: 'M2SL', name: 'M2 Money Supply', category: 'Liquidez',
                    color: '#3b82f6',
                    currentValue: weekly.M2SL[lastIdx],
                    trend: m2YoY[lastIdx] !== null && m2YoY[lastIdx]! > 0 ? 'up' : 'down',
                    subScore: weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].subScores.m2 : 0,
                    signal: m2YoY[lastIdx] !== null ?
                        `YoY: ${m2YoY[lastIdx]! > 0 ? '+' : ''}${m2YoY[lastIdx]!.toFixed(1)}%` : '—',
                    unit: 'B',
                },
                {
                    id: 'BAMLH0A0HYM2', name: 'HY Credit Spread', category: 'Crédito',
                    color: '#14b8a6',
                    currentValue: weekly.BAMLH0A0HYM2[lastIdx],
                    trend: weekly.BAMLH0A0HYM2[lastIdx] < weekly.BAMLH0A0HYM2[prevIdx] ? 'down' : 'up',
                    subScore: weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].subScores.spread : 0,
                    signal: weekly.BAMLH0A0HYM2[lastIdx] < 3.5 ? '🟢 Apetito por riesgo' :
                        weekly.BAMLH0A0HYM2[lastIdx] > 5.0 ? '🔴 Estrés crediticio' : '🟡 Normal',
                    unit: '%',
                },
            ];

            setIndicators(cards);
        } catch (err: any) {
            console.error('Error fetching risk data:', err);
            if (err?.response?.status === 400 || err?.response?.status === 403) {
                setError('Error de autenticación con FRED API. Configurá tu API Key en proxy.php o en la variable de entorno VITE_FRED_API_KEY.');
            } else {
                setError('Error al cargar datos de FRED. Verificá la conexión y la API Key.');
            }
        } finally {
            setLoading(false);
        }
    }, [fetchFREDSeries]);

    useEffect(() => { fetchAllData(); }, [fetchAllData]);

    // ─── Derived state ────────────────────────────────────────────
    const currentData = useMemo(() => {
        if (chartData.length === 0) return null;
        return chartData[chartData.length - 1];
    }, [chartData]);

    const currentQuadrant = currentData ? QUADRANT_MAP[currentData.quadrant] : QUADRANT_MAP.goldilocks;
    const currentScore = currentData?.riskScore ?? 0;

    const riskLabel = currentScore > 3 ? 'RISK ON' : currentScore < -3 ? 'RISK OFF' : 'NEUTRAL';

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || payload.length === 0) return null;
        const data = payload[0]?.payload as WeeklyDataPoint;
        if (!data) return null;

        const formattedDate = new Date(data.date + 'T00:00:00').toLocaleDateString('es-AR', {
            year: 'numeric', month: 'short', day: 'numeric'
        });

        const q = QUADRANT_MAP[data.quadrant];
        const QuadIcon = q.icon;

        return (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl shadow-black/50 min-w-[260px]">
                <p className="text-slate-400 text-xs font-medium mb-2 border-b border-slate-700 pb-2">{formattedDate}</p>

                <div className="flex items-center gap-2 mb-3">
                    <QuadIcon className="w-4 h-4" style={{ color: q.color }} />
                    <span className="text-sm font-semibold" style={{ color: q.color }}>{q.name}</span>
                    <span className={cn(
                        "ml-auto text-lg font-black font-mono",
                        data.riskScore > 3 ? "text-emerald-400" : data.riskScore < -3 ? "text-rose-400" : "text-amber-400"
                    )}>
                        {data.riskScore > 0 ? '+' : ''}{data.riskScore.toFixed(1)}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-t border-slate-800 pt-2">
                    <div className="flex justify-between">
                        <span className="text-slate-500">M2 Liq.</span>
                        <span className={data.subScores.m2 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.subScores.m2 > 0 ? '+' : ''}{data.subScores.m2}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Spread</span>
                        <span className={data.subScores.spread >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.subScores.spread > 0 ? '+' : ''}{data.subScores.spread}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Empleo</span>
                        <span className={data.subScores.claims >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.subScores.claims > 0 ? '+' : ''}{data.subScores.claims}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Sentim.</span>
                        <span className={data.subScores.sentiment >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.subScores.sentiment > 0 ? '+' : ''}{data.subScores.sentiment}
                        </span>
                    </div>
                </div>

                <div className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-slate-800">
                    <span>Crecimiento: {data.growthTrend > 0 ? '↑' : '↓'} {(data.growthTrend * 100).toFixed(0)}%</span>
                    <span className="ml-3">Inflación: {data.inflationTrend > 0 ? '↑' : '↓'} {(data.inflationTrend * 100).toFixed(0)}%</span>
                </div>
            </div>
        );
    };

    // ─── Render ───────────────────────────────────────────────────
    return (
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl border" style={{
                        backgroundColor: currentQuadrant.bgColor,
                        borderColor: currentQuadrant.borderColor,
                    }}>
                        <Shield className="w-6 h-6" style={{ color: currentQuadrant.color }} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">MACRO-QUADRANT v2.0</h2>
                        <p className="text-slate-400 text-sm mt-0.5">Algoritmo macro · 6 series FRED · Cuadrante + Risk Score</p>
                    </div>
                </div>
                <button
                    onClick={fetchAllData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50"
                >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    Actualizar
                </button>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-slate-400 text-sm">Descargando datos de FRED...</p>
                    <p className="text-slate-600 text-xs">ICSA · UMCSENT · T5YIE · PCEPILFE · M2SL · HY Spread</p>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                    <p className="text-rose-400 mb-2">{error}</p>
                    <p className="text-slate-500 text-xs mb-4">
                        Obtené tu API Key gratis en <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" className="text-blue-400 underline">fred.stlouisfed.org</a>
                    </p>
                    <button onClick={fetchAllData} className="text-sm text-slate-400 hover:text-white underline">
                        Reintentar
                    </button>
                </div>
            )}

            {/* Content */}
            {!loading && !error && currentData && (
                <>
                    {/* Top Row: Quadrant + Score */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Quadrant Card */}
                        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                            <div className="absolute inset-0 opacity-10" style={{
                                background: `radial-gradient(circle at 50% 100%, ${currentQuadrant.color} 0%, transparent 60%)`
                            }} />

                            <p className="text-slate-500 text-xs uppercase tracking-widest mb-3 relative z-10">Cuadrante Detectado</p>

                            <div className="flex items-center gap-3 mb-3 relative z-10">
                                {(() => {
                                    const QuadIcon = currentQuadrant.icon;
                                    return <QuadIcon className="w-8 h-8" style={{ color: currentQuadrant.color }} />;
                                })()}
                                <div>
                                    <h3 className="text-2xl font-black" style={{ color: currentQuadrant.color }}>
                                        {currentQuadrant.name}
                                    </h3>
                                    <p className="text-slate-500 text-xs">{currentQuadrant.nameES}</p>
                                </div>
                            </div>

                            <p className="text-slate-400 text-xs mb-4 relative z-10">{currentQuadrant.description}</p>

                            <div className="space-y-2 relative z-10">
                                <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-3">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">✅ Comprar</p>
                                    <p className="text-xs text-slate-300">{currentQuadrant.buy}</p>
                                </div>
                                <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-3">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">❌ Evitar</p>
                                    <p className="text-xs text-slate-300">{currentQuadrant.avoid}</p>
                                </div>
                            </div>
                        </div>

                        {/* Score + Sub-scores */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Big Score */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center gap-8">
                                <div className="text-center min-w-[120px]">
                                    <p className="text-slate-500 text-xs uppercase tracking-widest mb-2">Risk Score</p>
                                    <div className={cn(
                                        "text-5xl font-black font-mono",
                                        currentScore > 3 ? "text-emerald-400" :
                                            currentScore < -3 ? "text-rose-400" : "text-amber-400"
                                    )}>
                                        {currentScore > 0 ? '+' : ''}{currentScore.toFixed(1)}
                                    </div>
                                    <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mt-2",
                                        currentScore > 3
                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                            : currentScore < -3
                                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                    )}>
                                        {currentScore > 3 ? <TrendingUp className="w-3.5 h-3.5" /> :
                                            currentScore < -3 ? <TrendingDown className="w-3.5 h-3.5" /> :
                                                <Activity className="w-3.5 h-3.5" />}
                                        {riskLabel}
                                    </div>
                                </div>

                                {/* Sub-score bars */}
                                <div className="flex-1 space-y-3">
                                    {[
                                        { label: 'Liquidez (M2)', value: currentData.subScores.m2, weight: '30%', color: '#3b82f6' },
                                        { label: 'Crédito (Spread)', value: currentData.subScores.spread, weight: '30%', color: '#14b8a6' },
                                        { label: 'Empleo (Claims)', value: currentData.subScores.claims, weight: '20%', color: '#f43f5e' },
                                        { label: 'Sentimiento', value: currentData.subScores.sentiment, weight: '20%', color: '#8b5cf6' },
                                    ].map(sub => (
                                        <div key={sub.label}>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-slate-400">{sub.label} <span className="text-slate-600">({sub.weight})</span></span>
                                                <span className={cn("font-mono font-bold",
                                                    sub.value >= 0 ? "text-emerald-400" : "text-rose-400"
                                                )}>
                                                    {sub.value > 0 ? '+' : ''}{sub.value.toFixed(1)}
                                                </span>
                                            </div>
                                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                                {/* Center mark */}
                                                <div className="absolute left-1/2 top-0 w-px h-full bg-slate-600 z-10" />
                                                <div
                                                    className="absolute h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        backgroundColor: sub.value >= 0 ? '#10b981' : '#f43f5e',
                                                        width: `${(Math.abs(sub.value) / 10) * 50}%`,
                                                        left: sub.value >= 0 ? '50%' : `${50 - (Math.abs(sub.value) / 10) * 50}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <p className="text-[10px] text-slate-600 text-center mt-1">
                                        Escala: -10 (Risk Off) ← 0 → +10 (Risk On)
                                    </p>
                                </div>
                            </div>

                            {/* Growth vs Inflation Axes */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        currentData.growthTrend > 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                                    )}>
                                        {currentData.growthTrend > 0 ?
                                            <TrendingUp className="w-5 h-5 text-emerald-400" /> :
                                            <TrendingDown className="w-5 h-5 text-rose-400" />}
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Eje Crecimiento</p>
                                        <p className={cn("text-lg font-bold font-mono",
                                            currentData.growthTrend > 0 ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                            {currentData.growthTrend > 0 ? 'POSITIVO' : 'NEGATIVO'}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        currentData.inflationTrend > 0 ? "bg-amber-500/10" : "bg-blue-500/10"
                                    )}>
                                        {currentData.inflationTrend > 0 ?
                                            <Flame className="w-5 h-5 text-amber-400" /> :
                                            <Snowflake className="w-5 h-5 text-blue-400" />}
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Eje Inflación</p>
                                        <p className={cn("text-lg font-bold font-mono",
                                            currentData.inflationTrend > 0 ? "text-amber-400" : "text-blue-400"
                                        )}>
                                            {currentData.inflationTrend > 0 ? 'ALTA' : 'BAJA'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <Activity className="w-5 h-5" style={{ color: currentQuadrant.color }} />
                            Evolución del Risk Score
                        </h3>
                        <p className="text-slate-500 text-xs mb-6">
                            Score = 0.30×M2 + 0.30×Spread + 0.20×Claims + 0.20×Sentimiento · Fondo coloreado por cuadrante
                        </p>

                        <div className="h-[450px] w-full" style={{ minWidth: '200px', minHeight: '200px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <ReferenceArea y1={3} y2={10} fill="#10b981" fillOpacity={0.06} ifOverflow="hidden" />
                                    <ReferenceArea y1={-3} y2={3} fill="#f59e0b" fillOpacity={0.04} ifOverflow="hidden" />
                                    <ReferenceArea y1={-10} y2={-3} fill="#f43f5e" fillOpacity={0.06} ifOverflow="hidden" />

                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                                    <XAxis
                                        dataKey="date"
                                        stroke="#64748b"
                                        tickFormatter={(str) => {
                                            const d = new Date(str + 'T00:00:00');
                                            return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                                        }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                        interval="preserveStartEnd"
                                        fontSize={11}
                                    />

                                    <YAxis
                                        stroke="#64748b"
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                        fontSize={11}
                                        domain={[-10, 10]}
                                        ticks={[-10, -5, -3, 0, 3, 5, 10]}
                                    />

                                    <Tooltip
                                        content={<CustomTooltip />}
                                        cursor={{ stroke: '#334155', strokeWidth: 1 }}
                                    />

                                    <ReferenceLine y={3} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} />
                                    <ReferenceLine y={0} stroke="#64748b" strokeDasharray="2 2" strokeOpacity={0.5} />
                                    <ReferenceLine y={-3} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.4} />

                                    <Line
                                        type="monotone"
                                        dataKey="riskScore"
                                        name="Risk Score"
                                        stroke="url(#riskGradientV2)"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{
                                            r: 5,
                                            fill: currentScore > 3 ? '#10b981' : currentScore < -3 ? '#f43f5e' : '#f59e0b',
                                            stroke: '#0f172a', strokeWidth: 2
                                        }}
                                        connectNulls
                                    />

                                    <defs>
                                        <linearGradient id="riskGradientV2" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="50%" stopColor="#8b5cf6" />
                                            <stop offset="100%" stopColor="#10b981" />
                                        </linearGradient>
                                    </defs>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
                                <span>Risk On (&gt;+3)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-amber-500/20" />
                                <span>Neutral (-3 a +3)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-rose-500/30" />
                                <span>Risk Off (&lt;-3)</span>
                            </div>
                        </div>
                    </div>

                    {/* Indicator Cards */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Indicadores Adelantados (FRED)
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {indicators.map(ind => (
                                <div key={ind.id} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-4 hover:border-slate-700 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ind.color }} />
                                            <span className="text-xs font-medium text-slate-300">{ind.name}</span>
                                        </div>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">{ind.category}</span>
                                    </div>

                                    <div className="flex items-end justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-lg font-mono font-bold text-white">
                                                {ind.currentValue >= 1000 ? (ind.currentValue / 1000).toFixed(0) + 'K' :
                                                    ind.currentValue >= 100 ? ind.currentValue.toFixed(0) :
                                                        ind.currentValue.toFixed(2)}
                                            </span>
                                            {ind.unit && <span className="text-xs text-slate-600">{ind.unit}</span>}
                                        </div>
                                        {ind.trend === 'up' ? (
                                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                                        ) : ind.trend === 'down' ? (
                                            <TrendingDown className="w-4 h-4 text-rose-400" />
                                        ) : null}
                                    </div>

                                    <p className="text-[11px] text-slate-400 mb-1">{ind.signal}</p>

                                    {ind.subScore !== 0 && (
                                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/50">
                                            <span className="text-[10px] text-slate-600">Sub-score:</span>
                                            <span className={cn("text-xs font-mono font-bold",
                                                ind.subScore >= 0 ? "text-emerald-400" : "text-rose-400"
                                            )}>
                                                {ind.subScore > 0 ? '+' : ''}{ind.subScore.toFixed(1)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Methodology */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-slate-400" />
                            Metodología MACRO-QUADRANT v2.0
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
                            <div className="space-y-2">
                                <p className="text-slate-300 font-medium">📊 Paso 1: Cuadrante (4 Escenarios)</p>
                                <p>Se calcula la tasa de cambio de 6 meses (RoC) para Crecimiento (ICSA↓ + UMCSENT↑) e Inflación (T5YIE nivel + Core PCE tendencia).</p>
                                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 mt-2">
                                    <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-emerald-400" /> Goldilocks: G+, I-</span>
                                    <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-amber-400" /> Reflación: G+, I+</span>
                                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-rose-400" /> Estanflación: G-, I+</span>
                                    <span className="flex items-center gap-1"><Snowflake className="w-3 h-3 text-blue-400" /> Recesión: G-, I-</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-slate-300 font-medium">⚙️ Paso 2: Risk Score (-10 a +10)</p>
                                <p className="font-mono text-[10px] bg-slate-950/60 p-2 rounded">
                                    Score = 0.30×M2(YoY) + 0.30×Spread + 0.20×Claims(vs SMA20) + 0.20×Sentiment(RoC)
                                </p>
                                <p className="mt-1">Cada sub-indicador puntúa de -10 a +10 según umbrales del documento. Score &gt;+3 = Risk On, &lt;-3 = Risk Off.</p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
