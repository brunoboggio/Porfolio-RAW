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

export const fetchMarketData = async (symbol: string, apiKey: string): Promise<MarketData> => {
    // If no API key, return specific mock data immediately
    if (!apiKey) {
        console.log(`Using Mock Data for ${symbol} (No API Key)`);
        const mockPrice = 100 + Math.random() * 500;
        return {
            symbol,
            price: parseFloat(mockPrice.toFixed(2)),
            changePercent: (Math.random() - 0.5) * 5,
            history: generateMockHistory(30, mockPrice),
            sector: MOCK_SECTORS[symbol] || 'Other'
        };
    }

    try {
        // Try Finnhub first for Quote (Realtime)
        // Note: Finnhub requires separate API calls for quote and history (candles)
        // This is a simplified implementation. Ideally we use the user's key for the specific service they chose.
        // For this demo, we assume the user provides a Finnhub key or Alpha Vantage key.
        // Let's assume Finnhub for simplicity as it's faster and cleaner JSON.

        // Check if key looks like Finnhub (usually shorter, alphanumeric) vs AlphaVantage (16 chars?)
        // Actually, let's just use Finnhub as primary recommendation.

        // Finnhub Quote
        const quoteRes = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
        if (quoteRes.data.c === 0 && quoteRes.data.d === null) throw new Error("Invalid Symbol or Key");

        // Finnhub Candles (Resolution D for Daily)
        const to = Math.floor(Date.now() / 1000);
        const from = to - (30 * 24 * 60 * 60);
        const historyRes = await axios.get(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${apiKey}`);

        const history = (historyRes.data.t || []).map((t: number, index: number) => ({
            date: new Date(t * 1000).toISOString().split('T')[0],
            close: historyRes.data.c[index]
        }));

        // Finnhub Profile (for Sector) - Requires generic free key often works, but might be restricted.
        // We will fallback to MOCK_SECTORS if restricted.
        let sector = MOCK_SECTORS[symbol] || 'Unknown';
        try {
            const profileRes = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`);
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

    } catch (error) {
        console.error("API Error, falling back to mock:", error);
        // Fallback to mock data on error/limits
        const mockPrice = 150;
        return {
            symbol,
            price: mockPrice,
            changePercent: 1.2,
            history: generateMockHistory(30, mockPrice),
            sector: MOCK_SECTORS[symbol] || 'Other'
        };
    }
};
