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
    devise: transfert.devise || 'XAF',
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
          bg-slate-900 border-l border-slate-700/50
          shadow-2xl shadow-black/50
          flex flex-col
          animate-in slide-in-from-right duration-300
        "
        onClick={(e) => e.stopPropagation()}
      >
          {/* ═══════════════════════════════════════════════════════════════════
              HEADER - Reference & Status
          ═══════════════════════════════════════════════════════════════════ */}
          <div className={`flex-shrink-0 p-4 sm:p-5 border-b border-slate-700/50 ${statutConfig.bg}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${statutConfig.bg} ${statutConfig.border} border`}>
                  {statutConfig.icon}
                  <span className={statutConfig.color} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {transfert.reference}
                    {transfert.verrouille && (
                      <span title="Transfert verrouillé" className="p-0.5 rounded bg-amber-500/20">
                        <Lock size={12} className="text-amber-400" />
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
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-400 transition-all border border-slate-700/50"
                  title="Imprimer le reçu"
                >
                  <Printer size={18} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700/50"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                HERO SECTION - Transfer Flow & Amount
            ───────────────────────────────────────────────────────────────── */}
            <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800/50">
              {/* Transfer Route - Horizontal */}
              <div className="flex items-center justify-center gap-3 sm:gap-6 mb-4">
                {/* Source */}
                <div className="text-center flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center shadow-lg">
                    <Building2 size={22} className="text-slate-300" />
                  </div>
                  <p className="font-semibold text-white text-xs sm:text-sm max-w-[80px] sm:max-w-[120px] truncate">
                    {transfert.coffreSource?.nom || 'Coffre Source'}
                  </p>
                  <p className="text-[10px] text-slate-500">{transfert.coffreSource?.code}</p>
                </div>

                {/* Arrow with Type */}
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="px-2 py-1 bg-slate-800/80 rounded-full text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">
                    {transfert.typeTransfert.replace(/_/g, ' → ')}
                  </div>
                  <div className="relative">
                    <div className="w-10 sm:w-16 h-0.5 bg-gradient-to-r from-cyan-500/50 via-cyan-400 to-cyan-500/50 rounded-full" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="p-1 rounded-full bg-cyan-500/20 border border-cyan-500/40">
                        <ArrowRightLeft size={12} className="text-cyan-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="text-center flex-shrink-0">
                  <div className="w-12 h-12 mx-auto mb-1.5 rounded-lg bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 border border-cyan-600/50 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                    <Vault size={22} className="text-cyan-400" />
                  </div>
                  <p className="font-semibold text-white text-xs sm:text-sm max-w-[80px] sm:max-w-[120px] truncate">
                    {transfert.coffreDestination?.nom || 'Coffre Destination'}
                  </p>
                  <p className="text-[10px] text-slate-500">{transfert.coffreDestination?.code}</p>
                </div>
              </div>

              {/* Amount - Centered */}
              <div className="text-center py-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {formatMoney(parseFloat(transfert.montant))}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 font-medium uppercase tracking-wider">
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
            <section className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                <History size={16} /> Progression
              </h3>
              <div className="relative">
                {/* Progress line */}
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-700" />
                <div
                  className="absolute left-5 top-0 w-0.5 bg-gradient-to-b from-cyan-500 to-emerald-500 transition-all duration-500"
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
                              ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-slate-800 text-slate-600 border border-slate-700'
                          } ${isCurrent ? 'ring-2 ring-cyan-500/50 ring-offset-2 ring-offset-slate-900' : ''}`}
                        >
                          {step.icon}
                        </div>
                        <div className="flex-1 pt-0.5">
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

            {/* ─────────────────────────────────────────────────────────────────
                DETAILS GRID - 3 columns on desktop
            ───────────────────────────────────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Date de transfert */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Calendar size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Date de transfert</p>
                  <p className="text-base text-white font-medium">
                    {new Date(transfert.dateTransfert).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Conditionnement */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Package size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Conditionnement</p>
                  <p className="text-base text-white font-medium">{transfert.typeConditionnement}</p>
                </div>
              </div>

              {/* N° Scellé */}
              {transfert.numeroScelle && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Lock size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">N° Scellé</p>
                    <p className="text-base text-cyan-400 font-mono font-medium">{transfert.numeroScelle}</p>
                  </div>
                </div>
              )}

              {/* Date comptable */}
              {transfert.dateComptable && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    <Clock size={18} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Date comptable</p>
                    <p className="text-base text-white font-medium">{transfert.dateComptable}</p>
                  </div>
                </div>
              )}

              {/* Type */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Tag size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Type</p>
                  <p className="text-base text-white font-medium">{transfert.typeTransfert.replace(/_/g, ' → ')}</p>
                </div>
              </div>
            </section>

            {/* Transport Agents */}
            {transfert.agentsTransport && transfert.agentsTransport.length > 0 && (
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                  <Users size={16} className="text-slate-400" /> Agents de transport
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {transfert.agentsTransport.map((agent, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
                          <User size={16} className="text-slate-400" />
                        </div>
                        <span className="text-sm font-medium text-white">{agent.nom}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Phone size={12} /> {agent.contact}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Motif */}
            {transfert.motif && (
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-slate-400" /> Motif du transfert
                </h4>
                <p className="text-sm text-slate-400">{transfert.motif}</p>
              </section>
            )}

            {/* Reception Info (if received) */}
            {(transfert.statut === 'Reçu' || transfert.statut === 'Reçu avec écart') && (
              <section className="bg-emerald-950/20 border border-emerald-700/30 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                  <Package size={16} /> Réception
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-1">Montant reçu</p>
                    <p className="text-xl font-bold text-white">
                      {formatMoney(parseFloat(transfert.montantRecu || transfert.montant))}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-1">Conformité</p>
                    <Badge
                      value={transfert.conforme ? 'Conforme' : 'Non conforme'}
                      variant={transfert.conforme ? 'success' : 'danger'}
                    />
                  </div>
                </div>

                {/* Ecart */}
                {transfert.ecartMontant && parseFloat(transfert.ecartMontant) !== 0 && (
                  <div className="bg-orange-950/30 border border-orange-700/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Scale size={16} className="text-orange-400" />
                      <span className="text-sm font-semibold text-orange-400">Écart détecté</span>
                    </div>
                    <p className="text-xl font-bold text-orange-300">
                      {formatMoney(Math.abs(parseFloat(transfert.ecartMontant)))}
                    </p>
                    {transfert.motifEcart && (
                      <p className="text-xs text-slate-400 mt-2">Motif: {transfert.motifEcart}</p>
                    )}
                  </div>
                )}

                {transfert.commentaireReception && (
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-1">Commentaire</p>
                    <p className="text-sm text-slate-400">{transfert.commentaireReception}</p>
                  </div>
                )}
              </section>
            )}

            {/* Rejection/Cancellation reason */}
            {transfert.motifRejet && (
              <section className="bg-red-950/20 border border-red-700/30 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-red-300 flex items-center gap-2 mb-3">
                  <XCircle size={16} /> Motif de rejet
                </h4>
                <p className="text-sm text-red-200">{transfert.motifRejet}</p>
              </section>
            )}

            {transfert.motifAnnulation && (
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3">
                  <X size={16} /> Motif d'annulation
                </h4>
                <p className="text-sm text-slate-400">{transfert.motifAnnulation}</p>
              </section>
            )}

            {/* Documents */}
            {documents.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileText size={16} /> Documents ({documents.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-700/50">
                          <FileText size={18} className="text-cyan-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{doc.type}</p>
                          <p className="text-xs text-slate-500">{formatDate(doc.createdAt)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
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
              <section className="bg-indigo-950/20 border border-indigo-700/30 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-indigo-300 flex items-center gap-2 mb-4">
                  <Scale size={16} /> Réconciliation comptable
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Statut</p>
                    <Badge
                      value={reconciliation.statut}
                      variant={reconciliation.statut === 'Rapproché' ? 'success' : 'warning'}
                    />
                  </div>
                  {reconciliation.dateRapprochement && (
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-1">Date de rapprochement</p>
                      <p className="text-sm font-medium text-white">{formatDate(reconciliation.dateRapprochement)}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Audit Trail */}
            {auditLogs.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History size={16} /> Historique d'audit ({auditLogs.length})
                </h3>
                <div className="space-y-2">
                  {auditLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl text-sm"
                    >
                      <div className="w-2 h-2 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
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
                  {auditLogs.length > 5 && (
                    <p className="text-xs text-slate-500 text-center py-2">
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
            <div className="flex-shrink-0 p-4 sm:p-5 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur">
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
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/20'
                        : action.variant === 'success'
                        ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20'
                        : action.variant === 'warning'
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-500/20'
                        : 'bg-red-600 hover:bg-red-500'
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
            <div className="flex-shrink-0 p-4 sm:p-5 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur">
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
