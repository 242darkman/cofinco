import React, { useState, useEffect } from 'react';
import { Plus, AlertTriangle, Calendar, ArrowRight, MessageSquare, Check, Gavel, Pencil, Trash2, X, User, Paperclip, Upload, FileText, ExternalLink, Settings, Zap, TrendingUp } from 'lucide-react';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, ResponsiveTable, TabGroup, Spinner } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { hrApi } from '../../lib/api-client';
import type { Sanction, SanctionWorkflowStatus } from '../../hooks/hr/useSanctions';

const WORKFLOW_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  NOTIFIED: 'Notifié',
  ACKNOWLEDGED: 'Accusé réception',
  APPEALED: 'En appel',
  FINAL: 'Finalisé',
};

const WORKFLOW_COLORS: Record<string, string> = {
  DRAFT: 'neutral',
  NOTIFIED: 'info',
  ACKNOWLEDGED: 'warning',
  APPEALED: 'primary',
  FINAL: 'success',
};

interface EscalationRule {
  id: string;
  agenceId?: string;
  sanctionCountThreshold: number;
  periodMonths: number;
  sourceGravite: string;
  escalateToGravite: string;
  notificationRequired: boolean;
  autoApply: boolean;
  actif: boolean;
  createdAt: string;
}

interface SanctionsManagerProps {
  sanctions: Sanction[];
  agenceId?: string;
  onCreate: (data: {
    employeId: string;
    employeNom: string;
    type: string;
    motif: string;
    date: string;
    gravite: string;
  }) => Promise<boolean>;
  onUpdateStatus?: (id: number, newStatus: SanctionWorkflowStatus, appealReason?: string) => Promise<boolean>;
  onUpdate?: (sanctionId: number, data: Partial<Sanction>) => Promise<boolean>;
  onDelete?: (sanctionId: number) => Promise<boolean>;
  onUploadDocument?: (sanctionId: number, file: File) => Promise<any>;
  onFetchDocuments?: (sanctionId: number) => Promise<Array<{ key: string; fileName: string; url: string }>>;
}

