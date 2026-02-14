import React, { useRef } from 'react';
import {
  X,
  ArrowRightLeft,
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
  Users,
  Phone,
  MessageSquare,
  Scale,
  ChevronRight,
  Tag,
  Calendar,
  Printer,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { formatMoney } from '../../../lib/format';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { InternalOperationReceipt, InternalOperationReceiptData } from '../../ui/printable';
import { useReactToPrint } from 'react-to-print';
import { currencyCode } from '@shared/config/currency';

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
  // Print functionality
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Transfert-${transfert.reference}`,
  });

  // Build receipt data for printing
  const buildReceiptData = (): InternalOperationReceiptData => ({
    reference: transfert.reference,
    date: transfert.dateTransfert || transfert.createdAt,
    type: 'TRANSFER_INTER_CAISSE',
    montant: parseFloat(transfert.montant),
    devise: transfert.devise || currencyCode(),
    source: transfert.coffreSource ? {
      type: 'COFFRE',
      id: transfert.coffreSource.id,
      nom: transfert.coffreSource.agenceNom || transfert.coffreSource.nom,
      code: transfert.coffreSource.code,
    } : undefined,
    destination: transfert.coffreDestination ? {
      type: 'COFFRE',
      id: transfert.coffreDestination.id,
      nom: transfert.coffreDestination.agenceNom || transfert.coffreDestination.nom,
      code: transfert.coffreDestination.code,
    } : undefined,
    autorisation: transfert.approbateurN2 ? {
      par: `${transfert.approbateurN2.prenom || ''} ${transfert.approbateurN2.nom || ''}`.trim(),
      role: 'Approbateur N2',
      date: transfert.approvedAtN2 || undefined,
    } : transfert.approbateurN1 ? {
      par: `${transfert.approbateurN1.prenom || ''} ${transfert.approbateurN1.nom || ''}`.trim(),
      role: 'Approbateur N1',
      date: transfert.approvedAtN1 || undefined,
    } : undefined,
    motif: transfert.motif || undefined,
    statut: transfert.statut === 'Reçu' ? 'VALIDE'
      : transfert.statut === 'Annulé' ? 'ANNULE'
      : transfert.statut === 'Rejeté' ? 'REJETE'
      : 'EN_ATTENTE',
    operateur: transfert.createur ? {
      nom: transfert.createur.nom || '',
      prenom: transfert.createur.prenom,
    } : undefined,
    details: [
      { label: 'Type de transfert', value: transfert.typeTransfert.replace(/_/g, ' → ') },
      { label: 'Conditionnement', value: transfert.typeConditionnement },
      ...(transfert.numeroScelle ? [{ label: 'N° Scellé', value: transfert.numeroScelle }] : []),
    ],
    footerMessage: transfert.commentaireReception || undefined,
  });

  // Status configuration
  const getStatutConfig = (statut: string) => {
    const configs: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
      'Brouillon': { color: 'text-content-muted', bg: 'bg-surface-subtle/30', border: 'border-edge-strong/30', icon: <FileText size={18} /> },
      'Soumis': { color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/30', icon: <Clock size={18} /> },
      'Approuvé N1': { color: 'text-status-info', bg: 'bg-status-info-bg', border: 'border-status-info/30', icon: <Shield size={18} /> },
      'Approuvé N2': { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', icon: <Shield size={18} /> },
      'En transit': { color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/30', icon: <Truck size={18} /> },
      'Reçu': { color: 'text-status-success', bg: 'bg-status-success-bg', border: 'border-status-success/30', icon: <CheckCircle size={18} /> },
      'Reçu avec écart': { color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/30', icon: <AlertTriangle size={18} /> },
      'Rejeté': { color: 'text-status-danger', bg: 'bg-status-danger-bg', border: 'border-status-danger/30', icon: <XCircle size={18} /> },
      'Annulé': { color: 'text-content-muted', bg: 'bg-surface-subtle/10', border: 'border-edge-strong/30', icon: <X size={18} /> },
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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slider Panel */}
      <div
        className="
          fixed inset-y-0 right-0 z-50
          w-full max-w-xl lg:max-w-2xl
          bg-surface-base border-l border-edge-subtle
          shadow-2xl shadow-black/50
          flex flex-col
          animate-in slide-in-from-right duration-300
        "
        onClick={(e) => e.stopPropagation()}
      >
          {/* ═══════════════════════════════════════════════════════════════════
              HEADER - Reference & Status
          ═══════════════════════════════════════════════════════════════════ */}
          <div className={`flex-shrink-0 p-4 sm:p-5 border-b border-edge-subtle ${statutConfig.bg}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${statutConfig.bg} ${statutConfig.border} border`}>
                  {statutConfig.icon}
                  <span className={statutConfig.color} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
                    {transfert.reference}
                    {transfert.verrouille && (
                      <span title="Transfert verrouillé" className="p-0.5 rounded bg-status-warning-bg">
                        <Lock size={12} className="text-status-warning" />
                      </span>
                    )}
                  </h2>
                  <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${statutConfig.color}`}>
                    {statutConfig.icon}
                    <span>{ALL_STATUS_LABELS[transfert.statut] || transfert.statut}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePrint()}
                  className="p-2 rounded-lg bg-surface/80 hover:bg-accent-secondary-hover/20 text-content-muted hover:text-accent transition-all border border-edge-subtle"
                  title="Imprimer le reçu"
                >
                  <Printer size={18} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-surface/80 hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-all border border-edge-subtle"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                HERO SECTION - Transfer Flow & Amount
            ───────────────────────────────────────────────────────────────── */}
            <div className="bg-surface-base/40 rounded-xl p-4 border border-edge/50">
              {/* Transfer Route - Horizontal */}
              <div className="flex items-center justify-center gap-3 sm:gap-6 mb-4">
                {/* Source */}
                <div className="text-center flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-surface-elevated to-surface border border-edge-strong flex items-center justify-center shadow-lg">
                    <Building2 size={22} className="text-content-secondary" />
                  </div>
                  <p className="font-semibold text-content-primary text-xs sm:text-sm max-w-[80px] sm:max-w-[120px] truncate">
                    {transfert.coffreSource?.nom || 'Coffre Source'}
                  </p>
                  <p className="text-[10px] text-content-muted">{transfert.coffreSource?.code}</p>
                </div>

                {/* Arrow with Type */}
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="px-2 py-1 bg-surface/80 rounded-full text-[10px] text-content-muted uppercase tracking-wide mb-1.5">
                    {transfert.typeTransfert.replace(/_/g, ' → ')}
                  </div>
                  <div className="relative">
                    <div className="w-10 sm:w-16 h-0.5 bg-gradient-to-r from-accent/50 via-accent to-accent/50 rounded-full" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="p-1 rounded-full bg-accent/10 border border-accent/40">
                        <ArrowRightLeft size={12} className="text-accent" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="text-center flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-accent/10 border border-accent/50 flex items-center justify-center shadow-lg shadow-accent/10">
                    <Vault size={22} className="text-accent" />
                  </div>
                  <p className="font-semibold text-content-primary text-xs sm:text-sm max-w-[80px] sm:max-w-[120px] truncate">
                    {transfert.coffreDestination?.nom || 'Coffre Destination'}
                  </p>
                  <p className="text-[10px] text-content-muted">{transfert.coffreDestination?.code}</p>
                </div>
              </div>

              {/* Amount - Centered */}
              <div className="text-center py-3 bg-surface-base/60 rounded-lg border border-edge">
                <p className="text-2xl sm:text-3xl font-bold text-content-primary tracking-tight">
                  {formatMoney(parseFloat(transfert.montant))}
                </p>
                <p className="text-xs text-content-muted mt-0.5 font-medium uppercase tracking-wider">
                  {transfert.devise}
                </p>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SCROLLABLE CONTENT (single overflow container)
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">

            {/* ─────────────────────────────────────────────────────────────────
                PROGRESSION TIMELINE
            ───────────────────────────────────────────────────────────────── */}
            <section className="bg-surface/30 border border-edge-subtle rounded-xl p-5">
              <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider mb-5 flex items-center gap-2">
                <History size={16} /> Progression
              </h3>
              <div className="relative">
                {/* Progress line */}
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-elevated" />
                <div
                  className="absolute left-5 top-0 w-0.5 bg-gradient-to-b from-accent to-status-success transition-all duration-500"
                  style={{ height: `${(activeStep / (workflowSteps.length - 1)) * 100}%` }}
                />

                <div className="space-y-4 relative">
                  {workflowSteps.map((step, index) => {
                    const isCompleted = index <= activeStep && step.date;
                    const isCurrent = index === activeStep;

                    return (
                      <div key={step.key} className="flex items-start gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                            isCompleted
                              ? 'bg-gradient-to-br from-accent/20 to-status-success/20 text-accent border border-accent/30'
                              : 'bg-surface text-content-muted border border-edge'
                          } ${isCurrent ? 'ring-2 ring-accent/50 ring-offset-2 ring-offset-surface-base' : ''}`}
                        >
                          {step.icon}
                        </div>
                        <div className="flex-1 pt-0.5">
                          <p className={`font-medium ${isCompleted ? 'text-content-primary' : 'text-content-muted'}`}>
                            {step.label}
                          </p>
                          {step.date && (
                            <p className="text-xs text-content-muted mt-1">
                              {formatDate(step.date)}
                              {step.user && (
                                <span className="text-content-muted ml-2">
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

            {/* ─────────────────────────────────────────────────────────────────
                DETAILS GRID - 3 columns on desktop
            ───────────────────────────────────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Date de transfert */}
              <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-elevated/50">
                  <Calendar size={18} className="text-content-muted" />
                </div>
                <div>
                  <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Date de transfert</p>
                  <p className="text-base text-content-primary font-medium">
                    {new Date(transfert.dateTransfert).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Conditionnement */}
              <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-elevated/50">
                  <Package size={18} className="text-content-muted" />
                </div>
                <div>
                  <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Conditionnement</p>
                  <p className="text-base text-content-primary font-medium">{transfert.typeConditionnement}</p>
                </div>
              </div>

              {/* N° Scellé */}
              {transfert.numeroScelle && (
                <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Lock size={18} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-content-muted uppercase tracking-wide mb-1">N° Scellé</p>
                    <p className="text-base text-accent font-mono font-medium">{transfert.numeroScelle}</p>
                  </div>
                </div>
              )}

              {/* Date comptable */}
              {transfert.dateComptable && (
                <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-surface-elevated/50">
                    <Clock size={18} className="text-content-muted" />
                  </div>
                  <div>
                    <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Date comptable</p>
                    <p className="text-base text-content-primary font-medium">{transfert.dateComptable}</p>
                  </div>
                </div>
              )}

              {/* Type */}
              <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-elevated/50">
                  <Tag size={18} className="text-content-muted" />
                </div>
                <div>
                  <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Type</p>
                  <p className="text-base text-content-primary font-medium">{transfert.typeTransfert.replace(/_/g, ' → ')}</p>
                </div>
              </div>
            </section>

            {/* Transport Agents */}
            {transfert.agentsTransport && transfert.agentsTransport.length > 0 && (
              <section className="bg-surface/50 border border-edge-subtle rounded-xl p-5">
                <h4 className="text-sm font-semibold text-content-secondary flex items-center gap-2 mb-4">
                  <Users size={16} className="text-content-muted" /> Agents de transport
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {transfert.agentsTransport.map((agent, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-surface-base/50 p-3 rounded-lg border border-edge-subtle">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-elevated flex items-center justify-center">
                          <User size={16} className="text-content-muted" />
                        </div>
                        <span className="text-sm font-medium text-content-primary">{agent.nom}</span>
                      </div>
                      <span className="text-xs text-content-muted flex items-center gap-1.5">
                        <Phone size={12} /> {agent.contact}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Motif */}
            {transfert.motif && (
              <section className="bg-surface/50 border border-edge-subtle rounded-xl p-5">
                <h4 className="text-sm font-semibold text-content-secondary flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-content-muted" /> Motif du transfert
                </h4>
                <p className="text-sm text-content-muted">{transfert.motif}</p>
              </section>
            )}

            {/* Reception Info (if received) */}
            {(transfert.statut === 'Reçu' || transfert.statut === 'Reçu avec écart') && (
              <section className="bg-status-success/10 border border-status-success/30 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-status-success flex items-center gap-2">
                  <Package size={16} /> Réception
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-surface-base/50 rounded-lg p-4">
                    <p className="text-xs text-content-muted mb-1">Montant reçu</p>
                    <p className="text-xl font-bold text-content-primary">
                      {formatMoney(parseFloat(transfert.montantRecu || transfert.montant))}
                    </p>
                  </div>
                  <div className="bg-surface-base/50 rounded-lg p-4">
                    <p className="text-xs text-content-muted mb-1">Conformité</p>
                    <Badge
                      value={transfert.conforme ? 'Conforme' : 'Non conforme'}
                      variant={transfert.conforme ? 'success' : 'danger'}
                    />
                  </div>
                </div>

                {/* Ecart */}
                {transfert.ecartMontant && parseFloat(transfert.ecartMontant) !== 0 && (
                  <div className="bg-status-warning/10 border border-status-warning/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Scale size={16} className="text-status-warning" />
                      <span className="text-sm font-semibold text-status-warning">Écart détecté</span>
                    </div>
                    <p className="text-xl font-bold text-status-warning">
                      {formatMoney(Math.abs(parseFloat(transfert.ecartMontant)))}
                    </p>
                    {transfert.motifEcart && (
                      <p className="text-xs text-content-muted mt-2">Motif: {transfert.motifEcart}</p>
                    )}
                  </div>
                )}

                {transfert.commentaireReception && (
                  <div className="bg-surface-base/50 rounded-lg p-4">
                    <p className="text-xs text-content-muted mb-1">Commentaire</p>
                    <p className="text-sm text-content-muted">{transfert.commentaireReception}</p>
                  </div>
                )}
              </section>
            )}

            {/* Rejection/Cancellation reason */}
            {transfert.motifRejet && (
              <section className="bg-status-danger/10 border border-status-danger/30 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-status-danger flex items-center gap-2 mb-3">
                  <XCircle size={16} /> Motif de rejet
                </h4>
                <p className="text-sm text-status-danger/80">{transfert.motifRejet}</p>
              </section>
            )}

            {transfert.motifAnnulation && (
              <section className="bg-surface/50 border border-edge-subtle rounded-xl p-5">
                <h4 className="text-sm font-semibold text-content-secondary flex items-center gap-2 mb-3">
                  <X size={16} /> Motif d'annulation
                </h4>
                <p className="text-sm text-content-muted">{transfert.motifAnnulation}</p>
              </section>
            )}

            {/* Documents */}
            {documents.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileText size={16} /> Documents ({documents.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 bg-surface/50 border border-edge-subtle rounded-xl hover:border-edge-strong transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-surface-elevated/50">
                          <FileText size={18} className="text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-content-primary">{doc.type}</p>
                          <p className="text-xs text-content-muted">{formatDate(doc.createdAt)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-content-muted hover:text-accent hover:bg-accent/10"
                      >
                        <Download size={18} />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Reconciliation */}
            {reconciliation && (
              <section className="bg-accent/10 border border-accent/30 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-accent flex items-center gap-2 mb-4">
                  <Scale size={16} /> Réconciliation comptable
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-content-muted mb-1">Statut</p>
                    <Badge
                      value={reconciliation.statut}
                      variant={reconciliation.statut === 'Rapproché' ? 'success' : 'warning'}
                    />
                  </div>
                  {reconciliation.dateRapprochement && (
                    <div className="text-right">
                      <p className="text-xs text-content-muted mb-1">Date de rapprochement</p>
                      <p className="text-sm font-medium text-content-primary">{formatDate(reconciliation.dateRapprochement)}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Audit Trail */}
            {auditLogs.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History size={16} /> Historique d'audit ({auditLogs.length})
                </h3>
                <div className="space-y-2">
                  {auditLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 bg-surface/30 border border-edge-subtle rounded-xl text-sm"
                    >
                      <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-content-primary">{formatAuditAction(log.action)}</span>
                          <span className="text-xs text-content-muted">{formatDate(log.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-content-muted mt-1">
                          {log.utilisateur && (
                            <span>
                              {log.utilisateur.prenom} {log.utilisateur.nom}
                            </span>
                          )}
                          {log.statutAvant && log.statutApres && (
                            <span className="flex items-center gap-1">
                              <span className="text-content-muted">{log.statutAvant}</span>
                              <ChevronRight size={12} />
                              <span className="text-accent">{log.statutApres}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length > 5 && (
                    <p className="text-xs text-content-muted text-center py-2">
                      + {auditLogs.length - 5} autres entrées
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              STICKY FOOTER - Action Buttons
          ═══════════════════════════════════════════════════════════════════ */}
          {availableActions.length > 0 && (
            <div className="flex-shrink-0 p-4 sm:p-5 border-t border-edge-subtle bg-surface-base/95 backdrop-blur">
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                <Button variant="ghost" onClick={onClose} className="sm:min-w-[100px]">
                  Fermer
                </Button>
                {availableActions.map((action) => (
                  <Button
                    key={action.key}
                    onClick={() => onAction(action.action)}
                    variant={action.variant}
                    className={`sm:min-w-[140px] ${
                      action.variant === 'primary'
                        ? 'bg-gradient-to-r from-accent to-accent-secondary hover:from-accent/90 hover:to-accent-secondary/90 shadow-lg shadow-accent/20'
                        : action.variant === 'success'
                        ? 'bg-gradient-to-r from-status-success to-accent hover:from-status-success/90 hover:to-accent/90 shadow-lg shadow-status-success/20'
                        : action.variant === 'warning'
                        ? 'bg-gradient-to-r from-status-warning to-status-warning/80 hover:from-status-warning/90 hover:to-status-warning/70 shadow-lg shadow-status-warning/20'
                        : 'bg-status-danger hover:bg-status-danger'
                    }`}
                  >
                    {action.icon}
                    <span className="ml-2">{action.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Close button only footer if no actions */}
          {availableActions.length === 0 && (
            <div className="flex-shrink-0 p-4 sm:p-5 border-t border-edge-subtle bg-surface-base/95 backdrop-blur">
              <div className="flex justify-end">
                <Button variant="ghost" onClick={onClose} className="min-w-[100px]">
                  Fermer
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* Hidden Receipt for Printing */}
      <div className="hidden">
        <InternalOperationReceipt ref={receiptRef} data={buildReceiptData()} />
      </div>
    </>
  );
}
