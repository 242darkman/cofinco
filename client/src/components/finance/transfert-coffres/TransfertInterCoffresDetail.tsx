import React from 'react';
import {
  X,
  ArrowRight,
  Calendar,
  Clock,
  User,
  Building2,
  FileText,
  Download,
  Vault,
  Package,
  Shield,
  Truck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  History,
  Lock,
  Hash,
  Users,
  Phone,
  MessageSquare,
  Scale,
  ChevronRight,
} from 'lucide-react';
import { Button, Badge, Modal } from '@/components/ui';
import { formatMoney } from '../../../lib/format';

interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  ownerId?: string;
  solde: string;
  devise: string;
  agenceNom?: string;
}

interface TransfertInterCoffre {
  id: string;
  reference: string;
  dateTransfert: string;
  coffreSourceId: string;
  coffreDestinationId: string;
  montant: string;
  devise: string;
  typeTransfert: string;
  typeConditionnement: string;
  numeroScelle?: string;
  motif: string;
  statut: string;
  agentsTransport?: Array<{ nom: string; contact: string }>;
  coffreSource?: CoffreFort;
  coffreDestination?: CoffreFort;
  createdAt: string;
  dateComptable?: string;
  createdBy?: string;
  approvedByN1?: string;
  approvedAtN1?: string;
  approvedByN2?: string;
  approvedAtN2?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  heureReception?: string;
  montantRecu?: string;
  conforme?: boolean;
  commentaireReception?: string;
  ecartMontant?: string;
  motifEcart?: string;
  verrouille?: boolean;
  motifRejet?: string;
  motifAnnulation?: string;
  createur?: { nom: string; prenom: string };
  approbateurN1?: { nom: string; prenom: string };
  approbateurN2?: { nom: string; prenom: string };
  dispatcher?: { nom: string; prenom: string };
  recepteur?: { nom: string; prenom: string };
}

interface DocumentTransfert {
  id: string;
  type: string;
  contenuData?: any;
  fichierUrl?: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  statutAvant?: string;
  statutApres?: string;
  details?: any;
  userId: string;
  userRole: string;
  createdAt: string;
  utilisateur?: { nom: string; prenom: string };
}

interface Reconciliation {
  id: string;
  montant: string;
  statut: string;
  dateRapprochement?: string;
}

interface TransfertInterCoffresDetailProps {
  transfert: TransfertInterCoffre;
  documents?: DocumentTransfert[];
  auditLogs?: AuditLog[];
  reconciliation?: Reconciliation;
  onClose: () => void;
  onAction: (action: 'approve' | 'dispatch' | 'receive' | 'cancel') => void;
}

