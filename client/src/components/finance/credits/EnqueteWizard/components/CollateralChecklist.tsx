import React from 'react';
import { CheckCircle, AlertCircle, Circle, FileText, Shield } from 'lucide-react';
import type { Garantie, CreditPlanInfo } from '../types';

interface CollateralChecklistProps {
  creditPlan: CreditPlanInfo;
  garanties: Garantie[];
  documents: string[];
  onSelectCollateralType?: (type: string) => void;
}

interface ItemStatus {
  type: string;
  status: 'complete' | 'partial' | 'missing';
  data: Garantie | null;
}

export default function CollateralChecklist({ creditPlan, garanties, documents, onSelectCollateralType }: CollateralChecklistProps) {
  const collateralTypes = creditPlan.collateralTypes || [];
  const requiredDocs = creditPlan.documentsRequis || [];

  const collateralStatus: ItemStatus[] = collateralTypes.map(reqType => {
    const match = garanties.find(g => g.type === reqType);
    return {
      type: reqType,
      status: match
        ? (match.description && match.valeur ? 'complete' : 'partial')
        : 'missing',
      data: match || null,
    };
  });

  const docStatus = requiredDocs.map(docName => ({
    name: docName,
    uploaded: documents.some(d => d.toLowerCase().includes(docName.toLowerCase())),
  }));

  const completedCollaterals = collateralStatus.filter(c => c.status === 'complete').length;
  const completedDocs = docStatus.filter(d => d.uploaded).length;

  const statusIcon = (status: 'complete' | 'partial' | 'missing') => {
    switch (status) {
      case 'complete': return <CheckCircle size={16} className="text-status-success" />;
      case 'partial': return <AlertCircle size={16} className="text-status-warning" />;
      case 'missing': return <Circle size={16} className="text-content-muted" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Collateral requirements */}
      {collateralTypes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-content-secondary">
              <Shield size={14} />
              Garanties Requises par le Plan
            </div>
            <span className="text-xs text-content-muted">{completedCollaterals}/{collateralTypes.length}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-surface-subtle rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${collateralTypes.length > 0 ? (completedCollaterals / collateralTypes.length) * 100 : 0}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {collateralStatus.map((item, i) => (
              <div
                key={i}
                onClick={() => item.status === 'missing' && onSelectCollateralType?.(item.type)}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs transition ${
                  item.status === 'missing' && onSelectCollateralType
                    ? 'border-edge-subtle hover:border-accent/30 cursor-pointer hover:bg-accent/5'
                    : item.status === 'complete'
                      ? 'border-status-success/20 bg-status-success-bg'
                      : item.status === 'partial'
                        ? 'border-status-warning/20 bg-status-warning-bg'
                        : 'border-edge-subtle'
                }`}
              >
                {statusIcon(item.status)}
                <span className="font-medium text-content-primary flex-1">{item.type}</span>
                {item.data && item.status !== 'missing' && (
                  <span className="text-content-muted">
                    {item.data.valeur ? `${Number(item.data.valeur).toLocaleString('fr-FR')}` : '—'}
                  </span>
                )}
                {item.status === 'missing' && onSelectCollateralType && (
                  <span className="text-accent text-[10px]">Cliquer pour ajouter</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document requirements */}
      {requiredDocs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-content-secondary">
              <FileText size={14} />
              Documents Requis par le Plan
            </div>
            <span className="text-xs text-content-muted">{completedDocs}/{requiredDocs.length}</span>
          </div>

          <div className="space-y-1.5">
            {docStatus.map((doc, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs ${
                  doc.uploaded
                    ? 'border-status-success/20 bg-status-success-bg'
                    : 'border-edge-subtle'
                }`}
              >
                {doc.uploaded
                  ? <CheckCircle size={16} className="text-status-success" />
                  : <Circle size={16} className="text-content-muted" />
                }
                <span className={`font-medium ${doc.uploaded ? 'text-content-primary' : 'text-content-muted'}`}>
                  {doc.name}
                </span>
                <span className="text-[10px] text-content-muted ml-auto">
                  {doc.uploaded ? 'Téléversé' : 'Manquant'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guarantee deposit info */}
      {creditPlan.guaranteeDepositPercent && (
        <div className="flex items-center gap-2 p-2.5 bg-status-info-bg border border-status-info/20 rounded-lg text-xs text-status-info">
          <Shield size={14} className="shrink-0" />
          Dépôt de garantie requis : {creditPlan.guaranteeDepositPercent}% du montant
        </div>
      )}
    </div>
  );
}
