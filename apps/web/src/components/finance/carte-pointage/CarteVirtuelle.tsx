/**
 * Carte virtuelle de pointage — rendu digital premium d'une carte physique.
 *
 * Header aux couleurs du tenant (branding dynamique) : nom de la microfinance,
 * client, montant unitaire par case et QR code de la référence (scannable par
 * les agents). Corps : grille des 31 cases.
 */

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import SlotGrid, { NOMBRE_CASES } from './SlotGrid';
import { montantEnCentimes, centimesEnMontant } from '@shared/utils/carte-pointage';

interface CarteVirtuelleProps {
  carte: CartePointageDto;
}

/** Total accumulé exact (M × N), calculé en centimes — jamais en flottants. */
export function totalAccumule(carte: Pick<CartePointageDto, 'unitAmount' | 'completedSlots'>): string {
  if (carte.completedSlots <= 0) return '0.00';
  return centimesEnMontant(montantEnCentimes(carte.unitAmount) * BigInt(carte.completedSlots));
}

export const CarteVirtuelle: React.FC<CarteVirtuelleProps> = ({ carte }) => {
  const branding = useDocumentBranding();
  const { fmt } = useCurrency();
  const nomClient = [carte.clientPrenom, carte.clientNom].filter(Boolean).join(' ') || '—';

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl">
      {/* Bandeau d'en-tête aux couleurs de la marque du tenant */}
      <div className="bg-gradient-to-r from-accent to-accent/80 p-4 text-content-inverted sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {branding.logoUrl && (
                <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded bg-white/90 object-contain p-0.5" />
              )}
              <p className="truncate text-lg font-bold tracking-wide">{branding.appName}</p>
            </div>
            <p className="mt-2 truncate text-sm font-medium opacity-95">{nomClient}</p>
            <p className="text-xs opacity-80">
              Montant par case : <span className="font-semibold">{fmt(carte.unitAmount)}</span>
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-wider opacity-75">{carte.reference}</p>
          </div>
          {/* QR code de la référence — scan rapide par les agents */}
          <div className="shrink-0 rounded-lg bg-white p-1.5 shadow-inner" aria-label={`QR code ${carte.reference}`}>
            <QRCodeSVG value={carte.reference} size={72} level="M" />
          </div>
        </div>
      </div>

      {/* Grille des 31 cases */}
      <div className="p-4 sm:p-5">
        <SlotGrid completedSlots={carte.completedSlots} />
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-content-secondary">
            {carte.completedSlots} / {NOMBRE_CASES} cases remplies
          </span>
          <span className="font-semibold text-content-primary">
            Total accumulé : {fmt(totalAccumule(carte))}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CarteVirtuelle;