export default function SanctionsManager({
  sanctions,
  agenceId,
  onCreate,
  onUpdateStatus,
  onUpdate,
  onDelete,
  onUploadDocument,
  onFetchDocuments,
}: SanctionsManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateSanctions = hasPermission('rh', 'edit') || hasPermission('sanctions', 'create');
  const canManageRules = hasPermission('rh', 'manage') || hasPermission('settings', 'edit');

  const [activeTab, setActiveTab] = useState<'list' | 'rules'>('list');
  const [showForm, setShowForm] = useState(false);

  // Escalation rules state
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<EscalationRule | null>(null);
  const [ruleFormData, setRuleFormData] = useState({
    sanctionCountThreshold: 3,
    periodMonths: 12,
    sourceGravite: 'Faible',
    escalateToGravite: 'Moyenne',
    notificationRequired: true,
    autoApply: false,
  });

  // Fetch escalation rules
  useEffect(() => {
    if (activeTab === 'rules' && canManageRules) {
      fetchEscalationRules();
    }
  }, [activeTab, agenceId]);

  const fetchEscalationRules = async () => {
    setLoadingRules(true);
    try {
      const rules = await hrApi.getEscalationRules(agenceId);
      setEscalationRules(rules || []);
    } catch (error) {
      console.error('Error fetching escalation rules:', error);
    } finally {
      setLoadingRules(false);
    }
  };

  const handleSaveRule = async () => {
    try {
      if (editingRule) {
        await hrApi.updateEscalationRule(editingRule.id, ruleFormData);
        toast.success('Règle mise à jour');
      } else {
        await hrApi.createEscalationRule({ ...ruleFormData, agenceId });
        toast.success('Règle créée');
      }
      setShowRuleForm(false);
      setEditingRule(null);
      setRuleFormData({
        sanctionCountThreshold: 3,
        periodMonths: 12,
        sourceGravite: 'Faible',
        escalateToGravite: 'Moyenne',
        notificationRequired: true,
        autoApply: false,
      });
      fetchEscalationRules();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Supprimer cette règle d\'escalade ?')) return;
    try {
      await hrApi.deleteEscalationRule(id);
      toast.success('Règle supprimée');
      fetchEscalationRules();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleEditRule = (rule: EscalationRule) => {
    setEditingRule(rule);
    setRuleFormData({
      sanctionCountThreshold: rule.sanctionCountThreshold,
      periodMonths: rule.periodMonths,
      sourceGravite: rule.sourceGravite,
      escalateToGravite: rule.escalateToGravite,
      notificationRequired: rule.notificationRequired,
      autoApply: rule.autoApply,
    });
    setShowRuleForm(true);
  };

  const handleToggleRuleActive = async (rule: EscalationRule) => {
    try {
      await hrApi.updateEscalationRule(rule.id, { actif: !rule.actif });
      toast.success(rule.actif ? 'Règle désactivée' : 'Règle activée');
      fetchEscalationRules();
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    }
  };
  const [showAppealModal, setShowAppealModal] = useState<number | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [formData, setFormData] = useState({
    employeId: '',
    employeNom: '',
    type: 'Avertissement',
    motif: '',
    date: '',
    gravite: 'Moyenne'
  });

  // Detail / Edit / Delete state
  const [selectedSanction, setSelectedSanction] = useState<Sanction | null>(null);
  const [editingSanction, setEditingSanction] = useState<Sanction | null>(null);
  const [editData, setEditData] = useState<{
    type: Sanction['type'] | '';
    motif: string;
    date: string;
    gravite: Sanction['gravite'] | '';
  }>({ type: '', motif: '', date: '', gravite: '' });
  const [confirmDelete, setConfirmDelete] = useState<Sanction | null>(null);

  // Document state
  const [sanctionDocs, setSanctionDocs] = useState<Array<{ key: string; fileName: string; url: string }>>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDocUpload = async (sanctionId: number, file: File) => {
    if (!onUploadDocument) return;
    setUploadingDoc(true);
    try {
      const result = await onUploadDocument(sanctionId, file);
      if (result) {
        toast.success('Document ajouté');
        // Refresh documents list
        if (onFetchDocuments) {
          const docs = await onFetchDocuments(sanctionId);
          setSanctionDocs(docs);
        }
      } else {
        toast.error("Erreur lors de l'upload");
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  const loadDocuments = async (sanctionId: number) => {
    if (!onFetchDocuments) return;
    setLoadingDocs(true);
    try {
      const docs = await onFetchDocuments(sanctionId);
      setSanctionDocs(docs);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleEditOpen = (sanction: Sanction) => {
    setEditData({
      type: sanction.type,
      motif: sanction.motif,
      date: sanction.date,
      gravite: sanction.gravite,
    });
    setEditingSanction(sanction);
    setSelectedSanction(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSanction || !onUpdate) return;
    // Filter out empty values and cast to proper type
    const updateData: Partial<Sanction> = {};
    if (editData.type) updateData.type = editData.type;
    if (editData.motif) updateData.motif = editData.motif;
    if (editData.date) updateData.date = editData.date;
    if (editData.gravite) updateData.gravite = editData.gravite;
    const success = await onUpdate(editingSanction.id, updateData);
    if (success) {
      toast.success('Sanction mise à jour');
      setEditingSanction(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete || !onDelete) return;
    const success = await onDelete(confirmDelete.id);
    if (success) {
      toast.success('Sanction supprimée');
      setConfirmDelete(null);
      setSelectedSanction(null);
    }
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sanctions.length / ITEMS_PER_PAGE);
  const paginatedSanctions = sanctions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({
        employeId: '',
        employeNom: '',
        type: 'Avertissement',
        motif: '',
        date: '',
        gravite: 'Moyenne'
      });
      setShowForm(false);
    }
  };

  const getGraviteColor = (gravite: string) => {
    switch (gravite) {
      case 'Faible': return 'info';
      case 'Moyenne': return 'warning';
      case 'Grave': return 'danger';
      default: return 'neutral';
    }
  };

  const handleWorkflowAction = async (sanctionId: number, newStatus: SanctionWorkflowStatus) => {
    if (!onUpdateStatus) return;
    if (newStatus === 'APPEALED') {
      setShowAppealModal(sanctionId);
      return;
    }
    const success = await onUpdateStatus(sanctionId, newStatus);
    if (success) {
      toast.success(`Statut mis à jour: ${WORKFLOW_LABELS[newStatus]}`);
    } else {
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  const handleAppealSubmit = async () => {
    if (!showAppealModal || !appealReason.trim() || !onUpdateStatus) return;
    const success = await onUpdateStatus(showAppealModal, 'APPEALED', appealReason);
    if (success) {
      toast.success('Appel enregistré');
      setShowAppealModal(null);
      setAppealReason('');
    } else {
      toast.error("Erreur lors de l'enregistrement de l'appel");
    }
  };

  const getNextActions = (status?: string): Array<{ label: string; status: SanctionWorkflowStatus; icon: React.ElementType }> => {
    switch (status) {
      case 'DRAFT': return [{ label: 'Notifier', status: 'NOTIFIED', icon: ArrowRight }];
      case 'NOTIFIED': return [{ label: 'Accusé réception', status: 'ACKNOWLEDGED', icon: Check }];
      case 'ACKNOWLEDGED': return [
        { label: 'Appel', status: 'APPEALED', icon: MessageSquare },
        { label: 'Finaliser', status: 'FINAL', icon: Gavel },
      ];
      case 'APPEALED': return [{ label: 'Finaliser', status: 'FINAL', icon: Gavel }];
      default: return [];
    }
  };

  const columns = [
    {
      label: 'Employé',
      key: 'employeNom',
      primary: true,
      format: (val: string, item: Sanction) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-warning-bg rounded-lg">
            <AlertTriangle size={18} className="text-status-warning" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-content-primary text-sm truncate">{val}</div>
            <div className="text-[10px] text-content-muted">{item.type}</div>
          </div>
        </div>
      )
    },
    {
      label: 'Date',
      key: 'date',
      hideOnMobile: true,
      format: (val: string) => (
        <div className="flex items-center gap-1 text-xs text-content-secondary">
          <Calendar size={12} className="text-content-muted" />
          <span>{new Date(val).toLocaleDateString('fr-FR')}</span>
        </div>
      )
    },
    {
      label: 'Gravité',
      key: 'gravite',
      format: (val: string) => (
        <Badge variant={getGraviteColor(val)} value={val} size="sm" />
      )
    },
    {
      label: 'Workflow',
      key: 'statutWorkflow',
      format: (val: string) => {
        const status = val || 'DRAFT';
        return <Badge variant={WORKFLOW_COLORS[status] as any || 'neutral'} value={WORKFLOW_LABELS[status] || status} size="sm" />;
      }
    },
    {
      label: 'Actions',
      key: 'actions',
      format: (_: any, item: Sanction) => {
        if (!onUpdateStatus) return null;
        const actions = getNextActions(item.statutWorkflow || 'DRAFT');
        if (actions.length === 0) return <span className="text-[10px] text-content-muted">Terminé</span>;

        return (
          <div className="flex gap-1">
            {actions.map(({ label, status, icon: Icon }) => (
              <button
                key={status}
                onClick={(e) => { e.stopPropagation(); handleWorkflowAction(item.id, status); }}
                className="px-2 py-1 text-[10px] font-medium rounded bg-surface hover:bg-surface-elevated text-content-secondary hover:text-content-primary transition flex items-center gap-1"
                title={label}
              >
                <Icon size={12} />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>
        );
      }
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Header with Tabs */}
      <div className="shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-1">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <AlertTriangle size={16} className="text-status-warning" />
            Sanctions Disciplinaires
          </h3>
          {canManageRules && (
            <div className="flex gap-1 bg-surface/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('list')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  activeTab === 'list' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Liste
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${
                  activeTab === 'rules' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-primary'
                }`}
              >
                <Settings size={12} />
                Règles
              </button>
            </div>
          )}
        </div>
        {activeTab === 'list' && canCreateSanctions && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="h-8 text-xs px-3">
            <Plus size={14} />
            <span className="hidden sm:inline">Nouvelle Sanction</span>
          </Button>
        )}
        {activeTab === 'rules' && canManageRules && (
          <Button variant="primary" size="sm" onClick={() => { setEditingRule(null); setShowRuleForm(true); }} className="h-8 text-xs px-3">
            <Plus size={14} />
            <span className="hidden sm:inline">Nouvelle Règle</span>
          </Button>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'list' ? (
        <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col">
          <div className="flex-1 overflow-hidden">
            <ResponsiveTable
              data={paginatedSanctions}
              columns={columns}
              mobileBreakpoint="md"
              emptyMessage="Aucune sanction enregistrée."
              maxHeight="100%"
              onRowClick={(sanction: Sanction) => {
                setSelectedSanction(sanction);
                setSanctionDocs([]);
                if (sanction.documentsJoints && onFetchDocuments) {
                  loadDocuments(sanction.id);
                }
              }}
              pagination={{
                page: currentPage,
                totalPages,
                onPageChange: setCurrentPage
              }}
              density="compact"
              className="border-0 rounded-none h-full"
              headerClassName="bg-surface-base sticky top-0"
            />
          </div>
        </div>
      ) : (
        /* Escalation Rules Panel */
        <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-edge">
            <p className="text-xs text-content-muted">
              Configurez les règles d'escalade automatique des sanctions. Lorsqu'un employé accumule un certain nombre de sanctions,
              la gravité peut être automatiquement augmentée.
            </p>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {loadingRules ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" tone="current" className="text-status-warning" />
              </div>
            ) : escalationRules.length === 0 ? (
              <div className="text-center py-8">
                <Zap size={32} className="mx-auto text-content-muted mb-2" />
                <p className="text-sm text-content-muted">Aucune règle d'escalade configurée</p>
                <p className="text-xs text-content-muted mt-1">Créez une règle pour automatiser les escalades de gravité</p>
              </div>
            ) : (
              escalationRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3 rounded-lg border ${
                    rule.actif ? 'bg-surface/50 border-edge' : 'bg-surface-base/50 border-edge opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={14} className="text-status-warning" />
                        <span className="text-sm font-medium text-content-primary">
                          {rule.sanctionCountThreshold} sanctions en {rule.periodMonths} mois
                        </span>
                        {!rule.actif && <Badge variant="neutral" value="Inactif" size="xs" />}
                        {rule.autoApply && <Badge variant="warning" value="Auto" size="xs" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-content-muted">
                        <Badge variant={getGraviteColor(rule.sourceGravite)} value={rule.sourceGravite} size="xs" />
                        <ArrowRight size={12} />
                        <Badge variant={getGraviteColor(rule.escalateToGravite)} value={rule.escalateToGravite} size="xs" />
                      </div>
                      {rule.notificationRequired && (
                        <p className="text-[10px] text-content-muted mt-1">Notification requise</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleRuleActive(rule)}
                        className={`p-1.5 rounded transition ${
                          rule.actif ? 'text-status-success hover:bg-status-success-bg' : 'text-content-muted hover:bg-surface-elevated'
                        }`}
                        title={rule.actif ? 'Désactiver' : 'Activer'}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => handleEditRule(rule)}
                        className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Sanction Disciplinaire"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Employé (ID)"
            name="employeId"
            type="text"
            value={formData.employeId}
            onChange={(e) => setFormData({ ...formData, employeId: e.target.value })}
            required
          />

          <FormField
            label="Nom Employé"
            name="employeNom"
            type="text"
            value={formData.employeNom}
            onChange={(e) => setFormData({ ...formData, employeNom: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Type de Sanction"
              name="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={[
                { value: 'Avertissement', label: 'Avertissement' },
                { value: 'Blâme', label: 'Blâme' },
                { value: 'Mise à pied', label: 'Mise à pied' },
                { value: 'Autre', label: 'Autre' }
              ]}
              required
            />

            <SelectField
              label="Gravité"
              name="gravite"
              value={formData.gravite}
              onChange={(e) => setFormData({ ...formData, gravite: e.target.value })}
              options={[
                { value: 'Faible', label: 'Faible' },
                { value: 'Moyenne', label: 'Moyenne' },
                { value: 'Grave', label: 'Grave' }
              ]}
              required
            />
          </div>

          <FormField
            label="Date"
            name="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <TextareaField
            label="Motif"
            name="motif"
            value={formData.motif}
            onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
            rows={4}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="danger">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Appeal Modal */}
      <Modal
        isOpen={showAppealModal !== null}
        onClose={() => { setShowAppealModal(null); setAppealReason(''); }}
        title="Enregistrer un appel"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-muted">
            Veuillez indiquer le motif de l'appel de la sanction.
          </p>
          <textarea
            value={appealReason}
            onChange={(e) => setAppealReason(e.target.value)}
            placeholder="Motif de l'appel..."
            className="w-full p-3 bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-status-info focus:outline-none resize-none"
            rows={3}
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowAppealModal(null); setAppealReason(''); }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleAppealSubmit}
              variant="primary"
              disabled={!appealReason.trim()}
            >
              Enregistrer l'appel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      {selectedSanction && (
        <div
          className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setSelectedSanction(null)}
        >
          <div
            className="bg-surface-base rounded-t-2xl sm:rounded-xl border-t sm:border border-edge w-full sm:max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col border-b border-edge">
              <div className="flex justify-center pt-2 sm:hidden">
                <div className="w-10 h-1 bg-surface-subtle rounded-full"></div>
              </div>
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 bg-status-warning-bg rounded-xl flex-shrink-0">
                    <AlertTriangle size={24} className="text-status-warning" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-content-primary truncate">{selectedSanction.employeNom}</h3>
                    <p className="text-xs text-content-muted">{selectedSanction.type}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedSanction(null)} className="p-2 hover:bg-surface rounded-lg transition text-content-muted hover:text-content-primary flex-shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface/50 rounded-lg p-3 text-center">
                  <Calendar size={16} className="mx-auto text-accent mb-1" />
                  <p className="text-[10px] text-content-muted">Date</p>
                  <p className="text-xs font-semibold text-content-primary">{new Date(selectedSanction.date).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="bg-surface/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-content-muted mb-1">Gravité</p>
                  <Badge variant={getGraviteColor(selectedSanction.gravite)} value={selectedSanction.gravite} size="sm" />
                </div>
              </div>

              <div className="bg-surface/30 rounded-lg p-3">
                <p className="text-[10px] text-content-muted mb-1">Motif</p>
                <p className="text-sm text-content-secondary">{selectedSanction.motif}</p>
              </div>

              <div className="bg-surface/30 rounded-lg p-3">
                <p className="text-[10px] text-content-muted mb-1">Workflow</p>
                <Badge variant={WORKFLOW_COLORS[selectedSanction.statutWorkflow || 'DRAFT'] as any || 'neutral'} value={WORKFLOW_LABELS[selectedSanction.statutWorkflow || 'DRAFT'] || 'Brouillon'} size="sm" />
              </div>

              {selectedSanction.appealReason && (
                <div className="bg-surface/30 rounded-lg p-3">
                  <p className="text-[10px] text-content-muted mb-1">Motif d'appel</p>
                  <p className="text-sm text-content-secondary">{selectedSanction.appealReason}</p>
                </div>
              )}

              {/* Documents section */}
              <div className="bg-surface/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm text-content-muted">
                    <Paperclip size={14} />
                    <span>Documents joints</span>
                  </div>
                  {onUploadDocument && canCreateSanctions && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && selectedSanction) {
                            handleDocUpload(selectedSanction.id, file);
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingDoc}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-status-info bg-status-info-bg hover:bg-status-info-bg rounded-md transition disabled:opacity-50"
                      >
                        <Upload size={10} />
                        {uploadingDoc ? 'Upload...' : 'Ajouter'}
                      </button>
                    </>
                  )}
                </div>

                {loadingDocs ? (
                  <div className="flex items-center justify-center py-3">
                    <Spinner size="xs" />
                  </div>
                ) : sanctionDocs.length > 0 ? (
                  <div className="space-y-1.5">
                    {sanctionDocs.map((doc, i) => (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-surface/50 rounded-lg hover:bg-surface-elevated/50 transition group"
                      >
                        <FileText size={14} className="text-content-muted flex-shrink-0" />
                        <span className="text-xs text-content-secondary truncate flex-1">
                          {doc.fileName.replace(/^\d+-/, '')}
                        </span>
                        <ExternalLink size={12} className="text-content-muted group-hover:text-status-info flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-content-muted text-center py-2">Aucun document</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-edge bg-surface-base flex justify-between items-center gap-2">
              <div className="flex gap-2">
                {canCreateSanctions && onUpdate && (selectedSanction.statutWorkflow || 'DRAFT') === 'DRAFT' && (
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => handleEditOpen(selectedSanction)} className="text-status-info hover:bg-status-info-bg">
                    Modifier
                  </Button>
                )}
                {canCreateSanctions && onDelete && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { setConfirmDelete(selectedSanction); setSelectedSanction(null); }} className="text-status-danger hover:bg-status-danger-bg">
                    Supprimer
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={() => setSelectedSanction(null)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={!!editingSanction} onClose={() => setEditingSanction(null)} title="Modifier la Sanction" size="md">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="Type" name="type" value={editData.type} onChange={(e) => setEditData({ ...editData, type: e.target.value as typeof editData.type })} options={[{ value: 'Avertissement', label: 'Avertissement' }, { value: 'Blâme', label: 'Blâme' }, { value: 'Mise à pied', label: 'Mise à pied' }, { value: 'Autre', label: 'Autre' }]} required />
            <SelectField label="Gravité" name="gravite" value={editData.gravite} onChange={(e) => setEditData({ ...editData, gravite: e.target.value as typeof editData.gravite })} options={[{ value: 'Faible', label: 'Faible' }, { value: 'Moyenne', label: 'Moyenne' }, { value: 'Grave', label: 'Grave' }]} required />
          </div>
          <FormField label="Date" name="date" type="date" value={editData.date} onChange={(e) => setEditData({ ...editData, date: e.target.value })} required />
          <TextareaField label="Motif" name="motif" value={editData.motif} onChange={(e) => setEditData({ ...editData, motif: e.target.value })} rows={4} required />
          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button type="button" variant="secondary" onClick={() => setEditingSanction(null)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-surface-base border border-edge rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-edge">
              <h3 className="text-sm font-bold text-status-danger">Supprimer la sanction</h3>
            </div>
            <div className="p-4 text-sm text-content-secondary">
              Voulez-vous vraiment supprimer la sanction de <span className="font-bold text-content-primary">"{confirmDelete.employeNom}"</span> ({confirmDelete.type}) ?
            </div>
            <div className="p-4 border-t border-edge flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation Rule Modal */}
      <Modal
        isOpen={showRuleForm}
        onClose={() => { setShowRuleForm(false); setEditingRule(null); }}
        title={editingRule ? "Modifier la règle d'escalade" : "Nouvelle règle d'escalade"}
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-surface/30 rounded-lg p-3 text-xs text-content-muted">
            <Zap size={14} className="inline mr-1 text-status-warning" />
            Cette règle définit quand une sanction doit être automatiquement escaladée à un niveau de gravité supérieur.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Nombre de sanctions"
              name="sanctionCountThreshold"
              inputMode="numeric"
              pattern="[0-9]*"
              value={ruleFormData.sanctionCountThreshold}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setRuleFormData({ ...ruleFormData, sanctionCountThreshold: v ? parseInt(v) : 1 }); }}
              required
            />
            <FormField
              label="Période (mois)"
              name="periodMonths"
              inputMode="numeric"
              pattern="[0-9]*"
              value={ruleFormData.periodMonths}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setRuleFormData({ ...ruleFormData, periodMonths: v ? parseInt(v) : 12 }); }}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Gravité source"
              name="sourceGravite"
              value={ruleFormData.sourceGravite}
              onChange={(e) => setRuleFormData({ ...ruleFormData, sourceGravite: e.target.value })}
              options={[
                { value: 'Faible', label: 'Faible' },
                { value: 'Moyenne', label: 'Moyenne' },
              ]}
              required
            />
            <SelectField
              label="Escalader vers"
              name="escalateToGravite"
              value={ruleFormData.escalateToGravite}
              onChange={(e) => setRuleFormData({ ...ruleFormData, escalateToGravite: e.target.value })}
              options={[
                { value: 'Moyenne', label: 'Moyenne' },
                { value: 'Grave', label: 'Grave' },
              ]}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ruleFormData.notificationRequired}
                onChange={(e) => setRuleFormData({ ...ruleFormData, notificationRequired: e.target.checked })}
                className="w-4 h-4 rounded border-edge-strong bg-surface text-status-warning focus:ring-status-warning"
              />
              <span className="text-sm text-content-secondary">Notification requise lors de l'escalade</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ruleFormData.autoApply}
                onChange={(e) => setRuleFormData({ ...ruleFormData, autoApply: e.target.checked })}
                className="w-4 h-4 rounded border-edge-strong bg-surface text-status-warning focus:ring-status-warning"
              />
              <div>
                <span className="text-sm text-content-secondary">Application automatique</span>
                <p className="text-[10px] text-content-muted">L'escalade sera appliquée automatiquement sans approbation</p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => { setShowRuleForm(false); setEditingRule(null); }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSaveRule}>
              {editingRule ? 'Mettre à jour' : 'Créer la règle'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
