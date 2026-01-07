
export interface PortfolioMetric {
    totalValue: number;
    totalPnL: number;
    dailyChange: number;
    dailyChangePercent: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
}

// Calculate standard deviation of an array
const stdDev = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
};

export const calculateMetrics = (
    portfolioHistory: { date: string; value: number }[],
    riskFreeRate: number = 0.02
): { volatility: number; sharpeRatio: number; maxDrawdown: number } => {
    if (portfolioHistory.length < 2) return { volatility: 0, sharpeRatio: 0, maxDrawdown: 0 };

    // Calculate Daily Returns
    const returns = [];
    for (let i = 1; i < portfolioHistory.length; i++) {
        const current = portfolioHistory[i].value;
        const prev = portfolioHistory[i - 1].value;
        if (prev === 0) returns.push(0);
        else returns.push((current - prev) / prev);
    }

    // Volatility (Annualized)
    // sigma_annual = sigma_daily * sqrt(252)
    const dailyVol = stdDev(returns);
    const volatility = dailyVol * Math.sqrt(252);

    // Sharpe Ratio
    // (Rp - Rf) / sigma_p
    // Rp = Annualized Portfolio Return. Simplified: Mean Daily Return * 252
    const meanDailyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const annualizedReturn = meanDailyReturn * 252;
    // Note: riskFreeRate is usually annual.
    const sharpeRatio = volatility === 0 ? 0 : (annualizedReturn - riskFreeRate) / volatility;

    // Max Drawdown
    // (Trough Value - Peak Value) / Peak Value
    let maxDrawdown = 0;
    let peak = portfolioHistory[0].value;

    for (const point of portfolioHistory) {
        if (point.value > peak) {
            peak = point.value;
        }
        const drawdown = (peak - point.value) / peak;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }

    return {
        volatility,
        sharpeRatio,
        maxDrawdown
    };
};
