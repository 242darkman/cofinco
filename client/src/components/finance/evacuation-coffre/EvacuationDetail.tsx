import React, { useState } from 'react';
import {
  X,
  Vault,
  Clock,
  User,
  Building2,
  FileText,
  Truck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Package,
  Send,
  Ban,
  Banknote,
  Scale,
  Lock,
  ArrowUpRight,
  Shield,
  History,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { StatutEvacuationCoffre, TypeDestinationEvacuation, MOTIF_EVACUATION_LABELS } from '@shared/enum/status-constants';

interface EvacuationDetailProps {
  evacuation: any;
  onClose: () => void;
  onAction: () => void;
  api: {
    submitEvacuation: (id: string) => Promise<any>;
    approveEvacuation: (id: string, commentaire?: string) => Promise<any>;
    rejectEvacuation: (id: string, reason: string) => Promise<any>;
    prepareEvacuation: (id: string, data: any) => Promise<any>;
    dispatchEvacuation: (id: string, data: any) => Promise<any>;
    depositEvacuation: (id: string, data: any) => Promise<any>;
    reconcileEvacuation: (id: string, data: any) => Promise<any>;
    cancelEvacuation: (id: string, reason: string) => Promise<any>;
  };
}

// Workflow steps
const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Brouillon', icon: FileText },
  { key: 'SUBMITTED', label: 'Soumise', icon: Send },
  { key: 'APPROVED', label: 'Approuvée', icon: CheckCircle },
  { key: 'PREPARED', label: 'Préparée', icon: Package },
  { key: 'IN_TRANSIT', label: 'En transit', icon: Truck },
  { key: 'DEPOSITED', label: 'Déposée', icon: Banknote },
  { key: 'RECONCILED', label: 'Réconciliée', icon: Shield },
];

const STATUS_INDEX: Record<string, number> = {
  DRAFT: 0, SUBMITTED: 1, APPROVED: 2, PREPARED: 3,
  IN_TRANSIT: 4, DEPOSITED: 5, RECONCILED: 6,
};

