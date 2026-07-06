import React from 'react';
import { RefreshCw, FileText, Users, Shield, TrendingDown, Clock } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { Reevaluation } from '../types';

interface NewElementsSectionProps {
  elementsNouveaux: any[];
  justification: string;
  reevaluation: Reevaluation;
}

function DetailedElementView({ element, reevaluation }: { element: any; reevaluation: Reevaluation }) {
  const type: string = element.type;

  const getIcon = () => {
    switch (type) {
      case 'Co-emprunteur': return Users;
      case 'Garantie supplémentaire': return Shield;
      case 'Réduction montant demandé': return TrendingDown;
      case 'Allongement durée': return Clock;
      default: return FileText;
    }
  };

  const renderDetails = () => {
    switch (type) {
      case 'Réduction montant demandé':
        return (
          <div className="mt-1.5 text-xs bg-surface-base/50 p-2.5 rounded-lg border border-edge-subtle">
            <div className="flex justify-between items-center">
              <span className="text-content-muted">Nouveau montant :</span>
              <span className="font-bold text-status-success text-base">
                {formatMoney(Number(reevaluation.nouveauMontantDemande))}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-content-muted">Réduction :</span>
              <span className="text-status-success font-medium">
                -{formatMoney(Number(reevaluation.montantInitialDemande) - Number(reevaluation.nouveauMontantDemande || 0))}
              </span>
            </div>
          </div>
        );
      case 'Garantie supplémentaire':
        return (
          <div className="mt-1.5 space-y-1.5">
            {reevaluation.garantiesAdditionnelles && reevaluation.garantiesAdditionnelles.length > 0 ? (
              reevaluation.garantiesAdditionnelles.map((g, idx) => (
                <div key={idx} className="bg-surface-base/50 p-2 rounded-lg border border-edge-subtle flex flex-col gap-0.5">
                  <div className="flex justify-between items-start text-xs">
                    <span className="font-medium text-content-secondary">{g.type}</span>
                    <span className="font-mono text-accent">{formatMoney(Number(g.valeurEstimee))}</span>
                  </div>
                  {g.description && <p className="text-[11px] text-content-muted">{g.description}</p>}
                </div>
              ))
            ) : (
              <p className="text-[11px] text-content-muted italic">Aucune garantie enregistrée</p>
            )}
          </div>
        );
      case 'Co-emprunteur': {
        const co = reevaluation.coEmprunteurDetails;
        if (!co) return <p className="text-[11px] text-content-muted italic mt-1">Détails non disponibles</p>;
        return (
          <div className="mt-1.5 bg-surface-base/50 p-2.5 rounded-lg border border-edge-subtle grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="col-span-2 font-medium text-content-secondary border-b border-edge pb-1 mb-0.5">
              {co.nom} {co.prenom}
            </div>
            <div>
              <span className="text-content-muted text-[11px] block">Relation</span>
              <span className="text-content-secondary">{co.relation}</span>
            </div>
            <div>
              <span className="text-content-muted text-[11px] block">Téléphone</span>
              <span className="text-content-secondary">{co.telephone}</span>
            </div>
            <div className="col-span-2">
              <span className="text-content-muted text-[11px] block">Revenus mensuels</span>
              <span className="text-status-success font-mono">{formatMoney(Number(co.revenusMensuels))}</span>
            </div>
          </div>
        );
      }
      default:
        return element.description ? (
          <p className="mt-1.5 text-xs text-content-muted bg-surface-base/50 p-2 rounded border border-edge-subtle">
            {element.description}
          </p>
        ) : null;
    }
  };

  const Icon = getIcon();

  return (
    <div className="bg-surface/80 rounded-lg p-2.5 border border-edge-subtle">
      <div className="flex items-center gap-2 mb-0.5">
        <div className="p-1 rounded-md bg-surface-elevated/50 text-status-warning">
          <Icon size={13} />
        </div>
        <span className="font-semibold text-status-warning text-xs">{type}</span>
      </div>
      {renderDetails()}
    </div>
  );
}

export function NewElementsSection({ elementsNouveaux, justification, reevaluation }: NewElementsSectionProps) {
  return (
    <div className="space-y-3">
      {elementsNouveaux && elementsNouveaux.length > 0 && (
        <div className="bg-surface/50 rounded-xl p-3 border border-edge">
          <h3 className="text-[11px] font-bold text-content-muted mb-2.5 flex items-center gap-2 uppercase tracking-wider">
            <RefreshCw size={13} /> Éléments nouveaux
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {elementsNouveaux.map((el, i) => (
              <DetailedElementView key={i} element={el} reevaluation={reevaluation} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <FileText size={14} className="text-content-muted" />
          <h3 className="text-xs font-bold text-content-primary">Justification globale</h3>
        </div>
        <div className="px-3 pb-3">
          <blockquote className="text-content-secondary text-xs leading-relaxed bg-surface-subtle/50 p-2.5 rounded-lg border-l-2 border-accent italic">
            "{justification}"
          </blockquote>
        </div>
      </div>
    </div>
  );
}
