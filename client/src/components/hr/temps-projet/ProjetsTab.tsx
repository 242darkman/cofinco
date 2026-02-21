import React, { useState, useMemo } from 'react';
import {
  Plus, FolderKanban, Users, Calendar, Clock, Banknote,
  Eye, UserPlus, UserMinus, Pencil, CheckCircle2, PauseCircle, XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, StatCard, SearchInput, EmptyState } from '../../ui';
import { useProjects, useProject, type Project, type ProjectDetail } from '../../../hooks/hr/useProjectTime';
import { useAgence } from '../../../contexts/AgenceContext';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  ON_HOLD: 'En pause',
  COMPLETED: 'Termine',
  CANCELLED: 'Annule',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'info',
  CANCELLED: 'danger',
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Chef de projet',
  MEMBER: 'Membre',
  OBSERVER: 'Observateur',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'ON_HOLD', label: 'En pause' },
  { value: 'COMPLETED', label: 'Termine' },
  { value: 'CANCELLED', label: 'Annule' },
];

const ROLE_OPTIONS = [
  { value: 'MANAGER', label: 'Chef de projet' },
  { value: 'MEMBER', label: 'Membre' },
  { value: 'OBSERVER', label: 'Observateur' },
];

const formatCurrency = (amount: number | null) => {
  if (amount == null) return '-';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('fr-FR');
};

const emptyForm = {
  code: '',
  nom: '',
  description: '',
  client: '',
  responsableId: '',
  agenceId: '',
  budgetHeures: '',
  budgetMontant: '',
  dateDebut: '',
  dateFin: '',
  statut: 'DRAFT',
};

