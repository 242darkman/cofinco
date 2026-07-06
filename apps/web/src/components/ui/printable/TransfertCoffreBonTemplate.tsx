import React from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { currencySymbol } from '@shared/config/currency';

export type BonType = 'TRANSFERT' | 'SORTIE' | 'ENTREE';

export interface TransfertCoffreBonData {
  bonType: BonType;
  reference: string;
  dateTransfert: string | Date;
  dateDispatch?: string | Date;
  dateReception?: string | Date;
  montant: number;
  devise?: string;
  motif: string;
  typeTransfert: string;
  typeConditionnement?: string;
  numeroScelle?: string;
  statut: string;
  coffreSource: {
    code: string;
    nom: string;
    agenceNom?: string;
  };
  coffreDestination: {
    code: string;
    nom: string;
    agenceNom?: string;
  };
  agentsTransport?: Array<{ nom: string; contact?: string }>;
  createur?: string;
  approbateurL1?: string;
  approbateurL2?: string;
  dispatchPar?: string;
  receptionPar?: string;
  montantRecu?: number;
  ecart?: number;
  observations?: string;
}

const BON_CONFIG: Record<BonType, { titre: string; sousTitle: string }> = {
  TRANSFERT: { titre: 'BON DE TRANSFERT', sousTitle: 'Autorisation de transfert de fonds' },
  SORTIE: { titre: 'BON DE SORTIE', sousTitle: 'Attestation de départ des fonds' },
  ENTREE: { titre: "BON D'ENTRÉE", sousTitle: 'Attestation de réception des fonds' },
};

const STATUT_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  APPROVED_L1: 'Approuvé N1',
  APPROVED_L2: 'Approuvé N2',
  IN_TRANSIT: 'En transit',
  RECEIVED: 'Reçu',
  RECEIVED_WITH_DISCREPANCY: 'Reçu avec écart',
  REJECTED: 'Rejeté',
  CANCELLED: 'Annulé',
};

const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatAmount = (amount: number, currency: string) => {
  return new Intl.NumberFormat('fr-FR').format(amount).replace(/[\u00A0\u202F]/g, ' ') + ' ' + currency;
};

interface Props {
  data: TransfertCoffreBonData;
}

