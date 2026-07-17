/**
 * Vignette d'une carte de pointage dans la grille du dashboard.
 *
 * Carte d'épargne élégante : référence, client, progression (x/31 + barre),
 * total accumulé et actions rapides (versement, retrait, impression, détail).
 */

import React from 'react';
import { ArrowDownToLine, Eye, PiggyBank, Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import { NOMBRE_CASES } from './SlotGrid';
import { totalAccumule } from './CarteVirtuelle';

interface CartePointageCardProps {
  carte: CartePointageDto;
  canDeposit: boolean;
  canWithdraw: boolean;
  onDeposit: (carte: CartePointageDto) => void;
  onWithdraw: (carte: CartePointageDto) => void;
  onPrint: (carte: CartePointageDto) => void;
  onDetail: (carte: CartePointageDto) => void;
}

export const CartePointageCard: React.FC<CartePointageCardProps> = ({
  carte,
  canDeposit,
  canWithdraw,
  onDeposit,
  onWithdraw,
  onPrint,
  onDetail,
}) => {
  const { fmt } = useCurrency();
  const nomClient = [carte.clientPrenom, carte.clientNom].filter(Boolean).join(' ') || '—';
  const progression = Math.round((carte.completedSlots / NOMBRE_CASES) * 100);
  const active = carte.status === 'ACTIVE';
  const pleine = carte.completedSlots >= NOMBRE_CASES;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-sm transition-shadow hover:shadow-md">
      {/* En-tête aux couleurs de la marque */}
      <div className="flex items-center justify-between gap-2 bg-linear-to-r from-accent to-accent/80 px-4 py-3 text-content-inverted">
        <div className="flex min-w-0 items-center gap-2">
          <PiggyBank className="h-4 w-4 shrink-0 opacity-90" />
          <span className="truncate font-mono text-xs tracking-wider">{carte.reference}</span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            active ? 'bg-white/20' : 'bg-black/25'
          }`}
        >
          {active ? (pleine ? 'Pleine' : 'Active') : 'Clôturée'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="truncate font-semibold text-content-primary">{nomClient}</p>
          <p className="text-xs text-content-muted">{fmt(carte.unitAmount)} par case</p>
        </div>

        {/* Progression : x/31 + barre fine */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-content-secondary">
              {carte.completedSlots} / {NOMBRE_CASES} cases remplies
            </span>
            <span className="font-semibold text-content-primary">{fmt(totalAccumule(carte))}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar"
            aria-valuenow={carte.completedSlots} aria-valuemin={0} aria-valuemax={NOMBRE_CASES}>
            <div
              className="h-full rounded-full bg-linear-to-r from-accent to-accent/70 transition-all duration-300"
              style={{ width: `${progression}%` }}
            />
          </div>
        </div>

        {/* Actions rapides */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {active && canDeposit && !pleine && (
            <Button size="sm" onClick={() => onDeposit(carte)} className="flex-1">
              Verser
            </Button>
          )}
          {active && canWithdraw && (
            <Button size="sm" variant="outline" icon={ArrowDownToLine} onClick={() => onWithdraw(carte)}>
              Retrait
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => onPrint(carte)} aria-label="Imprimer la carte" />
          <Button size="sm" variant="ghost" icon={Eye} onClick={() => onDetail(carte)} aria-label="Voir la carte" />
        </div>
      </div>
    </article>
  );
};

export default CartePointageCard;
