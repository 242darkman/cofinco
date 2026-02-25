import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Building2,
  CheckCheck,
  Loader2,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useLanguage } from '@/contexts/LanguageContext';
import { caisseAgentApi, type Agence } from '@/lib/api-client';
import { useToast } from '../../hooks/use-toast';
import { useIsOnline } from '@/contexts/NetworkContext';
import SecureValidationModal from '../agent/SecureValidationModal';
import { StatutOperationTerrain } from '@shared/enum/status-constants';
import type { OperationTerrainWithRelations } from '@shared/schema';
import { formatMoney } from '@/lib/format';
import {
  calculateValidationStats,
  groupOperationsByAgency
} from './validation-helpers';
import { Accordion } from '@/components/ui/accordion';
import ValidationAgencyAccordion from './ValidationAgencyAccordion';
import ValidationSummaryPane from './ValidationSummaryPane';

interface AgentCollecteValidationsProps {
  searchTerm?: string;
  selectedAgenceId?: string;
  activeAgencies: Agence[];
}

export default function AgentCollecteValidations({
  searchTerm = '',
  selectedAgenceId = 'all',
  activeAgencies
}: AgentCollecteValidationsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const isOnline = useIsOnline();

  // Data State
  const [operations, setOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  // Processing State
  const [processing, setProcessing] = useState(false);
  const [processingAgencyId, setProcessingAgencyId] = useState<string | null>(null);

  // Modal State
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([]);
  
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectOperationId, setRejectOperationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Load Data
  const loadData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);

    try {
      const opsResponse = await caisseAgentApi.listOperations({ statut: StatutOperationTerrain.SUBMITTED });
      setOperations(opsResponse.operations || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!isBackgroundRefresh) {
        toast({
          title: t('erreur'),
          description: "Impossible de charger les données.",
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const handleUpdate = () => loadData(true);
    window.addEventListener('operation-update', handleUpdate);
    return () => window.removeEventListener('operation-update', handleUpdate);
  }, []);

  useEffect(() => {
    if (isOnline) loadData(true);
  }, [isOnline]);

  // Derivations
  const filteredOperations = useMemo(() => {
    return operations.filter((op: OperationTerrainWithRelations) => {
      const matchesSearch = 
        op.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.agent?.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.client?.nom?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const isFromActiveAgency = activeAgencies.some((a: Agence) => a.id === op.agenceId);
      const matchesAgency = selectedAgenceId === 'all' || op.agenceId === selectedAgenceId;

      return matchesSearch && isFromActiveAgency && matchesAgency;
    });
  }, [operations, searchTerm, selectedAgenceId, activeAgencies]);

  const stats = useMemo(() => calculateValidationStats(filteredOperations, activeAgencies), [filteredOperations, activeAgencies]);
  const groupedByAgency = useMemo(() => groupOperationsByAgency(filteredOperations, activeAgencies), [filteredOperations, activeAgencies]);

  // Handlers
  const handleApproveOne = (op: OperationTerrainWithRelations) => {
    setPendingApprovalIds([op.id]);
    setSecureModalOpen(true);
  };

  const handleApproveAllForAgency = (agencyId: string, opIds: string[]) => {
    setPendingApprovalIds(opIds);
    setProcessingAgencyId(agencyId);
    setSecureModalOpen(true);
  };

  const handleSecureApprovalConfirm = async (password: string) => {
    setProcessing(true);
    try {
      if (pendingApprovalIds.length === 1) {
        await caisseAgentApi.approveOperation(pendingApprovalIds[0], password);
        toast({ title: t('succes'), description: 'Opération validée' });
        window.dispatchEvent(new CustomEvent('operation-update', { detail: { type: 'OPERATION_TERRAIN_APPROVED' } }));
      } else {
        const result = await caisseAgentApi.bulkApproveOperations(pendingApprovalIds, password);
        const failures = result.results?.filter((r: any) => !r.success).length || 0;
        const approved = pendingApprovalIds.length - failures;
        toast({
          title: failures === 0 ? t('succes') : t('attention'),
          description: failures === 0
            ? `${pendingApprovalIds.length} opérations validées`
            : `${approved} validées, ${failures} échecs.`,
          variant: failures > 0 ? 'destructive' : 'default',
        });
        window.dispatchEvent(new CustomEvent('operation-update', { detail: { type: 'BULK_APPROVE', count: approved } }));
      }
      setSecureModalOpen(false);
      loadData(true);
    } finally {
      setProcessing(false);
      setProcessingAgencyId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectOperationId || rejectReason.length < 5) return;
    setProcessing(true);
    try {
      await caisseAgentApi.rejectOperation(rejectOperationId, rejectReason);
      toast({ title: t('succes'), description: "Opération rejetée." });
      setRejectModalOpen(false);
      loadData(true);
      window.dispatchEvent(new CustomEvent('operation-update', { detail: { type: 'OPERATION_TERRAIN_REJECTED' } }));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm font-medium text-content-muted">Chargement des collectes...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Dense KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 border-status-warning/20 bg-status-warning/5 rounded-2xl relative overflow-hidden group hover:shadow-lg transition-all border-l-4 border-l-status-warning">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Demandes</p>
            <p className="text-xl font-black text-content-primary mt-1">{stats.pendingCount}</p>
          </div>
          <Clock size={40} className="absolute -right-2 -bottom-2 text-status-warning/10 transition-transform group-hover:scale-110" />
        </Card>

        <Card className="p-3 border-status-success/20 bg-status-success/5 rounded-2xl relative overflow-hidden group hover:shadow-lg transition-all border-l-4 border-l-status-success">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Volume Total</p>
            <p className="text-xl font-black text-content-primary mt-1">
              {formatMoney(stats.totalAmount)}
            </p>
          </div>
          <TrendingUp size={40} className="absolute -right-2 -bottom-2 text-status-success/10 transition-transform group-hover:scale-110" />
        </Card>

        <Card className="p-3 border-primary/20 bg-primary/5 rounded-2xl relative overflow-hidden group hover:shadow-lg transition-all hidden lg:block border-l-4 border-l-primary">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Agences Actives</p>
            <p className="text-xl font-black text-content-primary mt-1">{stats.activeAgenciesCount}</p>
          </div>
          <Building2 size={40} className="absolute -right-2 -bottom-2 text-primary/10 transition-transform group-hover:scale-110" />
        </Card>

        <Card className="p-3 border-accent/20 bg-accent/5 rounded-2xl relative overflow-hidden group hover:shadow-lg transition-all hidden lg:block border-l-4 border-l-accent">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Moy. Collecte</p>
            <p className="text-xl font-black text-content-primary mt-1">
              {formatMoney(Math.round(stats.averagePerValidation))}
            </p>
          </div>
          <CheckCircle size={40} className="absolute -right-2 -bottom-2 text-accent/10 transition-transform group-hover:scale-110" />
        </Card>
      </div>

      {/* Main Container - 65/35 Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
        {/* Left Column (65%) - Validation List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <CheckCheck size={18} className="text-primary" />
              Collectes par Agence
            </h3>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest bg-surface-muted px-2 py-0.5 rounded-full">
              {groupedByAgency.length} agences avec demandes
            </span>
          </div>

          {groupedByAgency.length === 0 ? (
            <Card className="py-16 text-center border-dashed border-2 border-edge bg-surface-muted/5 rounded-2xl">
              <div className="w-16 h-16 bg-surface-base rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle size={32} className="text-status-success" />
              </div>
              <h3 className="text-lg font-bold text-content-primary">Tout est validé !</h3>
              <p className="text-sm text-content-muted mt-1 max-w-xs mx-auto">
                Aucune collecte en attente pour les agences actives.
              </p>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-3">
              {groupedByAgency.map((group) => (
                <ValidationAgencyAccordion
                  key={group.agency.id}
                  agency={group.agency}
                  operations={group.operations}
                  totalAmount={group.totalAmount}
                  onApproveOne={handleApproveOne}
                  onRejectOne={(id) => {
                    setRejectOperationId(id);
                    setRejectReason('');
                    setRejectModalOpen(true);
                  }}
                  onApproveAll={handleApproveAllForAgency}
                  isProcessing={processing}
                />
              ))}
            </Accordion>
          )}
        </div>

        {/* Right Column (35%) - Insights & Analytics */}
        <div className="lg:col-span-4 sticky top-[100px] h-fit hidden lg:block">
          <ValidationSummaryPane stats={stats} />
        </div>
      </div>

      {/* Modals */}
      <SecureValidationModal
        isOpen={secureModalOpen}
        onClose={() => {
          setSecureModalOpen(false);
          setProcessingAgencyId(null);
        }}
        onConfirm={handleSecureApprovalConfirm}
        title={pendingApprovalIds.length > 1 ? `Validation Massive` : `Validation Sécurisée`}
        description={pendingApprovalIds.length > 1
          ? `Vous allez valider ${pendingApprovalIds.length} collectes d'un montant total de ${formatMoney(
              filteredOperations.filter(op => pendingApprovalIds.includes(op.id)).reduce((s, op) => s + parseFloat(op.montant), 0)
            )}.`
          : undefined}
      />

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-edge flex items-center justify-between">
              <h3 className="font-bold text-content-primary flex items-center gap-2">
                <AlertCircle size={18} className="text-status-danger" />
                Rejeter la Collecte
              </h3>
              <button 
                onClick={() => setRejectModalOpen(false)} 
                className="p-1 rounded-full hover:bg-surface-muted text-content-muted transition-colors"
                aria-label="Fermer"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-status-danger/5 border border-status-danger/20 rounded-xl flex gap-3">
                <ShieldAlert size={18} className="text-status-danger shrink-0 mt-0.5" />
                <p className="text-xs text-status-danger font-medium leading-relaxed">
                  Le rejet annulera définitivement cette collecte. L'agent devra soumettre une nouvelle demande si nécessaire.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">Motif du rejet</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex: Montant incorrect, client non identifié..."
                  className="w-full h-24 p-3 text-sm bg-surface-muted/50 border border-edge rounded-xl focus:ring-2 focus:ring-status-danger/20 focus:border-status-danger outline-none transition-all resize-none"
                />
                <p className="text-[10px] text-content-muted">Minimum 5 caractères requis.</p>
              </div>
            </div>
            <div className="p-4 border-t border-edge flex justify-end gap-2 bg-surface-muted/20">
              <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>Annuler</Button>
              <Button 
                variant="danger" 
                onClick={handleRejectConfirm} 
                disabled={processing || rejectReason.length < 5}
                isLoading={processing}
              >
                Confirmer le rejet
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