export const TransfertCoffreBonTemplate = React.forwardRef<HTMLDivElement, Props>(
  ({ data }, ref) => {
    const { branding } = useBranding();
    const config = BON_CONFIG[data.bonType];
    const currency = data.devise || currencySymbol();

    return (
      <div
        ref={ref}
        data-receipt-root
        className="bon-transfert w-full max-w-[210mm] bg-white text-black font-sans text-[12px] leading-normal mx-auto p-8"
      >
        <style type="text/css" media="print">
          {`
            @page { size: A4; margin: 15mm; }
            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bon-transfert {
              max-width: 210mm;
              width: 100%;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12px;
              line-height: 1.5;
              color: #000;
              padding: 15mm;
            }
            .bon-transfert, .bon-transfert * {
              color: #000 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            .bon-border { border: 1px solid #000; }
            .bon-border-b { border-bottom: 1px solid #000; }
            .bon-border-r { border-right: 1px solid #000; }
            .bon-bg-header { background: #f0f0f0 !important; }
          `}
        </style>

        {/* En-tête */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-[18px] font-bold uppercase">{branding.appName || 'COFIN&CO-M'}</div>
            <div className="text-[10px] text-gray-600">Brazzaville, République du Congo</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500">N° Document</div>
            <div className="text-[14px] font-bold font-mono">{data.reference}</div>
            <div className="text-[10px] text-gray-500">{formatDate(data.dateTransfert)}</div>
          </div>
        </div>

        {/* Titre du bon */}
        <div className="bon-border text-center py-3 mb-6">
          <div className="text-[16px] font-bold uppercase tracking-widest">{config.titre}</div>
          <div className="text-[10px] text-gray-600 mt-1">{config.sousTitle}</div>
        </div>

        {/* Informations générales */}
        <table className="w-full bon-border mb-4 text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td className="bon-border px-3 py-1.5 font-semibold bon-bg-header w-[30%]">Référence</td>
              <td className="bon-border px-3 py-1.5 font-mono">{data.reference}</td>
              <td className="bon-border px-3 py-1.5 font-semibold bon-bg-header w-[20%]">Statut</td>
              <td className="bon-border px-3 py-1.5 font-semibold">{STATUT_LABELS[data.statut] || data.statut}</td>
            </tr>
            <tr>
              <td className="bon-border px-3 py-1.5 font-semibold bon-bg-header">Type de transfert</td>
              <td className="bon-border px-3 py-1.5">{data.typeTransfert.replace(/_/g, ' → ')}</td>
              <td className="bon-border px-3 py-1.5 font-semibold bon-bg-header">Conditionnement</td>
              <td className="bon-border px-3 py-1.5">{data.typeConditionnement || '—'}</td>
            </tr>
            {data.numeroScelle && (
              <tr>
                <td className="bon-border px-3 py-1.5 font-semibold bon-bg-header">N° Scellé</td>
                <td className="bon-border px-3 py-1.5 font-mono" colSpan={3}>{data.numeroScelle}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Source et Destination */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bon-border">
            <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">
              Coffre Source (Départ)
            </div>
            <div className="px-3 py-2 space-y-1 text-[11px]">
              <div><span className="font-semibold">Code:</span> {data.coffreSource.code}</div>
              <div><span className="font-semibold">Coffre:</span> {data.coffreSource.nom}</div>
              {data.coffreSource.agenceNom && (
                <div><span className="font-semibold">Agence:</span> {data.coffreSource.agenceNom}</div>
              )}
            </div>
          </div>
          <div className="bon-border">
            <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">
              Coffre Destination (Arrivée)
            </div>
            <div className="px-3 py-2 space-y-1 text-[11px]">
              <div><span className="font-semibold">Code:</span> {data.coffreDestination.code}</div>
              <div><span className="font-semibold">Coffre:</span> {data.coffreDestination.nom}</div>
              {data.coffreDestination.agenceNom && (
                <div><span className="font-semibold">Agence:</span> {data.coffreDestination.agenceNom}</div>
              )}
            </div>
          </div>
        </div>

        {/* Montant */}
        <div className="bon-border mb-4">
          <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">
            Montant du transfert
          </div>
          <div className="px-3 py-3 text-center">
            <div className="text-[22px] font-bold">{formatAmount(data.montant, currency)}</div>
          </div>

          {/* Écart (pour Bon d'Entrée) */}
          {data.bonType === 'ENTREE' && data.montantRecu !== undefined && (
            <div className="bon-border-b" />
          )}
          {data.bonType === 'ENTREE' && data.montantRecu !== undefined && (
            <div className="px-3 py-2 grid grid-cols-3 gap-4 text-[11px]">
              <div>
                <div className="text-gray-500">Montant attendu</div>
                <div className="font-semibold">{formatAmount(data.montant, currency)}</div>
              </div>
              <div>
                <div className="text-gray-500">Montant reçu</div>
                <div className="font-semibold">{formatAmount(data.montantRecu, currency)}</div>
              </div>
              <div>
                <div className="text-gray-500">Écart</div>
                <div className={`font-bold ${(data.ecart || 0) !== 0 ? 'text-red-600' : ''}`}>
                  {formatAmount(data.ecart || 0, currency)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Motif */}
        <div className="bon-border mb-4">
          <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">Motif</div>
          <div className="px-3 py-2 text-[11px]">{data.motif || '—'}</div>
        </div>

        {/* Agents de transport (pour Bon de Sortie et Entrée) */}
        {data.agentsTransport && data.agentsTransport.length > 0 && (
          <div className="bon-border mb-4">
            <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">
              Agent(s) de transport
            </div>
            <div className="px-3 py-2 text-[11px]">
              {data.agentsTransport.map((agent, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span>{agent.nom}</span>
                  {agent.contact && <span className="text-gray-500">{agent.contact}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chronologie des approbations */}
        <div className="bon-border mb-4">
          <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">
            Historique des validations
          </div>
          <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {data.createur && (
                <tr>
                  <td className="bon-border px-3 py-1 font-semibold w-[30%]">Créé par</td>
                  <td className="bon-border px-3 py-1">{data.createur}</td>
                  <td className="bon-border px-3 py-1 w-[25%]">{formatDateTime(data.dateTransfert)}</td>
                </tr>
              )}
              {data.approbateurL1 && (
                <tr>
                  <td className="bon-border px-3 py-1 font-semibold">Approuvé N1 par</td>
                  <td className="bon-border px-3 py-1">{data.approbateurL1}</td>
                  <td className="bon-border px-3 py-1">—</td>
                </tr>
              )}
              {data.approbateurL2 && (
                <tr>
                  <td className="bon-border px-3 py-1 font-semibold">Approuvé N2 par</td>
                  <td className="bon-border px-3 py-1">{data.approbateurL2}</td>
                  <td className="bon-border px-3 py-1">—</td>
                </tr>
              )}
              {data.dispatchPar && (
                <tr>
                  <td className="bon-border px-3 py-1 font-semibold">Expédié par</td>
                  <td className="bon-border px-3 py-1">{data.dispatchPar}</td>
                  <td className="bon-border px-3 py-1">{data.dateDispatch ? formatDateTime(data.dateDispatch) : '—'}</td>
                </tr>
              )}
              {data.receptionPar && (
                <tr>
                  <td className="bon-border px-3 py-1 font-semibold">Reçu par</td>
                  <td className="bon-border px-3 py-1">{data.receptionPar}</td>
                  <td className="bon-border px-3 py-1">{data.dateReception ? formatDateTime(data.dateReception) : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Observations */}
        {data.observations && (
          <div className="bon-border mb-4">
            <div className="bon-border-b bon-bg-header px-3 py-1.5 font-semibold text-[11px] uppercase">Observations</div>
            <div className="px-3 py-2 text-[11px] italic">{data.observations}</div>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-8 grid grid-cols-3 gap-6 text-[10px]">
          {data.bonType === 'TRANSFERT' && (
            <>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Demandeur</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Approbateur N1</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Approbateur N2</div>
              </div>
            </>
          )}
          {data.bonType === 'SORTIE' && (
            <>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Responsable coffre</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Agent de transport</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Autorisant</div>
              </div>
            </>
          )}
          {data.bonType === 'ENTREE' && (
            <>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Agent de transport</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Réceptionnaire</div>
              </div>
              <div className="text-center">
                <div className="border-b border-black mb-1 h-12" />
                <div className="font-semibold">Responsable coffre</div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-[9px] text-gray-500">
          Document généré automatiquement — {branding.appName || 'COFIN&CO-M'} — {formatDateTime(new Date())}
        </div>
      </div>
    );
  }
);

TransfertCoffreBonTemplate.displayName = 'TransfertCoffreBonTemplate';