export default function ProjetsTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  // Member add sub-form state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmployeId, setNewMemberEmployeId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('MEMBER');

  const { agences } = useAgence();
  const { projects, isLoading, createProject, isCreating, updateProject } = useProjects(
    statusFilter ? { statut: statusFilter } : undefined,
  );
  const { project: projectDetail, isLoading: loadingDetail, addMember, removeMember } = useProject(selectedProjectId);

  const { data: employeesList = [] } = useQuery<any[]>({
    queryKey: ['/api/hr/employes'],
    queryFn: () => fetch('/api/hr/employes', { credentials: 'include' }).then(r => r.json()),
  });

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.nom.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.client && p.client.toLowerCase().includes(q)),
    );
  }, [projects, search]);

  // Stats
  const stats = useMemo(() => {
    const all = projects;
    return {
      total: all.length,
      active: all.filter((p) => p.statut === 'ACTIVE').length,
      completed: all.filter((p) => p.statut === 'COMPLETED').length,
      totalBudget: all.reduce((sum, p) => sum + (p.budgetMontant || 0), 0),
    };
  }, [projects]);

  // Form handlers
  const resetForm = () => {
    setFormData(emptyForm);
    setEditingProject(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (project: Project) => {
    setFormData({
      code: project.code,
      nom: project.nom,
      description: project.description || '',
      client: project.client || '',
      responsableId: project.responsableId || '',
      agenceId: project.agenceId || '',
      budgetHeures: project.budgetHeures != null ? String(project.budgetHeures) : '',
      budgetMontant: project.budgetMontant != null ? String(project.budgetMontant) : '',
      dateDebut: project.dateDebut || '',
      dateFin: project.dateFin || '',
      statut: project.statut,
    });
    setEditingProject(project);
    setShowCreateModal(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      budgetHeures: formData.budgetHeures ? Number(formData.budgetHeures) : null,
      budgetMontant: formData.budgetMontant ? Number(formData.budgetMontant) : null,
      responsableId: formData.responsableId || null,
      agenceId: formData.agenceId || null,
      description: formData.description || null,
      client: formData.client || null,
      dateDebut: formData.dateDebut || null,
      dateFin: formData.dateFin || null,
    };

    if (editingProject) {
      await updateProject({ id: editingProject.id, ...payload });
    } else {
      await createProject(payload);
    }
    setShowCreateModal(false);
    resetForm();
  };

  // Member handlers
  const handleAddMember = async () => {
    if (!newMemberEmployeId) return;
    await addMember({ employeId: newMemberEmployeId, role: newMemberRole });
    setNewMemberEmployeId('');
    setNewMemberRole('MEMBER');
    setShowAddMember(false);
  };

  const handleRemoveMember = async (employeId: string) => {
    await removeMember(employeId);
  };

  // Employee options for selects
  const employeeOptions = useMemo(
    () =>
      employeesList.map((e: any) => ({
        value: e.id,
        label: `${e.prenom} ${e.nom} (${e.matricule})`,
      })),
    [employeesList],
  );

  const agenceOptions = useMemo(
    () => agences.map((ua) => ({ value: ua.agenceId, label: ua.agence.nom })),
    [agences],
  );

  // Members not yet added to the project
  const availableMembers = useMemo(() => {
    if (!projectDetail) return employeeOptions;
    const existing = new Set(projectDetail.membres.map((m) => m.employeId));
    return employeeOptions.filter((o: any) => !existing.has(o.value));
  }, [employeeOptions, projectDetail]);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total projets" value={stats.total} icon={FolderKanban} color="primary" />
        <StatCard title="Actifs" value={stats.active} icon={CheckCircle2} color="success" />
        <StatCard title="Termines" value={stats.completed} icon={Clock} color="neutral" />
        <StatCard title="Budget total" value={formatCurrency(stats.totalBudget)} icon={Banknote} color="warning" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Rechercher un projet..."
          containerClassName="flex-1"
        />
        <SelectField
          name="statusFilter"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder=""
          containerClassName="sm:w-48"
        />
        <Button variant="primary" icon={Plus} onClick={openCreateModal}>
          Nouveau projet
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredProjects.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="Aucun projet"
          description={search ? 'Aucun projet ne correspond a votre recherche.' : 'Commencez par creer votre premier projet.'}
          action={!search ? { label: 'Creer un projet', onClick: openCreateModal } : undefined}
        />
      )}

      {/* Project Cards Grid */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              variant="default"
              padding="md"
              className="cursor-pointer hover:bg-surface-elevated/40 transition-all duration-200"
              onClick={() => setSelectedProjectId(project.id)}
            >
              {/* Header: code + status */}
              <div className="flex items-center justify-between mb-3">
                <Badge value={project.code} variant="primary" size="sm" rawValue />
                <Badge
                  value={STATUS_LABELS[project.statut] || project.statut}
                  variant={STATUS_COLORS[project.statut] as any || 'neutral'}
                  size="sm"
                  rawValue
                />
              </div>

              {/* Nom */}
              <h3 className="text-content-primary font-semibold text-base mb-1 truncate">{project.nom}</h3>

              {/* Client */}
              {project.client && (
                <p className="text-content-muted text-xs mb-2 truncate">{project.client}</p>
              )}

              {/* Dates */}
              <div className="flex items-center gap-1.5 text-content-secondary text-xs mb-2">
                <Calendar size={13} className="text-content-muted shrink-0" />
                <span>{formatDate(project.dateDebut)} - {formatDate(project.dateFin)}</span>
              </div>

              {/* Budget */}
              <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-edge">
                <span className="text-content-muted">
                  {project.budgetHeures != null ? `${project.budgetHeures}h` : '-'}
                </span>
                <span className="text-content-primary font-medium">
                  {formatCurrency(project.budgetMontant)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm(); }}
        title={editingProject ? 'Modifier le projet' : 'Nouveau projet'}
        size="lg"
        footer={
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => { setShowCreateModal(false); resetForm(); }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleSubmit} isLoading={isCreating}>
              {editingProject ? 'Enregistrer' : 'Creer'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Code"
              name="code"
              value={formData.code}
              onChange={handleFormChange}
              required
              placeholder="PRJ-001"
            />
            <FormField
              label="Nom"
              name="nom"
              value={formData.nom}
              onChange={handleFormChange}
              required
              placeholder="Nom du projet"
            />
          </div>

          <TextareaField
            label="Description"
            name="description"
            value={formData.description}
            onChange={handleFormChange}
            rows={3}
            placeholder="Description du projet..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Client"
              name="client"
              value={formData.client}
              onChange={handleFormChange}
              placeholder="Nom du client"
            />
            <SelectField
              label="Responsable"
              name="responsableId"
              value={formData.responsableId}
              onChange={handleFormChange}
              options={employeeOptions}
              placeholder="Selectionner..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Agence"
              name="agenceId"
              value={formData.agenceId}
              onChange={handleFormChange}
              options={agenceOptions}
              placeholder="Selectionner..."
            />
            <SelectField
              label="Statut"
              name="statut"
              value={formData.statut}
              onChange={handleFormChange}
              options={STATUS_OPTIONS.filter((o) => o.value !== '')}
              placeholder=""
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Budget heures"
              name="budgetHeures"
              type="number"
              value={formData.budgetHeures}
              onChange={handleFormChange}
              placeholder="0"
            />
            <FormField
              label="Budget montant (FCFA)"
              name="budgetMontant"
              type="number"
              value={formData.budgetMontant}
              onChange={handleFormChange}
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Date de debut"
              name="dateDebut"
              type="date"
              value={formData.dateDebut}
              onChange={handleFormChange}
            />
            <FormField
              label="Date de fin"
              name="dateFin"
              type="date"
              value={formData.dateFin}
              onChange={handleFormChange}
            />
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedProjectId}
        onClose={() => { setSelectedProjectId(null); setShowAddMember(false); }}
        title={projectDetail?.nom || 'Detail du projet'}
        subtitle={projectDetail?.code}
        size="lg"
        footer={
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => { setSelectedProjectId(null); setShowAddMember(false); }}>
              Fermer
            </Button>
            {projectDetail && (
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => {
                  setSelectedProjectId(null);
                  openEditModal(projectDetail);
                }}
              >
                Modifier
              </Button>
            )}
          </div>
        }
      >
        {loadingDetail && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        )}

        {projectDetail && !loadingDetail && (
          <div className="space-y-6">
            {/* Project info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-content-muted text-xs mb-1">Statut</p>
                <Badge
                  value={STATUS_LABELS[projectDetail.statut] || projectDetail.statut}
                  variant={STATUS_COLORS[projectDetail.statut] as any || 'neutral'}
                  rawValue
                />
              </div>
              <div>
                <p className="text-content-muted text-xs mb-1">Client</p>
                <p className="text-content-primary text-sm font-medium">{projectDetail.client || '-'}</p>
              </div>
              <div>
                <p className="text-content-muted text-xs mb-1">Periode</p>
                <p className="text-content-primary text-sm">
                  {formatDate(projectDetail.dateDebut)} - {formatDate(projectDetail.dateFin)}
                </p>
              </div>
              <div>
                <p className="text-content-muted text-xs mb-1">Budget</p>
                <p className="text-content-primary text-sm">
                  {projectDetail.budgetHeures != null ? `${projectDetail.budgetHeures}h` : '-'}
                  {' | '}
                  {formatCurrency(projectDetail.budgetMontant)}
                </p>
              </div>
            </div>

            {projectDetail.description && (
              <div>
                <p className="text-content-muted text-xs mb-1">Description</p>
                <p className="text-content-secondary text-sm">{projectDetail.description}</p>
              </div>
            )}

            {/* Members section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-content-primary font-semibold text-sm flex items-center gap-2">
                  <Users size={16} className="text-accent" />
                  Membres ({projectDetail.membres.length})
                </h4>
                <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setShowAddMember(!showAddMember)}>
                  Ajouter membre
                </Button>
              </div>

              {/* Add member sub-form */}
              {showAddMember && (
                <div className="bg-surface-subtle rounded-lg p-4 mb-4 border border-edge space-y-3">
                  <SelectField
                    label="Employe"
                    name="newMemberEmployeId"
                    value={newMemberEmployeId}
                    onChange={(e) => setNewMemberEmployeId(e.target.value)}
                    options={availableMembers}
                    placeholder="Selectionner un employe..."
                  />
                  <SelectField
                    label="Role"
                    name="newMemberRole"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    options={ROLE_OPTIONS}
                    placeholder=""
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowAddMember(false)}>
                      Annuler
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAddMember}
                      disabled={!newMemberEmployeId}
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>
              )}

              {/* Members list */}
              {projectDetail.membres.length === 0 ? (
                <p className="text-content-muted text-sm text-center py-4">Aucun membre dans ce projet.</p>
              ) : (
                <div className="space-y-2">
                  {projectDetail.membres.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-surface rounded-lg border border-edge"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                          <Users size={14} className="text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-content-primary text-sm font-medium truncate">
                            {member.employeNom || member.employeId}
                          </p>
                          {member.employeMatricule && (
                            <p className="text-content-muted text-xs">{member.employeMatricule}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          value={ROLE_LABELS[member.role] || member.role}
                          variant={member.role === 'MANAGER' ? 'primary' : 'neutral'}
                          size="xs"
                          rawValue
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={UserMinus}
                          className="text-status-danger hover:bg-status-danger-bg"
                          onClick={() => handleRemoveMember(member.employeId)}
                        >
                          Retirer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
