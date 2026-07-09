import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  type CurrencyConfig,
  DEFAULT_CURRENCY,
  setActiveCurrency,
  getActiveCurrency,
  formatMoney,
  formatMoneyShort,
  parseMoney,
  currencyLabel,
} from '@shared/config/currency';

interface CurrencyContextType {
  /** The current active currency config */
  currency: CurrencyConfig;
  /** Format an amount as currency string */
  fmt: typeof formatMoney;
  /** Format compact (for cards/stats) */
  fmtShort: typeof formatMoneyShort;
  /** Parse a currency string to number */
  parse: typeof parseMoney;
  /** Generate a column header: "Montant (FCFA)" */
  label: typeof currencyLabel;
  /** Whether currency is still loading from server */
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyConfig>(getActiveCurrency());
  const [loading, setLoading] = useState(true);

  const fetchCurrency = useCallback(async () => {
    try {
      const res = await fetch('/api/config/currency');
      if (res.ok) {
        const config: CurrencyConfig = await res.json();
        setActiveCurrency(config);
        setCurrency(config);
      }
    } catch {
      // Keep default on failure
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch currency config on mount
  useEffect(() => {
    fetchCurrency();
  }, [fetchCurrency]);

  // Listen for WebSocket CURRENCY_CHANGED events (hot reload)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'CURRENCY_CHANGED' && detail.payload) {
        const config = detail.payload as CurrencyConfig;
        setActiveCurrency(config);
        setCurrency(config);
      }
      // Also react to general SETTINGS_UPDATE
      if (detail?.type === 'SETTINGS_UPDATE') {
        fetchCurrency();
      }
    };

    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [fetchCurrency]);

  const value: CurrencyContextType = {
    currency,
    fmt: formatMoney,
    fmtShort: formatMoneyShort,
    parse: parseMoney,
    label: currencyLabel,
    loading,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
}
