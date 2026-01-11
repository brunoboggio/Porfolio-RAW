import axios from 'axios';

/**
 * Forex Service - Exchange rates from Yahoo Finance
 * Uses format: EURUSD=X for currency pairs
 */

interface ForexRate {
    pair: string;
    rate: number;
    timestamp: number;
}

// Cache for exchange rates (5 minute TTL)
const FOREX_CACHE: Record<string, ForexRate> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Supported currencies
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD', 'MXN', 'BRL', 'ARS'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

/**
 * Get exchange rate from one currency to another
 * @param fromCurrency Source currency code (e.g., "EUR")
 * @param toCurrency Target currency code (e.g., "USD")
 * @returns Exchange rate (how many toCurrency units per 1 fromCurrency unit)
 */
export const getExchangeRate = async (fromCurrency: string, toCurrency: string): Promise<number> => {
    // Same currency = rate of 1
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
        return 1;
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    const pair = `${from}${to}`;
    const symbol = `${pair}=X`;

    // Check cache
    const now = Date.now();
    if (FOREX_CACHE[pair] && (now - FOREX_CACHE[pair].timestamp < CACHE_DURATION)) {
        return FOREX_CACHE[pair].rate;
    }

    try {
        // Yahoo Finance forex endpoint
        const response = await axios.get(`/api/yahoo/v8/finance/chart/${symbol}`, {
            params: {
                interval: '1d',
                range: '1d'
            }
        });

        const result = response.data?.chart?.result?.[0];
        if (!result || !result.meta) {
            console.warn(`No forex data for ${symbol}, using fallback`);
            return getFallbackRate(from, to);
        }

        const rate = result.meta.regularMarketPrice;

        // Cache the result
        FOREX_CACHE[pair] = {
            pair,
            rate,
            timestamp: now
        };

        return rate;

    } catch (error: any) {
        console.error(`Forex API error for ${symbol}:`, error?.message || error);
        return getFallbackRate(from, to);
    }
};

/**
 * Convert an amount to USD
 * @param amount The amount in original currency
 * @param currency The source currency code
 * @returns Amount converted to USD
 */
export const convertToUSD = async (amount: number, currency: string): Promise<number> => {
    if (currency.toUpperCase() === 'USD') {
        return amount;
    }
    const rate = await getExchangeRate(currency, 'USD');
    return amount * rate;
};

/**
 * Convert an amount from USD to another currency
 * @param amountUSD The amount in USD
 * @param targetCurrency The target currency code
 * @returns Amount converted to target currency
 */
export const convertFromUSD = async (amountUSD: number, targetCurrency: string): Promise<number> => {
    if (targetCurrency.toUpperCase() === 'USD') {
        return amountUSD;
    }
    const rate = await getExchangeRate('USD', targetCurrency);
    return amountUSD * rate;
};

/**
 * Get currency symbol for display
 */
export const getCurrencySymbol = (currency: string): string => {
    const symbols: Record<string, string> = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        CAD: 'C$',
        AUD: 'A$',
        JPY: '¥',
        CHF: 'CHF',
        CNY: '¥',
        HKD: 'HK$',
        SGD: 'S$',
        MXN: 'MX$',
        BRL: 'R$',
        ARS: 'ARS$'
    };
    return symbols[currency.toUpperCase()] || currency;
};

/**
 * Fallback exchange rates (approximate, for when API fails)
 * These should be updated periodically or fetched from a backup source
 */
const FALLBACK_RATES: Record<string, number> = {
    // Rates to USD (how many USD per 1 unit of currency)
    EURUSD: 1.08,
    GBPUSD: 1.27,
    CADUSD: 0.74,
    AUDUSD: 0.66,
    JPYUSD: 0.0067,
    CHFUSD: 1.12,
    CNYUSD: 0.14,
    HKDUSD: 0.13,
    SGDUSD: 0.75,
    MXNUSD: 0.058,
    BRLUSD: 0.20,
    ARSUSD: 0.001,
    // Inverse rates
    USDEUR: 0.93,
    USDGBP: 0.79,
    USDCAD: 1.35,
    USDAUD: 1.52,
    USDJPY: 149.50,
    USDCHF: 0.89,
    USDCNY: 7.15,
    USDHKD: 7.82,
    USDSGD: 1.34,
    USDMXN: 17.20,
    USDBRL: 4.97,
    USDARS: 850
};

const getFallbackRate = (from: string, to: string): number => {
    const pair = `${from}${to}`;
    if (FALLBACK_RATES[pair]) {
        return FALLBACK_RATES[pair];
    }

    // Try inverse
    const inversePair = `${to}${from}`;
    if (FALLBACK_RATES[inversePair]) {
        return 1 / FALLBACK_RATES[inversePair];
    }

    // Convert through USD
    if (from !== 'USD' && to !== 'USD') {
        const fromToUsd = FALLBACK_RATES[`${from}USD`] || 1;
        const usdToTarget = FALLBACK_RATES[`USD${to}`] || 1;
        return fromToUsd * usdToTarget;
    }

    console.warn(`No fallback rate for ${pair}, returning 1`);
    return 1;
};

/**
 * Clear forex cache
 */
export const clearForexCache = () => {
    Object.keys(FOREX_CACHE).forEach(key => delete FOREX_CACHE[key]);
};

/**
 * Get all cached forex rates (for debugging)
 */
export const getCachedRates = () => ({ ...FOREX_CACHE });
