import React, { useState, useMemo } from 'react';
import {
  Plus, ArrowLeft, Play, Square, Archive, Users, Star,
  CheckCircle2, BarChart3, Eye,
} from 'lucide-react';
import {
  Card, Button, Modal, Badge, StatCard, FormField, SelectField,
  TextareaField, ProgressBar, LoadingSpinner,
} from '../../ui';
import { usePermissions } from '../../auth/ProtectedFeature';
import {
  useEvaluationCampaigns,
  useEvaluationTemplates,
  useEvaluations,
  useCampaignSummary,
  type EvaluationCampaign,
} from '../../../hooks/hr/useEvaluations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  ANNUAL: 'Annuelle',
  SEMI_ANNUAL: 'Semestrielle',
  QUARTERLY: 'Trimestrielle',
  CUSTOM: 'Personnalisee',
};

const TYPE_BADGE_VARIANT: Record<string, 'primary' | 'info' | 'warning' | 'neutral'> = {
  ANNUAL: 'primary',
  SEMI_ANNUAL: 'info',
  QUARTERLY: 'warning',
  CUSTOM: 'neutral',
};

const STATUS_BADGE_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'neutral'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  CLOSED: 'warning',
  ARCHIVED: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Active',
  CLOSED: 'Terminee',
  ARCHIVED: 'Archivee',
};

const EVAL_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Non commence',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Termine',
};

const EVAL_STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
};

const NEXT_STATUS: Record<string, string> = {
  DRAFT: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: 'ARCHIVED',
};

const STATUS_ACTION_LABEL: Record<string, string> = {
  DRAFT: 'Lancer',
  ACTIVE: 'Cloturer',
  CLOSED: 'Archiver',
};

