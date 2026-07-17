/**
 * Gabarit d'impression d'une carte de pointage.
 *
 * Rendu « carte physique » professionnel : bandeau d'en-tête officiel
 * (nom de la microfinance issu du branding tenant, adresse, contact, QR code
 * de la carte) et grille de 31 cases noir & blanc haute fidélité, imprimable
 * sur A4, ticket thermique ou papier cartonné.
 *
 * Le CSS embarqué force le rendu des couleurs/bordures (`print-color-adjust`)
 * et cadre la page (`@page`). Les éléments d'interface web sont masqués par
 * `react-to-print`, qui n'imprime que ce sous-arbre.
 */

import React, { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import SlotGrid, { NOMBRE_CASES } from './SlotGrid';
import { totalAccumule } from './CarteVirtuelle';

interface CartePointagePrintTemplateProps {
  carte: CartePointageDto;
}

export const CartePointagePrintTemplate = forwardRef<HTMLDivElement, CartePointagePrintTemplateProps>(
  ({ carte }, ref) => {
    const branding = useDocumentBranding();
    const { fmt } = useCurrency();
    const nomClient = [carte.clientPrenom, carte.clientNom].filter(Boolean).join(' ') || '—';
    const info = branding.companyInfo;

    return (
      <div ref={ref} className="carte-pointage-print mx-auto w-[190mm] max-w-full bg-white p-6 text-black">
        <style>{`
          @page { size: A4 portrait; margin: 10mm; }
          @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print { display: none !important; }
            .carte-pointage-print { box-shadow: none !important; }
          }
        `}</style>

        {/* ── Bandeau d'en-tête officiel ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b-4 border-black pb-3">
          <div className="flex items-start gap-3">
            {branding.logoUrl && (
              <img src={branding.logoUrl} alt="" className="h-14 w-14 object-contain" />
            )}
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest">{branding.appName}</h1>
              <p className="text-[10px] leading-4">
                {[info?.adresse, info?.telephone, info?.email].filter(Boolean).join(' — ') || ' '}
              </p>
              <p className="text-[10px] leading-4">
                {[info?.rccm && `RCCM : ${info.rccm}`, info?.nif && `NIF : ${info.nif}`]
                  .filter(Boolean)
                  .join(' — ') || ' '}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <QRCodeSVG value={carte.reference} size={64} level="M" />
            <span className="font-mono text-[9px] font-bold tracking-wider">{carte.reference}</span>
          </div>
        </div>

        {/* ── Identité de la carte ───────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="border-2 border-black p-2">
            <p className="text-[9px] font-bold uppercase">Client</p>
            <p className="font-semibold">{nomClient}</p>
          </div>
          <div className="border-2 border-black p-2">
            <p className="text-[9px] font-bold uppercase">Montant par case</p>
            <p className="font-semibold">{fmt(carte.unitAmount)}</p>
          </div>
          <div className="border-2 border-black p-2">
            <p className="text-[9px] font-bold uppercase">Ouverte le</p>
            <p className="font-semibold">{new Date(carte.createdAt).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>

        {/* ── Titre + grille des 31 cases ────────────────────────────── */}
        <h2 className="mt-4 mb-2 text-center text-sm font-black uppercase tracking-[0.3em]">
          Carte de pointage — {NOMBRE_CASES} cases
        </h2>
        <SlotGrid completedSlots={carte.completedSlots} printMode />

        {/* ── Pied de carte : synthèse + règle contractuelle ─────────── */}
        <div className="mt-4 flex items-start justify-between border-t-2 border-black pt-2 text-[10px]">
          <div>
            <p className="font-bold">
              {carte.completedSlots} / {NOMBRE_CASES} cases pointées — Total : {fmt(totalAccumule(carte))}
            </p>
            <p className="mt-1 italic">
              Au retrait, une échéance est retenue au titre des frais de gestion de caisse.
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold uppercase">Visa de l'agent</p>
            <div className="mt-1 h-12 w-28 border border-black" />
          </div>
        </div>
      </div>
    );
  },
);

CartePointagePrintTemplate.displayName = 'CartePointagePrintTemplate';

export default CartePointagePrintTemplate;
