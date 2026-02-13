/**
 * Currency Configuration — Single Source of Truth
 *
 * To change the application currency, either:
 *   1. Modify DEFAULT_CURRENCY below (compile-time, for new deployments)
 *   2. Change the "devise" field in system_settings via Admin UI (runtime, applies hot)
 *
 * The runtime value from DB always overrides the default below.
 */

// ============================================================
// Types
// ============================================================

export interface CurrencyConfig {
  /** ISO 4217 code (e.g. "XAF", "XOF", "USD", "EUR") */
  code: string;
  /** Display symbol (e.g. "FCFA", "$", "€") */
  symbol: string;
  /** Position of the symbol relative to the amount */
  symbolPosition: "before" | "after";
  /** Locale for number formatting (e.g. "fr-FR", "en-US") */
  locale: string;
  /** Number of decimal places (0 for FCFA, 2 for EUR/USD) */
  decimals: number;
}

// ============================================================
// Preset currency profiles
// ============================================================

export const CURRENCY_PRESETS: Record<string, CurrencyConfig> = {
  XAF: {
    code: "XAF",
    symbol: "FCFA",
    symbolPosition: "after",
    locale: "fr-FR",
    decimals: 0,
  },
  XOF: {
    code: "XOF",
    symbol: "FCFA",
    symbolPosition: "after",
    locale: "fr-FR",
    decimals: 0,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    symbolPosition: "after",
    locale: "fr-FR",
    decimals: 2,
  },
  USD: {
    code: "USD",
    symbol: "$",
    symbolPosition: "before",
    locale: "en-US",
    decimals: 2,
  },
  CDF: {
    code: "CDF",
    symbol: "FC",
    symbolPosition: "after",
    locale: "fr-CD",
    decimals: 2,
  },
  GNF: {
    code: "GNF",
    symbol: "FG",
    symbolPosition: "after",
    locale: "fr-GN",
    decimals: 0,
  },
  MGA: {
    code: "MGA",
    symbol: "Ar",
    symbolPosition: "after",
    locale: "fr-MG",
    decimals: 0,
  },
};

// ============================================================
// Default (compile-time) — overridden at runtime from DB
// ============================================================

export const DEFAULT_CURRENCY: CurrencyConfig = CURRENCY_PRESETS.XAF;

// ============================================================
// Runtime presets cache (loaded from DB at boot, fallback to compile-time)
// ============================================================

let _presetsCache: Record<string, CurrencyConfig> = { ...CURRENCY_PRESETS };

/** Replace the presets cache with DB-loaded data (called at server boot / after admin mutations) */
export function setPresetsCache(presets: CurrencyConfig[]): void {
  const map: Record<string, CurrencyConfig> = {};
  for (const p of presets) {
    map[p.code.toUpperCase()] = p;
  }
  _presetsCache = map;
}

/** Get all cached presets as an array */
export function getPresetsCache(): CurrencyConfig[] {
  return Object.values(_presetsCache);
}

/** Lookup a single preset by code from the runtime cache */
export function getPresetByCode(code: string): CurrencyConfig | undefined {
  return _presetsCache[code.toUpperCase()];
}

// ============================================================
// Runtime currency holder (set by server on boot / client on fetch)
// ============================================================

let _activeCurrency: CurrencyConfig = { ...DEFAULT_CURRENCY };

/** Replace the active currency at runtime (called once on boot / settings fetch) */
export function setActiveCurrency(config: CurrencyConfig): void {
  _activeCurrency = { ...config };
}

/** Set active currency from an ISO code. Returns false if code is unknown. */
export function setActiveCurrencyByCode(code: string): boolean {
  const preset = _presetsCache[code.toUpperCase()];
  if (!preset) return false;
  setActiveCurrency(preset);
  return true;
}

/** Get the current active currency config */
export function getActiveCurrency(): Readonly<CurrencyConfig> {
  return _activeCurrency;
}

// ============================================================
// Formatting helpers (use active currency)
// ============================================================

/** Format an amount as currency string. e.g. "1 234 567 FCFA" or "$1,234.56" */
export function formatMoney(
  amount: number | string | null | undefined,
  options?: {
    showCurrency?: boolean;
    compact?: boolean;
    decimals?: number;
    currency?: CurrencyConfig;
  },
): string {
  const cc = options?.currency ?? _activeCurrency;
  const { showCurrency = true, compact = false } = options ?? {};
  const dec = options?.decimals ?? cc.decimals;

  const num = parseMoney(amount);

  if (compact) {
    const abs = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    const suffix = showCurrency ? ` ${cc.symbol}` : "";
    if (abs >= 1_000_000_000)
      return `${sign}${(abs / 1_000_000_000).toFixed(1)} Md${suffix}`;
    if (abs >= 1_000_000)
      return `${sign}${(abs / 1_000_000).toFixed(1)} M${suffix}`;
    if (abs >= 1_000)
      return `${sign}${(abs / 1_000).toFixed(1)} K${suffix}`;
  }

  // Format with Intl then normalise special whitespace
  const formatted = num
    .toLocaleString(cc.locale, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })
    .replace(/[\u00A0\u202F]/g, " ");

  if (!showCurrency) return formatted;

  return cc.symbolPosition === "after"
    ? `${formatted} ${cc.symbol}`
    : `${cc.symbol} ${formatted}`;
}

/**
 * Compact formatting for cards/stats.
 * Under 100K → full number, 100K+ → abbreviated.
 */
export function formatMoneyShort(
  amount: number | string | null | undefined,
  currency?: CurrencyConfig,
): string {
  const cc = currency ?? _activeCurrency;
  const num = parseMoney(amount);

  if (Math.abs(num) >= 1_000_000_000) {
    const v = num / 1_000_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}Md ${cc.symbol}`;
  }
  if (Math.abs(num) >= 1_000_000) {
    const v = num / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M ${cc.symbol}`;
  }
  if (Math.abs(num) >= 100_000) {
    const v = num / 1_000;
    return `${v.toFixed(0)}K ${cc.symbol}`;
  }

  return formatMoney(num, { currency: cc });
}

/** Parse a string/number to a numeric value, stripping currency symbols */
export function parseMoney(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === "number") return amount;

  // Strip known currency symbols and whitespace
  const cleaned = String(amount)
    .replace(/FCFA|FC|FG|Ar|€|\$/g, "")
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(/,/g, ".");

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Label for table headers: "Montant (FCFA)" */
export function currencyLabel(prefix: string = "Montant"): string {
  return `${prefix} (${_activeCurrency.symbol})`;
}

/** The active ISO code, for DB fields / API responses */
export function currencyCode(): string {
  return _activeCurrency.code;
}

/** The active display symbol */
export function currencySymbol(): string {
  return _activeCurrency.symbol;
}
