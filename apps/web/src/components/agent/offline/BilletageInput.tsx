/**
 * BilletageInput - Cash denomination input component
 *
 * Reusable billetage (cash counting) input used in:
 * - OfflineDaySession (opening/closing billetage)
 * - AgentSessionManager (GL session close billetage)
 */

import { formatMoney } from '../../../lib/format';
import { currencySymbol } from '@shared/config/currency';

// Cash denomination structure (XAF/XOF)
export const DENOMINATIONS = [
  { value: 10000, label: '10 000' },
  { value: 5000, label: '5 000' },
  { value: 2000, label: '2 000' },
  { value: 1000, label: '1 000' },
  { value: 500, label: '500' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 25, label: '25' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
];

interface BilletageInputProps {
  billetage: Record<string, number>;
  onChange: (denomination: string, count: number) => void;
  total: number;
}

export default function BilletageInput({ billetage, onChange, total }: BilletageInputProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-xs text-content-muted px-1">
        <span>Coupure</span>
        <span>Nombre</span>
        <span className="text-right">Sous-total</span>
      </div>

      {DENOMINATIONS.map(({ value, label }) => {
        const count = billetage[String(value)] || 0;
        const subtotal = value * count;

        return (
          <div key={value} className="grid grid-cols-3 gap-2 items-center">
            <span className="text-sm text-content-secondary font-medium">{label} {currencySymbol()}</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={count || ''}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); onChange(String(value), v ? parseInt(v) : 0); }}
              className="bg-surface-elevated border border-edge-strong rounded px-2 py-1.5 text-content-primary text-sm text-center w-full"
              placeholder="0"
            />
            <span className="text-sm text-content-muted text-right">
              {subtotal > 0 ? formatMoney(subtotal) : '-'}
            </span>
          </div>
        );
      })}

      <div className="border-t border-edge-strong pt-2 flex justify-between items-center">
        <span className="text-sm font-semibold text-content-secondary">Total</span>
        <span className="text-lg font-bold text-content-primary">{formatMoney(total)}</span>
      </div>
    </div>
  );
}

/** Compute total from a billetage record */
export function computeBilletageTotal(billetage: Record<string, number>): number {
  return Object.entries(billetage).reduce(
    (sum, [denom, count]) => sum + parseInt(denom) * (count || 0),
    0
  );
}
