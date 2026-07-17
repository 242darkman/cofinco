/**
 * Types du composant AdminCurrencySettings (modèle de données local).
 */

import type { CurrencyConfig } from '@shared/config/currency';

export type PresetWithId = CurrencyConfig & { id: string };

export interface PresetFormData {
  code: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
  locale: string;
  decimals: number;
}
