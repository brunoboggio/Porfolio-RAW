import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { searchSymbols, type SearchResult } from '../utils/marketData';

interface SymbolSearchProps {
    value: string;
    onChange: (value: string) => void;
}

export function SymbolSearch({ value, onChange }: SymbolSearchProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query && query.length > 1 && query !== value) {
                setLoading(true);
                const data = await searchSymbols(query);
                setResults(data);
                setLoading(false);
                setIsOpen(true);
            } else {
                setResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query, value]);

    // Handle outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleSelect = (symbol: string) => {
        setQuery(symbol);
        onChange(symbol);
        setIsOpen(false);
        setResults([]);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value.toUpperCase());
        // If user clears input, update parent immediately
        if (e.target.value === '') {
            onChange('');
        }
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    required
                    value={query}
                    onChange={handleChange}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                    placeholder="Search e.g. AAPL"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none uppercase placeholder:normal-case"
                />
                <div className="absolute left-3 top-2.5 text-slate-500">
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Search className="w-5 h-5" />
                    )}
                </div>
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {results.map((item, index) => (
                        <button
                            key={`${item.symbol}-${index}`}
                            onClick={() => handleSelect(item.symbol)}
                            className="w-full text-left px-4 py-2 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-white">{item.symbol}</span>
                                <span className="text-xs text-slate-500">{item.type}</span>
                            </div>
                            <div className="text-sm text-slate-400 truncate">
                                {item.description}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