const STATUS_ACTION_ICON: Record<string, React.ElementType> = {
  DRAFT: Play,
  ACTIVE: Square,
  CLOSED: Archive,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtScore(s: string | null | undefined) {
  if (!s) return '-';
  return `${parseFloat(s).toFixed(1)}/5`;
}

const INITIAL_FORM = {
  nom: '',
  description: '',
  type: 'ANNUAL',
  dateDebut: '',
  dateFin: '',
  templateId: '',
  targetType: 'ALL',
  selfEvalDeadline: '',
  managerEvalDeadline: '',
};

// ---------------------------------------------------------------------------
// Sub-component: Campaign Detail
// ---------------------------------------------------------------------------

function CampaignDetail({
  campaign,
  onBack,
  canManage,
  onStatusChange,
}: {
  campaign: EvaluationCampaign;
  onBack: () => void;
  canManage: boolean;
  onStatusChange: (id: string, statut: string) => void;
}) {
  const { data: summary, isLoading: summaryLoading } = useCampaignSummary(campaign.id);
  const { evaluations, loading: evalsLoading } = useEvaluations({ campaignId: campaign.id });

  const nextStatus = NEXT_STATUS[campaign.statut];
  const ActionIcon = STATUS_ACTION_ICON[campaign.statut];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} icon={ArrowLeft}>
          Retour
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-content-primary truncate">{campaign.nom}</h3>
          <p className="text-xs text-content-muted">
            {fmtDate(campaign.dateDebut)} - {fmtDate(campaign.dateFin)}
          </p>
        </div>
        <Badge value={STATUS_LABELS[campaign.statut] || campaign.statut} variant={STATUS_BADGE_VARIANT[campaign.statut] || 'neutral'} rawValue />
        {canManage && nextStatus && ActionIcon && (
          <Button
            variant={campaign.statut === 'ACTIVE' ? 'warning' : 'primary'}
            size="sm"
            icon={ActionIcon}
            onClick={() => onStatusChange(campaign.id, nextStatus)}
          >
            {STATUS_ACTION_LABEL[campaign.statut]}
          </Button>
        )}
      </div>

      {campaign.description && (
        <p className="text-sm text-content-secondary">{campaign.description}</p>
      )}

      {/* Summary stats */}
      {summaryLoading ? (
        <div className="flex justify-center py-6"><LoadingSpinner /></div>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="Total evaluations" value={summary.total} icon={Users} color="primary" />
          <StatCard title="Auto-eval terminees" value={summary.selfCompleted} icon={CheckCircle2} color="success" />
          <StatCard title="Manager terminees" value={summary.managerCompleted} icon={CheckCircle2} color="warning" />
          <StatCard title="Finalisees" value={summary.finalized} icon={Star} color="neutral" subtitle={summary.avgScore ? `Score moy: ${fmtScore(summary.avgScore)}` : undefined} />
        </div>
      ) : null}

      {/* Evaluations list */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-edge">
          <h4 className="text-sm font-semibold text-content-primary">Evaluations ({evaluations.length})</h4>
        </div>

        {evalsLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : evaluations.length === 0 ? (
          <p className="text-center text-content-muted text-sm py-8">Aucune evaluation pour cette campagne.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-content-muted text-xs">
                  <th className="text-left px-4 py-2 font-medium">Employe</th>
                  <th className="text-left px-4 py-2 font-medium">Auto-eval</th>
                  <th className="text-left px-4 py-2 font-medium">Manager</th>
                  <th className="text-left px-4 py-2 font-medium">Score</th>
                  <th className="text-left px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev.id} className="border-b border-edge-subtle hover:bg-surface-subtle/50 transition-colors">
                    <td className="px-4 py-2.5 text-content-primary font-medium">{ev.employeNom}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        value={EVAL_STATUS_LABELS[ev.selfEvalStatus] || ev.selfEvalStatus}
                        variant={EVAL_STATUS_VARIANT[ev.selfEvalStatus] || 'neutral'}
                        size="xs"
                        rawValue
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        value={EVAL_STATUS_LABELS[ev.managerEvalStatus] || ev.managerEvalStatus}
                        variant={EVAL_STATUS_VARIANT[ev.managerEvalStatus] || 'neutral'}
                        size="xs"
                        rawValue
                      />
                    </td>
                    <td className="px-4 py-2.5 text-content-secondary">{fmtScore(ev.finalScore)}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        value={ev.statut === 'FINALIZED' ? 'Finalise' : EVAL_STATUS_LABELS[ev.statut] || ev.statut}
                        variant={ev.statut === 'FINALIZED' ? 'success' : EVAL_STATUS_VARIANT[ev.statut] || 'neutral'}
                        size="xs"
                        rawValue
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CampaignesTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'edit');

  const { campaigns, loading, createCampaign, updateCampaignStatus, isCreating } = useEvaluationCampaigns();
  const { templates, loading: templatesLoading } = useEvaluationTemplates();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedCampaign, setSelectedCampaign] = useState<EvaluationCampaign | null>(null);

  // Stats
  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.statut === 'ACTIVE').length;
    const closed = campaigns.filter((c) => c.statut === 'CLOSED' || c.statut === 'ARCHIVED').length;
    const scores = campaigns.map((c) => c.avgScore).filter(Boolean).map((s) => parseFloat(s!));
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
    return { total: campaigns.length, active, closed, avgScore };
  }, [campaigns]);

  // Handlers
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = async () => {
    if (!form.nom || !form.dateDebut || !form.dateFin) return;
    await createCampaign({
      nom: form.nom,
      description: form.description || null,
      type: form.type,
      dateDebut: form.dateDebut,
      dateFin: form.dateFin,
      templateId: form.templateId || null,
      targetType: form.targetType,
      selfEvalDeadline: form.selfEvalDeadline || null,
      managerEvalDeadline: form.managerEvalDeadline || null,
    });
    setForm(INITIAL_FORM);
    setShowCreate(false);
  };

  const handleStatusChange = async (id: string, statut: string) => {
    await updateCampaignStatus({ id, statut });
    if (selectedCampaign?.id === id) {
      setSelectedCampaign((prev) => prev ? { ...prev, statut } : null);
    }
  };

  // --- Detail view ---
  if (selectedCampaign) {
    return (
      <CampaignDetail
        campaign={selectedCampaign}
        onBack={() => setSelectedCampaign(null)}
        canManage={canManage}
        onStatusChange={handleStatusChange}
      />
    );
  }

  // --- List view ---
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total campagnes" value={stats.total} icon={BarChart3} color="primary" />
        <StatCard title="Actives" value={stats.active} icon={Play} color="success" />
        <StatCard title="Terminees" value={stats.closed} icon={CheckCircle2} color="neutral" />
        <StatCard title="Score moyen" value={stats.avgScore === '-' ? '-' : `${stats.avgScore}/5`} icon={Star} color="warning" />
      </div>

      {/* Action bar */}
      {canManage && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            Nouvelle campagne
          </Button>
        </div>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : campaigns.length === 0 ? (
        <Card>
          <p className="text-center text-content-muted text-sm py-8">Aucune campagne d'evaluation.</p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-content-muted text-xs">
                  <th className="text-left px-4 py-3 font-medium">Nom</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Periode</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Progression</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Score moy</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const pct = c.totalEvaluations > 0 ? Math.round((c.finalizedCount / c.totalEvaluations) * 100) : 0;
                  const nextStatus = NEXT_STATUS[c.statut];
                  const ActionIcon = STATUS_ACTION_ICON[c.statut];

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-edge-subtle hover:bg-surface-subtle/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedCampaign(c)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-content-primary">{c.nom}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          value={TYPE_LABELS[c.type] || c.type}
                          variant={TYPE_BADGE_VARIANT[c.type] || 'neutral'}
                          size="xs"
                          rawValue
                        />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-content-secondary text-xs">
                        {fmtDate(c.dateDebut)} - {fmtDate(c.dateFin)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          value={STATUS_LABELS[c.statut] || c.statut}
                          variant={STATUS_BADGE_VARIANT[c.statut] || 'neutral'}
                          size="xs"
                          rawValue
                        />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={c.finalizedCount} max={c.totalEvaluations || 1} size="sm" color={pct >= 100 ? 'success' : 'primary'} className="flex-1 min-w-[60px]" />
                          <span className="text-xs text-content-muted whitespace-nowrap">
                            {c.finalizedCount}/{c.totalEvaluations}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-content-secondary">
                        {fmtScore(c.avgScore)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="xs" icon={Eye} onClick={() => setSelectedCampaign(c)}>
                            Voir
                          </Button>
                          {canManage && nextStatus && ActionIcon && (
                            <Button
                              variant="ghost"
                              size="xs"
                              icon={ActionIcon}
                              onClick={() => handleStatusChange(c.id, nextStatus)}
                            >
                              {STATUS_ACTION_LABEL[c.statut]}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Campaign Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouvelle campagne d'evaluation"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isCreating}
              disabled={!form.nom || !form.dateDebut || !form.dateFin}
            >
              Creer la campagne
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Nom de la campagne"
            name="nom"
            value={form.nom}
            onChange={handleFormChange}
            required
            placeholder="Ex: Evaluation annuelle 2026"
            containerClassName="sm:col-span-2"
          />

          <TextareaField
            label="Description"
            name="description"
            value={form.description}
            onChange={handleFormChange}
            rows={2}
            containerClassName="sm:col-span-2"
          />

          <SelectField
            label="Type"
            name="type"
            value={form.type}
            onChange={handleFormChange}
            options={[
              { value: 'ANNUAL', label: 'Annuelle' },
              { value: 'SEMI_ANNUAL', label: 'Semestrielle' },
              { value: 'QUARTERLY', label: 'Trimestrielle' },
              { value: 'CUSTOM', label: 'Personnalisee' },
            ]}
            required
          />

          <SelectField
            label="Cible"
            name="targetType"
            value={form.targetType}
            onChange={handleFormChange}
            options={[
              { value: 'ALL', label: 'Tous les employes' },
              { value: 'DEPARTMENT', label: 'Par departement' },
              { value: 'POSITION', label: 'Par poste' },
              { value: 'CUSTOM', label: 'Selection personnalisee' },
            ]}
          />

          <FormField
            label="Date de debut"
            name="dateDebut"
            type="date"
            value={form.dateDebut}
            onChange={handleFormChange}
            required
          />

          <FormField
            label="Date de fin"
            name="dateFin"
            type="date"
            value={form.dateFin}
            onChange={handleFormChange}
            required
          />

          <SelectField
            label="Modele d'evaluation"
            name="templateId"
            value={form.templateId}
            onChange={handleFormChange}
            placeholder={templatesLoading ? 'Chargement...' : 'Selectionner un modele'}
            options={templates.map((t) => ({ value: t.id, label: `${t.nom} (${t.criteriaCount} criteres)` }))}
          />

          <div /> {/* spacer for grid alignment */}

          <FormField
            label="Date limite auto-evaluation"
            name="selfEvalDeadline"
            type="date"
            value={form.selfEvalDeadline}
            onChange={handleFormChange}
          />

          <FormField
            label="Date limite evaluation manager"
            name="managerEvalDeadline"
            type="date"
            value={form.managerEvalDeadline}
            onChange={handleFormChange}
          />
        </div>
      </Modal>
    </div>
  );
}