export default function TransfertInterCoffresDetail({
  transfert,
  documents = [],
  auditLogs = [],
  reconciliation,
  onClose,
  onAction,
}: TransfertInterCoffresDetailProps) {
  // Status configuration
  const getStatutConfig = (statut: string) => {
    const configs: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
      'Brouillon': { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: <FileText size={18} /> },
      'Soumis': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <Clock size={18} /> },
      'Approuvé N1': { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: <Shield size={18} /> },
      'Approuvé N2': { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', icon: <Shield size={18} /> },
      'En transit': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <Truck size={18} /> },
      'Reçu': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <CheckCircle size={18} /> },
      'Reçu avec écart': { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: <AlertTriangle size={18} /> },
      'Rejeté': { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: <XCircle size={18} /> },
      'Annulé': { color: 'text-slate-500', bg: 'bg-slate-600/10', border: 'border-slate-600/30', icon: <X size={18} /> },
    };
    return configs[statut] || configs['Brouillon'];
  };

  const statutConfig = getStatutConfig(transfert.statut);

  // Workflow steps
  const workflowSteps = [
    { key: 'created', label: 'Création', icon: <FileText size={16} />, date: transfert.createdAt, user: transfert.createur },
    { key: 'submitted', label: 'Soumission', icon: <Clock size={16} />, date: transfert.statut !== 'Brouillon' ? transfert.createdAt : null },
    { key: 'approvedN1', label: 'Approbation N1', icon: <Shield size={16} />, date: transfert.approvedAtN1, user: transfert.approbateurN1 },
    { key: 'approvedN2', label: 'Approbation N2', icon: <Shield size={16} />, date: transfert.approvedAtN2, user: transfert.approbateurN2 },
    { key: 'dispatched', label: 'Dispatch', icon: <Truck size={16} />, date: transfert.dispatchedAt, user: transfert.dispatcher },
    { key: 'received', label: 'Réception', icon: <Package size={16} />, date: transfert.receivedAt, user: transfert.recepteur },
  ];

  const getActiveStep = () => {
    if (transfert.receivedAt) return 5;
    if (transfert.dispatchedAt) return 4;
    if (transfert.approvedAtN2) return 3;
    if (transfert.approvedAtN1) return 2;
    if (transfert.statut !== 'Brouillon') return 1;
    return 0;
  };

  const activeStep = getActiveStep();

  // Available actions based on status
  const getAvailableActions = () => {
    const actions: Array<{
      key: string;
      label: string;
      icon: React.ReactNode;
      variant: 'primary' | 'success' | 'warning' | 'danger';
      action: 'approve' | 'dispatch' | 'receive' | 'cancel';
    }> = [];

    switch (transfert.statut) {
      case 'Soumis':
        actions.push({ key: 'approve_l1', label: 'Approuver N1', icon: <Shield size={16} />, variant: 'success', action: 'approve' });
        actions.push({ key: 'cancel', label: 'Annuler', icon: <X size={16} />, variant: 'danger', action: 'cancel' });
        break;
      case 'Approuvé N1':
        actions.push({ key: 'approve_l2', label: 'Approuver N2', icon: <Shield size={16} />, variant: 'primary', action: 'approve' });
        actions.push({ key: 'cancel', label: 'Annuler', icon: <X size={16} />, variant: 'danger', action: 'cancel' });
        break;
      case 'Approuvé N2':
        actions.push({ key: 'dispatch', label: 'Dispatcher', icon: <Truck size={16} />, variant: 'warning', action: 'dispatch' });
        break;
      case 'En transit':
        actions.push({ key: 'receive', label: 'Réceptionner', icon: <Package size={16} />, variant: 'success', action: 'receive' });
        break;
    }

    return actions;
  };

  const availableActions = getAvailableActions();

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAuditAction = (action: string) => {
    const labels: Record<string, string> = {
      'CREATED': 'Création',
      'SUBMITTED': 'Soumission',
      'APPROVED_L1': 'Approbation N1',
      'APPROVED_L2': 'Approbation N2',
      'REJECTED': 'Rejet',
      'DISPATCHED': 'Dispatch',
      'RECEIVED': 'Réception',
      'RECEIVED_WITH_DISCREPANCY': 'Réception avec écart',
      'CANCELLED': 'Annulation',
    };
    return labels[action] || action;
  };

  return (
    <Modal isOpen onClose={onClose} size="xl" title="">
      <div className="max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`p-6 rounded-t-2xl ${statutConfig.bg} ${statutConfig.border} border-b`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${statutConfig.bg} ${statutConfig.color}`}>
                {statutConfig.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {transfert.reference}
                  {transfert.verrouille && (
                    <span title="Transfert verrouillé">
                      <Lock size={16} className="text-amber-400" />
                    </span>
                  )}
                </h2>
                <p className={`text-sm ${statutConfig.color}`}>{transfert.statut}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Route display */}
          <div className="flex items-center justify-center gap-4 py-4 bg-slate-950/30 rounded-xl">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-slate-800 flex items-center justify-center">
                <Building2 size={24} className="text-slate-400" />
              </div>
              <p className="font-medium text-white text-sm">
                {transfert.coffreSource?.agenceNom || transfert.coffreSource?.nom || 'Source'}
              </p>
              <p className="text-xs text-slate-500">{transfert.coffreSource?.code}</p>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full">
                <span className="text-xs text-slate-400 uppercase">{transfert.typeTransfert.replace(/_/g, ' → ')}</span>
                <ArrowRight size={16} className="text-cyan-400" />
              </div>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Vault size={24} className="text-cyan-400" />
              </div>
              <p className="font-medium text-white text-sm">
                {transfert.coffreDestination?.agenceNom || transfert.coffreDestination?.nom || 'Destination'}
              </p>
              <p className="text-xs text-slate-500">{transfert.coffreDestination?.code}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="text-center mt-4">
            <p className="text-3xl font-bold text-white">
              {formatMoney(parseFloat(transfert.montant))}
              <span className="text-lg text-slate-400 ml-2">{transfert.devise}</span>
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Workflow Timeline */}
          <section>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <History size={16} /> Progression
            </h3>
            <div className="relative">
              {/* Progress line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-800" />
              <div
                className="absolute left-6 top-0 w-0.5 bg-gradient-to-b from-cyan-500 to-emerald-500 transition-all duration-500"
                style={{ height: `${(activeStep / (workflowSteps.length - 1)) * 100}%` }}
              />

              <div className="space-y-4 relative">
                {workflowSteps.map((step, index) => {
                  const isCompleted = index <= activeStep && step.date;
                  const isCurrent = index === activeStep;

                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                          isCompleted
                            ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-900 text-slate-600 border border-slate-700'
                        } ${isCurrent ? 'ring-2 ring-cyan-500/50' : ''}`}
                      >
                        {step.icon}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className={`font-medium ${isCompleted ? 'text-white' : 'text-slate-500'}`}>
                          {step.label}
                        </p>
                        {step.date && (
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDate(step.date)}
                            {step.user && (
                              <span className="text-slate-400 ml-2">
                                par {step.user.prenom} {step.user.nom}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Details Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Transfer Info */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <FileText size={16} className="text-slate-400" /> Informations
              </h4>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Date de transfert</span>
                  <span className="text-sm text-white">
                    {new Date(transfert.dateTransfert).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {transfert.dateComptable && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Date comptable</span>
                    <span className="text-sm text-white">{transfert.dateComptable}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Conditionnement</span>
                  <span className="text-sm text-white">{transfert.typeConditionnement}</span>
                </div>
                {transfert.numeroScelle && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">N° Scellé</span>
                    <span className="text-sm text-cyan-400 font-mono">{transfert.numeroScelle}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Transport Agents */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Users size={16} className="text-slate-400" /> Agents de transport
              </h4>

              {transfert.agentsTransport && transfert.agentsTransport.length > 0 ? (
                <div className="space-y-2">
                  {transfert.agentsTransport.map((agent, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-950/50 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                          <User size={14} className="text-slate-400" />
                        </div>
                        <span className="text-sm text-white">{agent.nom}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone size={12} /> {agent.contact}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">Aucun agent défini</p>
              )}
            </div>
          </section>

          {/* Motif */}
          {transfert.motif && (
            <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-2">
                <MessageSquare size={16} className="text-slate-400" /> Motif
              </h4>
              <p className="text-sm text-slate-400">{transfert.motif}</p>
            </section>
          )}

          {/* Reception Info (if received) */}
          {(transfert.statut === 'Reçu' || transfert.statut === 'Reçu avec écart') && (
            <section className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                <Package size={16} /> Réception
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Montant reçu</p>
                  <p className="text-lg font-bold text-white">
                    {formatMoney(parseFloat(transfert.montantRecu || transfert.montant))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Conformité</p>
                  <Badge
                    value={transfert.conforme ? 'Conforme' : 'Non conforme'}
                    variant={transfert.conforme ? 'success' : 'danger'}
                  />
                </div>
              </div>

              {/* Ecart */}
              {transfert.ecartMontant && parseFloat(transfert.ecartMontant) !== 0 && (
                <div className="bg-orange-950/30 border border-orange-700/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale size={16} className="text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">Écart détecté</span>
                  </div>
                  <p className="text-lg font-bold text-orange-300">
                    {formatMoney(Math.abs(parseFloat(transfert.ecartMontant)))}
                  </p>
                  {transfert.motifEcart && (
                    <p className="text-xs text-slate-400 mt-2">Motif: {transfert.motifEcart}</p>
                  )}
                </div>
              )}

              {transfert.commentaireReception && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Commentaire</p>
                  <p className="text-sm text-slate-400">{transfert.commentaireReception}</p>
                </div>
              )}
            </section>
          )}

          {/* Rejection/Cancellation reason */}
          {transfert.motifRejet && (
            <section className="bg-red-950/20 border border-red-800/30 rounded-xl p-4">
              <h4 className="text-sm font-medium text-red-300 flex items-center gap-2 mb-2">
                <XCircle size={16} /> Motif de rejet
              </h4>
              <p className="text-sm text-red-200">{transfert.motifRejet}</p>
            </section>
          )}

          {transfert.motifAnnulation && (
            <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-2">
                <X size={16} /> Motif d'annulation
              </h4>
              <p className="text-sm text-slate-400">{transfert.motifAnnulation}</p>
            </section>
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FileText size={16} /> Documents ({documents.length})
              </h3>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-800">
                        <FileText size={16} className="text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{doc.type}</p>
                        <p className="text-xs text-slate-500">{formatDate(doc.createdAt)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-cyan-400"
                    >
                      <Download size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Reconciliation */}
          {reconciliation && (
            <section className="bg-indigo-950/20 border border-indigo-800/30 rounded-xl p-4">
              <h4 className="text-sm font-medium text-indigo-300 flex items-center gap-2 mb-3">
                <Scale size={16} /> Réconciliation comptable
              </h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Statut</p>
                  <Badge
                    value={reconciliation.statut}
                    variant={reconciliation.statut === 'Rapproché' ? 'success' : 'warning'}
                  />
                </div>
                {reconciliation.dateRapprochement && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Date de rapprochement</p>
                    <p className="text-sm text-white">{formatDate(reconciliation.dateRapprochement)}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Audit Trail */}
          {auditLogs.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
                <History size={16} /> Historique d'audit ({auditLogs.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 bg-slate-900/30 border border-slate-800/50 rounded-lg text-sm"
                  >
                    <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{formatAuditAction(log.action)}</span>
                        <span className="text-xs text-slate-500">{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                        {log.utilisateur && (
                          <span>
                            {log.utilisateur.prenom} {log.utilisateur.nom}
                          </span>
                        )}
                        {log.statutAvant && log.statutApres && (
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">{log.statutAvant}</span>
                            <ChevronRight size={12} />
                            <span className="text-cyan-400">{log.statutApres}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer Actions */}
        {availableActions.length > 0 && (
          <div className="p-6 border-t border-slate-800 bg-slate-900/50">
            <div className="flex flex-wrap gap-3 justify-end">
              {availableActions.map((action) => (
                <Button
                  key={action.key}
                  onClick={() => onAction(action.action)}
                  variant={action.variant}
                  className={
                    action.variant === 'primary'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'
                      : action.variant === 'success'
                      ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500'
                      : action.variant === 'warning'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'
                      : 'bg-red-600 hover:bg-red-500'
                  }
                >
                  {action.icon}
                  <span className="ml-2">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
