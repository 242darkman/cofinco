/**
 * KPI Period Picker — sélecteur de période fluide et pérenne.
 *
 * Remplace le <select> natif limité à une fenêtre fixe :
 * - mensuel : navigation par année (‹ 2026 ›) + grille de 12 mois, deux
 *   clics maximum pour atteindre n'importe quel mois, quel que soit
 *   l'historique accumulé ;
 * - annuel : grille des années navigables ;
 * - une pastille signale les périodes disposant d'un snapshot (données
 *   issues de /api/kpi/periods, scope courant) ;
 * - les mois futurs sont désactivés ; raccourci « Période courante ».
 *
 * Accessibilité : Radix Popover (focus, Escape, clic extérieur),
 * aria-pressed sur la période sélectionnée, libellés explicites.
 */
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useKpiPeriods } from '@/hooks/use-kpi';
import {
  MONTH_SHORT_LABELS,
  availablePeriodKeys,
  buildYearBounds,
  buildYearList,
  formatMonthKey,
  formatPeriodLabel,
  isFutureMonth,
  parseMonthKey,
} from './kpi-period-utils';

interface Props {
  periodType: 'monthly' | 'yearly';
  value: string;
  onChange: (periodKey: string) => void;
}

const CELL_BASE = `
  text-xs font-medium rounded-lg px-2 py-2 relative
  transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
`;

function cellClasses(selected: boolean, disabled: boolean): string {
  if (selected) return `${CELL_BASE} bg-accent text-white`;
  if (disabled) return `${CELL_BASE} text-content-muted opacity-40 cursor-not-allowed`;
  return `${CELL_BASE} text-content-primary hover:bg-surface-elevated cursor-pointer`;
}

/** Pastille « snapshot disponible » sous le libellé de la cellule. */
function AvailabilityDot({ visible, selected }: { visible: boolean; selected: boolean }) {
  if (!visible) return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
        selected ? 'bg-white' : 'bg-accent'
      }`}
    />
  );
}

export default function KpiPeriodPicker({ periodType, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const currentYear = now.getFullYear();

  // Année affichée dans la vue mensuelle (indépendante de la sélection)
  const selectedMonth = periodType === 'monthly' ? parseMonthKey(value) : null;
  const [viewYear, setViewYear] = useState<number>(selectedMonth?.year ?? currentYear);

  const { data } = useKpiPeriods();
  const periods = data?.data;
  const available = availablePeriodKeys(periods, periodType);
  const { minYear, maxYear } = buildYearBounds(periods, currentYear);

  const select = (periodKey: string) => {
    onChange(periodKey);
    setOpen(false);
  };

  // À l'ouverture, recentrer la vue sur l'année de la période sélectionnée
  const handleOpenChange = (next: boolean) => {
    if (next) setViewYear(selectedMonth?.year ?? currentYear);
    setOpen(next);
  };

  const goToCurrent = () => {
    setViewYear(currentYear);
    select(
      periodType === 'yearly'
        ? String(currentYear)
        : formatMonthKey(currentYear, now.getMonth() + 1),
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Choisir la période"
          className="
            inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5
            text-xs sm:text-sm font-medium
            bg-input border border-input-border rounded-lg
            text-content-primary
            hover:border-input-focus focus:outline-none focus:border-input-focus
            transition-colors cursor-pointer
          "
        >
          <Calendar size={14} className="text-content-muted shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">{formatPeriodLabel(periodType, value)}</span>
          <ChevronDown size={14} className="text-content-muted shrink-0" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-xl border border-edge bg-surface shadow-lg p-3"
        >
          {periodType === 'monthly' ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
                  disabled={viewYear <= minYear}
                  aria-label="Année précédente"
                  className="p-1.5 rounded-lg text-content-secondary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-content-primary" aria-live="polite">
                  {viewYear}
                </span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
                  disabled={viewYear >= maxYear}
                  aria-label="Année suivante"
                  className="p-1.5 rounded-lg text-content-secondary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1" role="listbox" aria-label={`Mois de ${viewYear}`}>
                {MONTH_SHORT_LABELS.map((label, index) => {
                  const month = index + 1;
                  const key = formatMonthKey(viewYear, month);
                  const disabled = isFutureMonth(viewYear, month, now);
                  const selected = key === value;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={disabled}
                      onClick={() => select(key)}
                      className={cellClasses(selected, disabled)}
                      title={available.has(key) ? 'Snapshot disponible' : undefined}
                    >
                      {label}
                      <AvailabilityDot visible={available.has(key)} selected={selected} />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-1 max-h-56 overflow-y-auto" role="listbox" aria-label="Années">
              {buildYearList(minYear, maxYear).map((year) => {
                const key = String(year);
                const selected = key === value;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => select(key)}
                    className={cellClasses(selected, false)}
                    title={available.has(key) ? 'Snapshot disponible' : undefined}
                  >
                    {year}
                    <AvailabilityDot visible={available.has(key)} selected={selected} />
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-edge flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-content-muted">
              <span aria-hidden="true" className="w-1 h-1 rounded-full bg-accent" />
              Snapshot disponible
            </span>
            <button
              type="button"
              onClick={goToCurrent}
              className="text-xs font-medium text-accent hover:underline"
            >
              Période courante
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
