import axios from 'axios';

export interface MarketData {
    symbol: string;
    price: number;
    changePercent: number;
    history: { date: string; close: number }[];
    sector?: string;
}

const MOCK_SECTORS: Record<string, string> = {
    AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', NVDA: 'Technology',
    TSLA: 'Consumer Cyclical', AMZN: 'Consumer Cyclical',
    JPM: 'Financial', BAC: 'Financial',
    XOM: 'Energy', CVX: 'Energy',
    PFE: 'Healthcare', JNJ: 'Healthcare',
    SPY: 'ETF', QQQ: 'ETF'
};

const generateMockHistory = (days: number, startPrice: number) => {
    const history = [];
    let currentPrice = startPrice;
    const now = new Date();

    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        // Random walk with drift
        const change = (Math.random() - 0.48) * 0.05; // Slightly positive drift
        currentPrice = currentPrice * (1 + change);
        history.push({
            date: date.toISOString().split('T')[0],
            close: parseFloat(currentPrice.toFixed(2)),
        });
    }
    return history;
};

export const fetchMarketData = async (symbol: string, apiKey: string): Promise<MarketData | null> => {
    // If no API key, return specific mock data immediately
    if (!apiKey) {
        // Check if it's a known mock symbol
        if (MOCK_SECTORS[symbol]) {
            console.log(`Using Mock Data for ${symbol} (No API Key)`);
            const mockPrice = 100 + Math.random() * 500;
            return {
                symbol,
                price: parseFloat(mockPrice.toFixed(2)),
                changePercent: (Math.random() - 0.5) * 5,
                history: generateMockHistory(30, mockPrice),
                sector: MOCK_SECTORS[symbol]
            };
        }
        // Unknown mock symbol
        return null;
    }

    const cleanKey = apiKey.trim();

    try {
        // Finnhub Quote
        const quoteRes = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${cleanKey}`);

        // Finnhub returns c=0 for invalid symbols usually
        if (quoteRes.data.c === 0 && quoteRes.data.d === null) {
            return null;
        }

        // Finnhub Candles (Resolution D for Daily)
        let history = [];
        try {
            const to = Math.floor(Date.now() / 1000);
            const from = to - (30 * 24 * 60 * 60);
            const historyRes = await axios.get(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${cleanKey}`);

            if (historyRes.data.s === 'ok') {
                history = (historyRes.data.t || []).map((t: number, index: number) => ({
                    date: new Date(t * 1000).toISOString().split('T')[0],
                    close: historyRes.data.c[index]
                }));
            } else {
                history = generateMockHistory(30, quoteRes.data.c);
            }
        } catch (historyError: any) {
            history = generateMockHistory(30, quoteRes.data.c);
        }

        // Finnhub Profile (for Sector)
        let sector = MOCK_SECTORS[symbol] || 'Unknown';
        try {
            const profileRes = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${cleanKey}`);
            if (profileRes.data && profileRes.data.finnhubIndustry) {
                sector = profileRes.data.finnhubIndustry;
            }
        } catch (e) { /* ignore profile error */ }

        return {
            symbol,
            price: quoteRes.data.c,
            changePercent: quoteRes.data.dp,
            history,
            sector
        };

    } catch (error: any) {
        console.error("API Error:", error);
        if (error.response && error.response.status === 403) {
            console.error("Access Forbidden (403). Please check your API Key in Settings.");
        }
        // If it's a 4xx error it might be invalid symbol or key, but for safety let's return null if we suspect invalid symbol
        // For now, on error let's return null to be safe rather than mock data that confuses the user
        return null;
    }
};

export interface SearchResult {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
}

export const searchSymbols = async (query: string, apiKey: string): Promise<SearchResult[]> => {
    if (!query) return [];

    // Mock Fallback if no API Key
    if (!apiKey) {
        // Filter mock sectors as a simple "search"
        const matches = Object.keys(MOCK_SECTORS).filter(s => s.includes(query.toUpperCase()));
        return matches.map(s => ({
            description: MOCK_SECTORS[s] || 'Mock Stock',
            displaySymbol: s,
            symbol: s,
            type: 'Common Stock'
        }));
    }

    try {
        const cleanKey = apiKey.trim();
        const res = await axios.get(`https://finnhub.io/api/v1/search?q=${query}&token=${cleanKey}`);
        if (res.data && res.data.result) {
            return res.data.result.filter((item: any) => !item.symbol.includes('.')); // Filter out some non-US noise if desired, or keep all
        }
        return [];
    } catch (error) {
        console.error("Search API Error:", error);
        return [];
    }
};
