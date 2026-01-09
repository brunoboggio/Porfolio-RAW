import axios from 'axios';

export interface MarketData {
    symbol: string;
    price: number;
    changePercent: number;
    history: { date: string; close: number }[];
    sector?: string;
}

// Mock sectors for fallback when Yahoo Finance doesn't provide sector info
const MOCK_SECTORS: Record<string, string> = {
    AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', NVDA: 'Technology',
    TSLA: 'Consumer Cyclical', AMZN: 'Consumer Cyclical',
    JPM: 'Financial', BAC: 'Financial',
    XOM: 'Energy', CVX: 'Energy',
    PFE: 'Healthcare', JNJ: 'Healthcare',
    SPY: 'ETF', QQQ: 'ETF'
};

/**
 * Generate mock history data for when API is unavailable
 */
const generateMockHistory = (days: number, startPrice: number) => {
    const history = [];
    let currentPrice = startPrice;
    const now = new Date();

    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        // Random walk with drift
        const change = (Math.random() - 0.48) * 0.05;
        currentPrice = currentPrice * (1 + change);
        history.push({
            date: date.toISOString().split('T')[0],
            close: parseFloat(currentPrice.toFixed(2)),
        });
    }
    return history;
};

// Cache configuration
const CACHE: Record<string, { timestamp: number, data: MarketData }> = {};
const CACHE_DURATION = 60 * 1000; // 60 seconds

/**
 * Fetch market data from Yahoo Finance
 * No API key required - Yahoo Finance is free (but unofficial)
 */
export const fetchMarketData = async (symbol: string): Promise<MarketData | null> => {
    const now = Date.now();

    // 1. Check Cache first
    if (CACHE[symbol] && (now - CACHE[symbol].timestamp < CACHE_DURATION)) {
        return CACHE[symbol].data;
    }

    try {
        // Yahoo Finance Quote API - Get current price and change
        const quoteRes = await axios.get(`/api/yahoo/v8/finance/chart/${symbol}`, {
            params: {
                interval: '1d',
                range: '1mo' // Get 1 month of daily data
            }
        });

        const result = quoteRes.data?.chart?.result?.[0];

        if (!result || !result.meta) {
            console.warn(`No data found for ${symbol} on Yahoo Finance`);
            return null;
        }

        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose || meta.chartPreviousClose;

        // Calculate change percent
        const changePercent = previousClose
            ? ((currentPrice - previousClose) / previousClose) * 100
            : 0;

        // Extract historical data from chart response
        let history: { date: string; close: number }[] = [];

        if (result.timestamp && result.indicators?.quote?.[0]?.close) {
            const timestamps = result.timestamp;
            const closes = result.indicators.quote[0].close;

            history = timestamps.map((ts: number, index: number) => ({
                date: new Date(ts * 1000).toISOString().split('T')[0],
                close: closes[index] || currentPrice
            })).filter((h: { date: string; close: number }) => h.close !== null);
        }

        if (history.length === 0) {
            history = generateMockHistory(30, currentPrice);
        }

        // Note: Yahoo Finance quoteSummary now requires crumb authentication
        // Using mock sectors as fallback instead of making API calls
        const sector = MOCK_SECTORS[symbol] || 'Unknown';

        const newData: MarketData = {
            symbol,
            price: currentPrice,
            changePercent,
            history,
            sector
        };

        // Update Cache
        CACHE[symbol] = { timestamp: now, data: newData };

        return newData;

    } catch (error: any) {
        console.error(`Yahoo Finance API Error for ${symbol}:`, error?.message || error);

        // If rate limited, return cached data if available
        if (error.response?.status === 429) {
            console.warn(`Rate limit hit for ${symbol}. Using cached data if available.`);
            if (CACHE[symbol]) return CACHE[symbol].data;
        }

        // Return null for invalid symbols or API errors
        return null;
    }
};

/**
 * Search result interface for symbol autocomplete
 */
export interface SearchResult {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
}

/**
 * Search for stock symbols using Yahoo Finance autoc API
 * No API key required
 */
export const searchSymbols = async (query: string): Promise<SearchResult[]> => {
    if (!query || query.length < 1) return [];

    try {
        const res = await axios.get(`/api/yahoo/v1/finance/search`, {
            params: {
                q: query,
                quotesCount: 10,
                newsCount: 0,
                enableFuzzyQuery: false,
                quotesQueryId: 'tss_match_phrase_query'
            }
        });

        const quotes = res.data?.quotes || [];

        return quotes
            .filter((item: any) => item.symbol && !item.symbol.includes('^')) // Filter out indices
            .map((item: any) => ({
                description: item.longname || item.shortname || item.symbol,
                displaySymbol: item.symbol,
                symbol: item.symbol,
                type: item.quoteType || 'Equity'
            }))
            .slice(0, 8); // Limit results

    } catch (error) {
        console.error("Yahoo Finance Search API Error:", error);

        // Fallback: filter mock sectors as a simple "search"
        const matches = Object.keys(MOCK_SECTORS).filter(s =>
            s.includes(query.toUpperCase())
        );
        return matches.map(s => ({
            description: MOCK_SECTORS[s] || 'Stock',
            displaySymbol: s,
            symbol: s,
            type: 'Common Stock'
        }));
    }
};

/**
 * Clear cached data for a specific symbol or all symbols
 */
export const clearCache = (symbol?: string) => {
    if (symbol) {
        delete CACHE[symbol];
    } else {
        Object.keys(CACHE).forEach(key => delete CACHE[key]);
    }
};