export default function EvacuationDetail({
  evacuation,
  onClose,
  onAction,
  api,
}: EvacuationDetailProps) {
  const [activeSection, setActiveSection] = useState<'info' | 'preparation' | 'deposit' | 'reconciliation' | 'audit'>('info');
  const [loading, setLoading] = useState(false);

  // Preparation form
  const [typeConditionnement, setTypeConditionnement] = useState('Sac scellé');
  const [numeroScelle, setNumeroScelle] = useState('');
  const [montantCompte, setMontantCompte] = useState('');
  const [agentsTransport, setAgentsTransport] = useState([{ nom: '', contact: '' }, { nom: '', contact: '' }]);

  // Deposit form
  const [montantDepose, setMontantDepose] = useState('');
  const [referenceBordereau, setReferenceBordereau] = useState('');

  // Reconciliation form
  const [montantConfirme, setMontantConfirme] = useState('');
  const [conforme, setConforme] = useState(true);
  const [motifEcart, setMotifEcart] = useState('');

  // Reject/Cancel reason
  const [reason, setReason] = useState('');

  const statut = evacuation.statut;
  const currentIdx = STATUS_INDEX[statut] ?? -1;
  const isTerminal = ['RECONCILED', 'DISCREPANCY', 'CANCELLED', 'REJECTED'].includes(statut);

  const executeAction = async (action: () => Promise<any>, successMessage: string) => {
    setLoading(true);
    try {
      const res = await action();
      if (res.success) {
        toast.success(successMessage);
        onAction();
      } else {
        toast.error(res.error || 'Erreur');
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => executeAction(
    () => api.submitEvacuation(evacuation.id),
    'Évacuation soumise'
  );

  const handleApprove = () => executeAction(
    () => api.approveEvacuation(evacuation.id),
    'Évacuation approuvée'
  );

  const handleReject = () => {
    if (reason.trim().length < 5) { toast.error('Motif trop court'); return; }
    executeAction(() => api.rejectEvacuation(evacuation.id, reason), 'Évacuation rejetée');
  };

  const handlePrepare = () => {
    if (!montantCompte || Number(montantCompte) <= 0) { toast.error('Montant compté requis'); return; }
    const validAgents = agentsTransport.filter(a => a.nom.trim() && a.contact.trim());
    executeAction(
      () => api.prepareEvacuation(evacuation.id, {
        typeConditionnement,
        numeroScelle: numeroScelle || undefined,
        montantCompte: Number(montantCompte),
        agentsTransport: validAgents.length > 0 ? validAgents : undefined,
      }),
      'Préparation enregistrée'
    );
  };

  const handleDispatch = () => executeAction(
    () => api.dispatchEvacuation(evacuation.id, {}),
    'Dispatch effectué — fonds en transit'
  );

  const handleDeposit = () => {
    if (!montantDepose || Number(montantDepose) <= 0) { toast.error('Montant déposé requis'); return; }
    executeAction(
      () => api.depositEvacuation(evacuation.id, {
        montantDepose: Number(montantDepose),
        referenceBordereau: referenceBordereau || undefined,
      }),
      'Dépôt enregistré'
    );
  };

  const handleReconcile = () => {
    if (!montantConfirme || Number(montantConfirme) <= 0) { toast.error('Montant confirmé requis'); return; }
    if (!conforme && motifEcart.trim().length < 5) { toast.error('Motif d\'écart requis'); return; }
    executeAction(
      () => api.reconcileEvacuation(evacuation.id, {
        montantConfirme: Number(montantConfirme),
        conforme,
        motifEcart: conforme ? undefined : motifEcart,
      }),
      conforme ? 'Réconciliation confirmée' : 'Écart signalé'
    );
  };

  const handleCancel = () => {
    if (reason.trim().length < 5) { toast.error('Motif trop court'); return; }
    executeAction(() => api.cancelEvacuation(evacuation.id, reason), 'Évacuation annulée');
  };

  // Destination display
  const destinationLabel = () => {
    switch (evacuation.typeDestination) {
      case TypeDestinationEvacuation.BANQUE:
        return `${evacuation.banqueNom || 'Banque'} — ${evacuation.banqueCompte || ''}`;
      case TypeDestinationEvacuation.COFFRE_CENTRAL:
        return evacuation.coffreDestination?.nom || evacuation.coffreDestinationId || 'Coffre Central';
      case TypeDestinationEvacuation.TRANSPORTEUR:
        return `${evacuation.transporteurNom || 'Transporteur'} — ${evacuation.transporteurContact || ''}`;
      default:
        return evacuation.typeDestination;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <div>
            <div className="flex items-center gap-2">
              <Vault size={16} className="text-status-info" />
              <h2 className="text-sm font-semibold text-content-primary">{evacuation.reference}</h2>
            </div>
            <p className="text-[10px] text-content-muted mt-0.5">
              Créée le {new Date(evacuation.createdAt).toLocaleString('fr-FR')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-content-muted hover:text-content-primary transition">
            <X size={16} />
          </button>
        </div>

        {/* Workflow Progress */}
        {!isTerminal && (
          <div className="px-4 pt-3 pb-2 border-b border-edge/50">
            <div className="flex items-center gap-0">
              {WORKFLOW_STEPS.map((step, idx) => {
                const done = idx <= currentIdx;
                const active = idx === currentIdx;
                const Icon = step.icon;
                return (
                  <React.Fragment key={step.key}>
                    {idx > 0 && (
                      <div className={`flex-1 h-0.5 ${idx <= currentIdx ? 'bg-status-info' : 'bg-surface-elevated'}`} />
                    )}
                    <div className="flex flex-col items-center" title={step.label}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        active ? 'bg-status-info text-white ring-2 ring-status-info/30' :
                        done ? 'bg-status-info-bg text-status-info' : 'bg-surface text-content-muted'
                      }`}>
                        <Icon size={11} />
                      </div>
                      <span className={`text-[8px] mt-0.5 ${active ? 'text-status-info font-bold' : done ? 'text-content-muted' : 'text-content-muted'}`}>
                        {step.label}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Terminal status banner */}
        {statut === StatutEvacuationCoffre.REJECTED && (
          <div className="mx-4 mt-3 p-2.5 bg-status-danger-bg border border-status-danger/20 rounded-lg flex items-center gap-2">
            <XCircle size={14} className="text-status-danger shrink-0" />
            <div>
              <span className="text-[11px] font-semibold text-status-danger">Rejetée</span>
              {evacuation.motifRejet && <p className="text-[10px] text-status-danger/70 mt-0.5">{evacuation.motifRejet}</p>}
            </div>
          </div>
        )}
        {statut === StatutEvacuationCoffre.CANCELLED && (
          <div className="mx-4 mt-3 p-2.5 bg-surface-subtle/30 border border-edge-strong/20 rounded-lg flex items-center gap-2">
            <Ban size={14} className="text-content-muted shrink-0" />
            <div>
              <span className="text-[11px] font-semibold text-content-muted">Annulée</span>
              {evacuation.motifAnnulation && <p className="text-[10px] text-content-muted/70 mt-0.5">{evacuation.motifAnnulation}</p>}
            </div>
          </div>
        )}
        {statut === StatutEvacuationCoffre.DISCREPANCY && (
          <div className="mx-4 mt-3 p-2.5 bg-status-danger-bg border border-status-danger/20 rounded-lg flex items-center gap-2">
            <AlertTriangle size={14} className="text-status-danger shrink-0" />
            <div>
              <span className="text-[11px] font-semibold text-status-danger">Écart détecté</span>
              {evacuation.ecartMontant && (
                <p className="text-[10px] text-status-danger/70 mt-0.5">
                  Écart: {formatMoney(evacuation.ecartMontant)} — {evacuation.motifEcart || 'Non spécifié'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Section tabs */}
        <div className="flex items-center gap-0.5 px-4 pt-2 border-b border-edge/50">
          {[
            { id: 'info' as const, label: 'Détails' },
            ...(statut === StatutEvacuationCoffre.APPROVED || evacuation.montantCompte ? [{ id: 'preparation' as const, label: 'Préparation' }] : []),
            ...(statut === StatutEvacuationCoffre.IN_TRANSIT || evacuation.montantDepose ? [{ id: 'deposit' as const, label: 'Dépôt' }] : []),
            ...(statut === StatutEvacuationCoffre.DEPOSITED || evacuation.montantConfirme ? [{ id: 'reconciliation' as const, label: 'Réconciliation' }] : []),
            { id: 'audit' as const, label: 'Audit' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`px-2.5 py-2 text-[10px] font-medium transition relative ${
                activeSection === tab.id ? 'text-status-info' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {tab.label}
              {activeSection === tab.id && (
                <span className="absolute bottom-0 inset-x-1 h-[2px] bg-status-info rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {activeSection === 'info' && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Montant" value={formatMoney(evacuation.montant)} bold />
                <InfoRow label="Statut" value={statut} />
                <InfoRow label="Coffre source" value={evacuation.coffreSource?.nom || evacuation.coffreSourceId} />
                <InfoRow label="Type destination" value={
                  evacuation.typeDestination === TypeDestinationEvacuation.BANQUE ? 'Banque' :
                  evacuation.typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL ? 'Coffre Central' :
                  'Transporteur'
                } />
                <InfoRow label="Destination" value={destinationLabel()} span2 />
                <InfoRow label="Motif" value={MOTIF_EVACUATION_LABELS[evacuation.motifEvacuation as keyof typeof MOTIF_EVACUATION_LABELS] || evacuation.motifEvacuation} />
                <InfoRow label="Détail" value={evacuation.motifDetail || '—'} />
              </div>

              {/* Workflow participants */}
              {(evacuation.submittedBy || evacuation.approvedBy || evacuation.preparedBy) && (
                <div className="mt-3 p-3 bg-surface/30 border border-edge/40 rounded-lg">
                  <h4 className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-2">Intervenants</h4>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {evacuation.createdByName && <InfoRow label="Créé par" value={evacuation.createdByName} />}
                    {evacuation.submittedAt && <InfoRow label="Soumis" value={new Date(evacuation.submittedAt).toLocaleString('fr-FR')} />}
                    {evacuation.approvedByName && <InfoRow label="Approuvé par" value={evacuation.approvedByName} />}
                    {evacuation.preparedByName && <InfoRow label="Préparé par" value={evacuation.preparedByName} />}
                    {evacuation.dispatchedByName && <InfoRow label="Dispatché par" value={evacuation.dispatchedByName} />}
                    {evacuation.depositedByName && <InfoRow label="Déposé par" value={evacuation.depositedByName} />}
                    {evacuation.reconciledByName && <InfoRow label="Réconcilié par" value={evacuation.reconciledByName} />}
                  </div>
                </div>
              )}
            </>
          )}

          {activeSection === 'preparation' && (
            <div className="space-y-3">
              {evacuation.montantCompte ? (
                // Read-only: preparation already done
                <div className="space-y-2">
                  <InfoRow label="Montant compté" value={formatMoney(evacuation.montantCompte)} bold />
                  <InfoRow label="Écart préparation" value={formatMoney(evacuation.ecartPreparation || 0)} />
                  <InfoRow label="Conditionnement" value={evacuation.typeConditionnement || '—'} />
                  <InfoRow label="N° scellé" value={evacuation.numeroScelle || '—'} />
                  {evacuation.agentsTransport && (
                    <div>
                      <span className="text-[10px] text-content-muted">Agents transport:</span>
                      {evacuation.agentsTransport.map((a: any, i: number) => (
                        <p key={i} className="text-[10px] text-content-primary ml-2">{a.nom} — {a.contact}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : statut === StatutEvacuationCoffre.APPROVED ? (
                // Preparation form
                <div className="space-y-3">
                  <p className="text-[10px] text-content-muted">Comptez les fonds physiquement et enregistrez la préparation.</p>
                  <div>
                    <label className="block text-[10px] font-bold text-content-muted mb-1">Montant compté (FCFA)</label>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={montantCompte}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontantCompte(v); }}
                      placeholder={evacuation.montant}
                      className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">Conditionnement</label>
                      <select
                        value={typeConditionnement}
                        onChange={(e) => setTypeConditionnement(e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary focus:outline-none focus:border-status-info/50"
                      >
                        <option>Sac scellé</option>
                        <option>Mallette sécurisée</option>
                        <option>Enveloppe scellée</option>
                        <option>Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">N° scellé (optionnel)</label>
                      <input
                        type="text"
                        value={numeroScelle}
                        onChange={(e) => setNumeroScelle(e.target.value)}
                        placeholder="N° du scellé"
                        className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-content-muted mb-1">Agents de transport</label>
                    {agentsTransport.map((agent, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={agent.nom}
                          onChange={(e) => {
                            const updated = [...agentsTransport];
                            updated[idx] = { ...updated[idx], nom: e.target.value };
                            setAgentsTransport(updated);
                          }}
                          placeholder={`Agent ${idx + 1} — Nom`}
                          className="px-3 py-1.5 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                        />
                        <input
                          type="text"
                          value={agent.contact}
                          onChange={(e) => {
                            const updated = [...agentsTransport];
                            updated[idx] = { ...updated[idx], contact: e.target.value };
                            setAgentsTransport(updated);
                          }}
                          placeholder="Contact"
                          className="px-3 py-1.5 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                        />
                      </div>
                    ))}
                  </div>

                  <Button size="sm" onClick={handlePrepare} disabled={loading}>
                    <Package size={12} className="mr-1" />
                    {loading ? 'En cours...' : 'Valider la préparation'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {activeSection === 'deposit' && (
            <div className="space-y-3">
              {evacuation.montantDepose ? (
                <div className="space-y-2">
                  <InfoRow label="Montant déposé" value={formatMoney(evacuation.montantDepose)} bold />
                  <InfoRow label="Référence bordereau" value={evacuation.referenceBordereau || '—'} />
                  <InfoRow label="Heure de dépôt" value={evacuation.depositedAt ? new Date(evacuation.depositedAt).toLocaleString('fr-FR') : '—'} />
                </div>
              ) : statut === StatutEvacuationCoffre.IN_TRANSIT ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-content-muted">Confirmez le dépôt des fonds à destination.</p>
                  <div>
                    <label className="block text-[10px] font-bold text-content-muted mb-1">Montant déposé (FCFA)</label>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={montantDepose}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontantDepose(v); }}
                      placeholder={evacuation.montant}
                      className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-content-muted mb-1">Référence bordereau (optionnel)</label>
                    <input
                      type="text"
                      value={referenceBordereau}
                      onChange={(e) => setReferenceBordereau(e.target.value)}
                      placeholder="N° bordereau de remise"
                      className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                    />
                  </div>
                  <Button size="sm" onClick={handleDeposit} disabled={loading}>
                    <Banknote size={12} className="mr-1" />
                    {loading ? 'En cours...' : 'Confirmer le dépôt'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {activeSection === 'reconciliation' && (
            <div className="space-y-3">
              {evacuation.montantConfirme ? (
                <div className="space-y-2">
                  <InfoRow label="Montant confirmé" value={formatMoney(evacuation.montantConfirme)} bold />
                  <InfoRow label="Conforme" value={evacuation.conforme ? 'Oui' : 'Non'} />
                  {evacuation.ecartMontant && <InfoRow label="Écart" value={formatMoney(evacuation.ecartMontant)} />}
                  {evacuation.motifEcart && <InfoRow label="Motif écart" value={evacuation.motifEcart} />}
                </div>
              ) : statut === StatutEvacuationCoffre.DEPOSITED ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-content-muted">Réconciliez le montant réellement reçu avec le montant évacué.</p>
                  <div>
                    <label className="block text-[10px] font-bold text-content-muted mb-1">Montant confirmé par destination (FCFA)</label>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={montantConfirme}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        setMontantConfirme(v);
                        const confirmed = Number(v);
                        const original = Number(evacuation.montant);
                        setConforme(confirmed === original);
                      }}
                      placeholder={evacuation.montant}
                      className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                    />
                    {montantConfirme && Number(montantConfirme) !== Number(evacuation.montant) && (
                      <p className="text-[10px] text-status-warning mt-1">
                        Écart détecté: {formatMoney(Number(montantConfirme) - Number(evacuation.montant))}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="conforme"
                      checked={conforme}
                      onChange={(e) => setConforme(e.target.checked)}
                      className="rounded border-edge-strong"
                    />
                    <label htmlFor="conforme" className="text-[10px] text-content-muted">Montant conforme</label>
                  </div>

                  {!conforme && (
                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">Motif de l'écart</label>
                      <textarea
                        value={motifEcart}
                        onChange={(e) => setMotifEcart(e.target.value)}
                        placeholder="Décrivez la raison de l'écart..."
                        rows={2}
                        className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50 resize-none"
                      />
                    </div>
                  )}

                  <Button size="sm" onClick={handleReconcile} disabled={loading}>
                    <Scale size={12} className="mr-1" />
                    {loading ? 'En cours...' : conforme ? 'Confirmer la réconciliation' : 'Signaler l\'écart'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="space-y-2">
              {evacuation.auditLogs?.length > 0 ? (
                evacuation.auditLogs.map((log: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-surface/30 border border-edge-subtle rounded-lg">
                    <History size={12} className="text-content-muted mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-content-primary">{log.action}</span>
                        <span className="text-[9px] text-content-muted">{log.statutAvant} → {log.statutApres}</span>
                      </div>
                      <p className="text-[10px] text-content-muted mt-0.5">
                        {log.userName || 'Système'} — {new Date(log.createdAt).toLocaleString('fr-FR')}
                      </p>
                      {log.details && typeof log.details === 'object' && log.details.commentaire && (
                        <p className="text-[10px] text-content-muted mt-0.5 italic">{log.details.commentaire}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-content-muted text-center py-4">Aucun log d'audit</p>
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-edge">
          <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>

          <div className="flex items-center gap-2">
            {/* Cancel — available in early states */}
            {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(statut) && (
              <div className="flex items-center gap-1">
                {reason !== undefined && statut !== 'DRAFT' ? (
                  <>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motif..."
                      className="px-2 py-1 bg-surface border border-edge rounded text-[10px] text-content-primary placeholder:text-content-muted w-32 focus:outline-none"
                    />
                    <Button variant="danger" size="sm" onClick={handleCancel} disabled={loading}>
                      <Ban size={11} className="mr-1" /> Annuler
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setReason('')} disabled={loading}>
                    <Ban size={11} className="mr-1" /> Annuler
                  </Button>
                )}
              </div>
            )}

            {/* State-specific actions */}
            {statut === StatutEvacuationCoffre.DRAFT && (
              <Button size="sm" onClick={handleSubmit} disabled={loading}>
                <Send size={12} className="mr-1" />
                {loading ? 'Envoi...' : 'Soumettre'}
              </Button>
            )}

            {statut === StatutEvacuationCoffre.SUBMITTED && (
              <>
                <Button variant="danger" size="sm" onClick={() => {
                  if (reason.trim().length < 5) { toast.error('Motif requis pour rejeter'); return; }
                  handleReject();
                }} disabled={loading}>
                  <XCircle size={12} className="mr-1" /> Rejeter
                </Button>
                <Button size="sm" onClick={handleApprove} disabled={loading}>
                  <CheckCircle size={12} className="mr-1" /> Approuver
                </Button>
              </>
            )}

            {statut === StatutEvacuationCoffre.PREPARED && (
              <Button size="sm" onClick={handleDispatch} disabled={loading}>
                <Truck size={12} className="mr-1" />
                {loading ? 'Dispatch...' : 'Dispatcher les fonds'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component
function InfoRow({ label, value, bold, span2 }: { label: string; value: string; bold?: boolean; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <span className="text-[10px] text-content-muted block">{label}</span>
      <span className={`text-[11px] ${bold ? 'font-bold text-content-primary' : 'text-content-secondary'}`}>{value}</span>
    </div>
  );
}
