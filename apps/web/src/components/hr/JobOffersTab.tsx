import React, { useState, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Plus, Briefcase, Eye, Globe, Lock, Users, BarChart3, Calendar, Target, RefreshCw, X } from 'lucide-react';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, ResponsiveTable } from '../ui';
import { useJobOffers, useJobOfferCandidatures, type JobOffer } from '../../hooks/hr/useJobOffers';
import { usePermissions } from '../auth/ProtectedFeature';

interface Position {
  id: string;
  nom: string;
  code: string;
  departmentId: string;
}

interface Department {
  id: string;
  nom: string;
}

interface JobOffersTabProps {
  positions: Position[];
  departments: Department[];
}

const VISIBILITY_LABELS: Record<string, string> = {
  INTERNAL: 'Interne',
  EXTERNAL: 'Externe',
  BOTH: 'Interne & Externe',
};

const STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success' | 'danger'; label: string }> = {
  DRAFT: { variant: 'warning', label: 'Brouillon' },
  PUBLISHED: { variant: 'success', label: 'Publiée' },
  CLOSED: { variant: 'danger', label: 'Fermée' },
  ARCHIVED: { variant: 'info', label: 'Archivée' },
};

export default function JobOffersTab({ positions, departments }: JobOffersTabProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage');

  const { offers, isLoading, createOffer, isCreating, updateOffer, publishOffer, closeOffer, scoreAll, isScoringAll } = useJobOffers();

  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<JobOffer | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const { candidatures: offerCandidatures, isLoading: loadingCandidatures } = useJobOfferCandidatures(selectedOfferId);

  // Form state
  const [formData, setFormData] = useState({
    titre: '',
    jobPositionId: '',
    description: '',
    typeContrat: 'CDI',
    lieu: '',
    salairePropose: '',
    visibilite: 'BOTH',
    dateLimite: '',
    qualificationMinimum: '',
    experienceMinAnnees: 0,
    formationRequise: '',
    competencesInput: '',
    postesOuverts: 1,
    poidsCompetences: 40,
    poidsQualification: 30,
    poidsExperience: 30,
  });

  // Stats
  const stats = useMemo(() => ({
    total: offers.length,
    published: offers.filter(o => o.statut === 'PUBLISHED').length,
    draft: offers.filter(o => o.statut === 'DRAFT').length,
    closed: offers.filter(o => o.statut === 'CLOSED').length,
    totalCandidatures: offers.reduce((s, o) => s + (o.candidatureCount || 0), 0),
  }), [offers]);

  const resetForm = () => {
    setFormData({
      titre: '', jobPositionId: '', description: '', typeContrat: 'CDI',
      lieu: '', salairePropose: '', visibilite: 'BOTH', dateLimite: '',
      qualificationMinimum: '', experienceMinAnnees: 0, formationRequise: '',
      competencesInput: '', postesOuverts: 1, poidsCompetences: 40,
      poidsQualification: 30, poidsExperience: 30,
    });
    setEditingOffer(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (offer: JobOffer) => {
    setEditingOffer(offer);
    setFormData({
      titre: offer.titre,
      jobPositionId: offer.jobPositionId,
      description: offer.description || '',
      typeContrat: offer.typeContrat || 'CDI',
      lieu: offer.lieu || '',
      salairePropose: offer.salairePropose || '',
      visibilite: offer.visibilite,
      dateLimite: offer.dateLimite || '',
      qualificationMinimum: offer.qualificationMinimum || '',
      experienceMinAnnees: offer.experienceMinAnnees || 0,
      formationRequise: offer.formationRequise || '',
      competencesInput: (offer.competencesRequises || []).join(', '),
      postesOuverts: offer.postesOuverts || 1,
      poidsCompetences: offer.poidsCompetences || 40,
      poidsQualification: offer.poidsQualification || 30,
      poidsExperience: offer.poidsExperience || 30,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const competencesRequises = formData.competencesInput
      .split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      titre: formData.titre,
      jobPositionId: formData.jobPositionId,
      description: formData.description || null,
      typeContrat: formData.typeContrat,
      lieu: formData.lieu || null,
      salairePropose: formData.salairePropose || null,
      visibilite: formData.visibilite,
      dateLimite: formData.dateLimite || null,
      qualificationMinimum: formData.qualificationMinimum || null,
      experienceMinAnnees: formData.experienceMinAnnees,
      formationRequise: formData.formationRequise || null,
      competencesRequises: competencesRequises.length > 0 ? competencesRequises : null,
      postesOuverts: formData.postesOuverts,
      poidsCompetences: formData.poidsCompetences,
      poidsQualification: formData.poidsQualification,
      poidsExperience: formData.poidsExperience,
    };

    if (editingOffer) {
      await updateOffer({ id: editingOffer.id, ...payload });
    } else {
      await createOffer(payload);
    }
    setShowForm(false);
    resetForm();
  };

  const getScoreColor = (score: number | null) => {
    if (score === null || score === undefined) return 'text-content-muted';
    if (score >= 70) return 'text-status-success';
    if (score >= 40) return 'text-status-warning';
    return 'text-status-danger';
  };

  const getScoreBg = (score: number | null) => {
    if (score === null || score === undefined) return 'bg-surface-subtle';
    if (score >= 70) return 'bg-status-success-bg';
    if (score >= 40) return 'bg-status-warning-bg';
    return 'bg-status-danger-bg';
  };

  if (isLoading) {
    return (
      <SkeletonList items={5} />
    );
  }

  // Detail view for a selected offer
  if (selectedOfferId) {
    const offer = offers.find(o => o.id === selectedOfferId);
    if (!offer) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedOfferId(null)}>
            ← Retour
          </Button>
          <h3 className="text-lg font-bold text-content-primary">{offer.titre}</h3>
          <Badge variant={STATUS_CONFIG[offer.statut]?.variant || 'info'}>
            {STATUS_CONFIG[offer.statut]?.label || offer.statut}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-accent">{offer.candidatureCount || 0}</div>
            <div className="text-xs text-content-muted">Candidatures</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-content-primary">{offer.postesOuverts}</div>
            <div className="text-xs text-content-muted">Poste(s) ouvert(s)</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-content-primary">{VISIBILITY_LABELS[offer.visibilite]}</div>
            <div className="text-xs text-content-muted">Visibilité</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-content-primary">{offer.dateLimite || '—'}</div>
            <div className="text-xs text-content-muted">Date limite</div>
          </Card>
        </div>

        {offer.competencesRequises && offer.competencesRequises.length > 0 && (
          <Card className="p-3">
            <div className="text-xs font-medium text-content-muted mb-2">Compétences requises</div>
            <div className="flex flex-wrap gap-1.5">
              {offer.competencesRequises.map((c, i) => (
                <span key={i} className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full">{c}</span>
              ))}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-content-primary">Candidatures</h4>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => scoreAll(selectedOfferId)} disabled={isScoringAll}>
              {isScoringAll ? <Spinner size="xs" tone="current" /> : <RefreshCw size={14} />}
              <span className="ml-1">Recalculer scores</span>
            </Button>
          )}
        </div>

        {loadingCandidatures ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : offerCandidatures.length === 0 ? (
          <Card className="p-6 text-center text-content-muted text-sm">Aucune candidature pour cette offre</Card>
        ) : (
          <div className="space-y-2">
            {offerCandidatures.map((c: any) => (
              <Card key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-content-primary">{c.nom} {c.prenom}</div>
                  <div className="text-xs text-content-muted">{c.email} {c.source === 'INTERNAL_PORTAL' ? '(Interne)' : ''}</div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getScoreBg(c.scoreGlobal)} ${getScoreColor(c.scoreGlobal)}`}>
                  {c.scoreGlobal !== null && c.scoreGlobal !== undefined ? `${c.scoreGlobal}/100` : '—'}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-content-primary">{stats.total}</div>
          <div className="text-xs text-content-muted">Total</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-status-success">{stats.published}</div>
          <div className="text-xs text-content-muted">Publiées</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-status-warning">{stats.draft}</div>
          <div className="text-xs text-content-muted">Brouillon</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-status-danger">{stats.closed}</div>
          <div className="text-xs text-content-muted">Fermées</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xl font-bold text-accent">{stats.totalCandidatures}</div>
          <div className="text-xs text-content-muted">Candidatures</div>
        </Card>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1" /> Nouvelle offre
          </Button>
        </div>
      )}

      {/* Offers table */}
      {offers.length === 0 ? (
        <Card className="p-8 text-center text-content-muted text-sm">Aucune offre d'emploi</Card>
      ) : (
        <div className="space-y-2">
          {offers.map(offer => {
            const statusCfg = STATUS_CONFIG[offer.statut] || { variant: 'info' as const, label: offer.statut };
            return (
              <Card key={offer.id} className="p-3 hover:bg-surface-subtle transition-colors cursor-pointer" onClick={() => setSelectedOfferId(offer.id)}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                    <Briefcase size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-content-primary truncate">{offer.titre}</span>
                      <Badge variant={statusCfg.variant} size="sm">{statusCfg.label}</Badge>
                    </div>
                    <div className="text-xs text-content-muted mt-0.5">
                      {offer.departmentName} · {offer.typeContrat || '—'} · {VISIBILITY_LABELS[offer.visibilite]}
                      {offer.dateLimite && ` · Limite: ${offer.dateLimite}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <div className="text-sm font-bold text-accent">{offer.candidatureCount || 0}</div>
                      <div className="text-[10px] text-content-muted">candidats</div>
                    </div>
                    {canManage && offer.statut === 'DRAFT' && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); publishOffer(offer.id); }}>
                        Publier
                      </Button>
                    )}
                    {canManage && offer.statut === 'PUBLISHED' && (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); closeOffer(offer.id); }}>
                        Fermer
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(offer); }}>
                        <Eye size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={editingOffer ? 'Modifier l\'offre' : 'Nouvelle offre d\'emploi'} size="lg">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Titre de l'offre" name="titre" required
              value={formData.titre} onChange={e => setFormData(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Analyste financier senior" />
            <SelectField label="Poste" name="jobPositionId" required value={formData.jobPositionId}
              onChange={e => setFormData(p => ({ ...p, jobPositionId: e.target.value }))}
              options={[{ value: '', label: 'Sélectionner un poste' }, ...positions.map(p => ({ value: p.id, label: `${p.nom} (${p.code})` }))]}
              placeholder="" />
          </div>

          <TextareaField label="Description" name="description" value={formData.description}
            onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={3} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectField label="Type de contrat" name="typeContrat" value={formData.typeContrat}
              onChange={e => setFormData(p => ({ ...p, typeContrat: e.target.value }))}
              options={[{ value: 'CDI', label: 'CDI' }, { value: 'CDD', label: 'CDD' }, { value: 'Stage', label: 'Stage' }, { value: 'Intérim', label: 'Intérim' }]}
              placeholder="" />
            <FormField label="Lieu" name="lieu"
              value={formData.lieu} onChange={e => setFormData(p => ({ ...p, lieu: e.target.value }))} />
            <FormField label="Salaire proposé" name="salairePropose"
              value={formData.salairePropose} onChange={e => setFormData(p => ({ ...p, salairePropose: e.target.value }))} placeholder="Ex: 300,000 - 500,000 FCFA" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectField label="Visibilité" name="visibilite" value={formData.visibilite}
              onChange={e => setFormData(p => ({ ...p, visibilite: e.target.value }))}
              options={[{ value: 'BOTH', label: 'Interne & Externe' }, { value: 'INTERNAL', label: 'Interne uniquement' }, { value: 'EXTERNAL', label: 'Externe uniquement' }]}
              placeholder="" />
            <FormField label="Date limite" name="dateLimite" type="date"
              value={formData.dateLimite} onChange={e => setFormData(p => ({ ...p, dateLimite: e.target.value }))} />
            <FormField label="Postes ouverts" name="postesOuverts" type="number" min={1}
              value={formData.postesOuverts} onChange={e => setFormData(p => ({ ...p, postesOuverts: parseInt(e.target.value) || 1 }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectField label="Qualification minimum" name="qualificationMinimum" value={formData.qualificationMinimum}
              onChange={e => setFormData(p => ({ ...p, qualificationMinimum: e.target.value }))}
              options={[
                { value: '', label: 'Non spécifiée' },
                { value: 'OUVRIER', label: 'Ouvrier' },
                { value: 'EMPLOYE', label: 'Employé' },
                { value: 'AGENT_MAITRISE', label: 'Agent de maîtrise' },
                { value: 'CADRE', label: 'Cadre' },
                { value: 'CADRE_SUPERIEUR', label: 'Cadre supérieur' },
              ]}
              placeholder="" />
            <FormField label="Expérience min. (années)" name="experienceMinAnnees" type="number" min={0}
              value={formData.experienceMinAnnees} onChange={e => setFormData(p => ({ ...p, experienceMinAnnees: parseInt(e.target.value) || 0 }))} />
            <FormField label="Formation requise" name="formationRequise"
              value={formData.formationRequise} onChange={e => setFormData(p => ({ ...p, formationRequise: e.target.value }))} placeholder="Ex: Licence en finance" />
          </div>

          <FormField label="Compétences requises (séparées par des virgules)" name="competencesInput"
            value={formData.competencesInput} onChange={e => setFormData(p => ({ ...p, competencesInput: e.target.value }))}
            placeholder="Ex: Comptabilité, Analyse financière, Excel avancé" />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
            <Button onClick={handleSave} disabled={isCreating || !formData.titre || !formData.jobPositionId}>
              {editingOffer ? 'Enregistrer' : 'Créer l\'offre'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
