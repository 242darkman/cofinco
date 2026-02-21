import React, { useState, useMemo } from 'react';
import {
  Building2, Briefcase, ChevronDown, ChevronRight, Plus,
  Pencil, Trash2, Users, BarChart3,
} from 'lucide-react';
import { Card, Button, Badge, TabGroup, LoadingSpinner } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { usePositionManager } from '../../hooks/hr/usePositionManager';
import type { Department, JobPosition, VacancyStat } from '../../hooks/hr/usePositionManager';
import DepartmentFormModal from './DepartmentFormModal';
import PositionFormModal from './PositionFormModal';

// ============================================================================
// HELPERS
// ============================================================================

function formatMoney(amount: number | null): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

const QUALIFICATION_LABELS: Record<string, string> = {
  OUVRIER: 'Ouvrier',
  EMPLOYE: 'Employe',
  AGENT_MAITRISE: 'Agent de maitrise',
  CADRE: 'Cadre',
  CADRE_SUPERIEUR: 'Cadre superieur',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PositionManager() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'edit');

  const {
    departments,
    positions,
    vacancyStats,
    loadingDepartments,
    loadingPositions,
    loadingVacancyStats,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    isCreatingDepartment,
    isUpdatingDepartment,
    createPosition,
    updatePosition,
    deletePosition,
    isCreatingPosition,
    isUpdatingPosition,
  } = usePositionManager();

  // Tab state
  const [activeTab, setActiveTab] = useState('postes');

  // Expanded departments
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // Modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);

  // Group positions by department
  const positionsByDept = useMemo(() => {
    const map = new Map<string, JobPosition[]>();
    for (const pos of positions) {
      const existing = map.get(pos.departmentId) || [];
      existing.push(pos);
      map.set(pos.departmentId, existing);
    }
    return map;
  }, [positions]);

  // Group vacancy stats by department
  const statsByDept = useMemo(() => {
    const map = new Map<string, VacancyStat[]>();
    for (const stat of vacancyStats) {
      const existing = map.get(stat.departmentId) || [];
      existing.push(stat);
      map.set(stat.departmentId, existing);
    }
    return map;
  }, [vacancyStats]);

  // Overall totals
  const overallTotals = useMemo(() => {
    return vacancyStats.reduce(
      (acc, s) => ({
        effectifPrevu: acc.effectifPrevu + s.effectifPrevu,
        effectifActuel: acc.effectifActuel + s.effectifActuel,
        vacants: acc.vacants + s.vacants,
      }),
      { effectifPrevu: 0, effectifActuel: 0, vacants: 0 }
    );
  }, [vacancyStats]);

  const toggleDept = (deptId: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  // ---- Handlers ----
  const handleSaveDepartment = async (data: { code: string; name: string; description?: string }) => {
    if (editingDept) {
      await updateDepartment({ id: editingDept.id, data });
    } else {
      await createDepartment(data);
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    if (!confirm(`Supprimer le departement "${dept.name}" ? Cette action est irreversible.`)) return;
    await deleteDepartment(dept.id);
  };

  const handleSavePosition = async (data: Record<string, unknown>) => {
    if (editingPosition) {
      await updatePosition({ id: editingPosition.id, data });
    } else {
      await createPosition(data);
    }
  };

  const handleDeletePosition = async (pos: JobPosition) => {
    if (!confirm(`Supprimer le poste "${pos.name}" ? Cette action est irreversible.`)) return;
    await deletePosition(pos.id);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setShowDeptModal(true);
  };

  const openNewDept = () => {
    setEditingDept(null);
    setShowDeptModal(true);
  };

  const openEditPosition = (pos: JobPosition) => {
    setEditingPosition(pos);
    setShowPositionModal(true);
  };

  const openNewPosition = () => {
    setEditingPosition(null);
    setShowPositionModal(true);
  };

  // ---- Loading ----
  const isLoading = loadingDepartments || loadingPositions || loadingVacancyStats;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  // ---- Tabs ----
  const tabs = [
    { key: 'postes', label: 'Departements & Postes', icon: Building2 },
    { key: 'effectifs', label: 'Tableau des Effectifs', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header actions */}
      {canManage && (
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm" icon={Plus} onClick={openNewDept}>
            Nouveau departement
          </Button>
          <Button variant="secondary" size="sm" icon={Plus} onClick={openNewPosition}>
            Nouveau poste
          </Button>
        </div>
      )}

      {/* Tabs */}
      <TabGroup
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        variant="pills"
        size="sm"
      />

      {/* Tab content */}
      {activeTab === 'postes' && (
        <PostesTab
          departments={departments}
          positionsByDept={positionsByDept}
          expandedDepts={expandedDepts}
          toggleDept={toggleDept}
          canManage={canManage}
          onEditDept={openEditDept}
          onDeleteDept={handleDeleteDepartment}
          onEditPosition={openEditPosition}
          onDeletePosition={handleDeletePosition}
        />
      )}

      {activeTab === 'effectifs' && (
        <EffectifsTab
          departments={departments}
          statsByDept={statsByDept}
          overallTotals={overallTotals}
        />
      )}

      {/* Modals */}
      <DepartmentFormModal
        isOpen={showDeptModal}
        onClose={() => setShowDeptModal(false)}
        department={editingDept}
        onSave={handleSaveDepartment}
        isSaving={isCreatingDepartment || isUpdatingDepartment}
      />

      <PositionFormModal
        isOpen={showPositionModal}
        onClose={() => setShowPositionModal(false)}
        position={editingPosition}
        departments={departments}
        onSave={handleSavePosition}
        isSaving={isCreatingPosition || isUpdatingPosition}
      />
    </div>
  );
}

// ============================================================================
// SUB-TAB 1: Departements & Postes
// ============================================================================

interface PostesTabProps {
  departments: Department[];
  positionsByDept: Map<string, JobPosition[]>;
  expandedDepts: Set<string>;
  toggleDept: (deptId: string) => void;
  canManage: boolean;
  onEditDept: (dept: Department) => void;
  onDeleteDept: (dept: Department) => void;
  onEditPosition: (pos: JobPosition) => void;
  onDeletePosition: (pos: JobPosition) => void;
}

function PostesTab({
  departments,
  positionsByDept,
  expandedDepts,
  toggleDept,
  canManage,
  onEditDept,
  onDeleteDept,
  onEditPosition,
  onDeletePosition,
}: PostesTabProps) {
  if (departments.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <Building2 size={40} className="mx-auto text-content-muted mb-3" />
        <p className="text-content-secondary font-medium">Aucun departement configure</p>
        <p className="text-content-muted text-sm mt-1">
          Commencez par creer un departement pour organiser vos postes.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {departments.map(dept => {
        const deptPositions = positionsByDept.get(dept.id) || [];
        const isExpanded = expandedDepts.has(dept.id);

        return (
          <Card key={dept.id} padding="none">
            {/* Department header (clickable) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleDept(dept.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDept(dept.id); } }}
              className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-surface-subtle/50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Building2 size={18} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-content-primary truncate">{dept.name}</span>
                    <Badge value={dept.code} variant="neutral" size="xs" rawValue />
                  </div>
                  {dept.description && (
                    <p className="text-xs text-content-muted mt-0.5 truncate">{dept.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-content-muted">
                  {deptPositions.length} poste{deptPositions.length !== 1 ? 's' : ''}
                </span>
                {canManage && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onEditDept(dept)}
                      className="p-1.5 rounded-md hover:bg-surface-elevated text-content-muted hover:text-accent transition-colors"
                      title="Modifier"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDept(dept)}
                      className="p-1.5 rounded-md hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronDown size={18} className="text-content-muted" />
                ) : (
                  <ChevronRight size={18} className="text-content-muted" />
                )}
              </div>
            </div>

            {/* Expanded positions list */}
            {isExpanded && (
              <div className="border-t border-edge">
                {deptPositions.length === 0 ? (
                  <div className="p-4 text-center text-content-muted text-sm">
                    Aucun poste dans ce departement
                  </div>
                ) : (
                  <div className="divide-y divide-edge-subtle">
                    {deptPositions.map(pos => (
                      <div
                        key={pos.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 hover:bg-surface-subtle/30 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <Briefcase size={16} className="text-content-muted mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-content-primary text-sm">{pos.name}</span>
                              <Badge value={pos.code} variant="neutral" size="xs" rawValue />
                              {pos.qualification && (
                                <Badge
                                  value={QUALIFICATION_LABELS[pos.qualification] || pos.qualification}
                                  variant="primary"
                                  size="xs"
                                  rawValue
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-content-muted">
                              {(pos.salaireMin != null || pos.salaireMax != null) && (
                                <span>
                                  {formatMoney(pos.salaireMin)} - {formatMoney(pos.salaireMax)}
                                </span>
                              )}
                              {pos.effectifPrevu != null && (
                                <span className="flex items-center gap-1">
                                  <Users size={12} />
                                  Effectif prevu: {pos.effectifPrevu}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => onEditPosition(pos)}
                              className="p-1.5 rounded-md hover:bg-surface-elevated text-content-muted hover:text-accent transition-colors"
                              title="Modifier"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeletePosition(pos)}
                              className="p-1.5 rounded-md hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================================
// SUB-TAB 2: Tableau des Effectifs
// ============================================================================

interface EffectifsTabProps {
  departments: Department[];
  statsByDept: Map<string, VacancyStat[]>;
  overallTotals: { effectifPrevu: number; effectifActuel: number; vacants: number };
}

function EffectifsTab({ departments, statsByDept, overallTotals }: EffectifsTabProps) {
  if (departments.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <BarChart3 size={40} className="mx-auto text-content-muted mb-3" />
        <p className="text-content-secondary font-medium">Aucune donnee disponible</p>
        <p className="text-content-muted text-sm mt-1">
          Configurez des departements et postes pour voir le tableau des effectifs.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-subtle/50">
              <th className="text-left p-3 sm:p-4 font-semibold text-content-secondary">Departement</th>
              <th className="text-left p-3 sm:p-4 font-semibold text-content-secondary">Poste</th>
              <th className="text-left p-3 sm:p-4 font-semibold text-content-secondary hidden md:table-cell">Qualification</th>
              <th className="text-center p-3 sm:p-4 font-semibold text-content-secondary">Prevu</th>
              <th className="text-center p-3 sm:p-4 font-semibold text-content-secondary">Actuel</th>
              <th className="text-center p-3 sm:p-4 font-semibold text-content-secondary">Vacants</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(dept => {
              const deptStats = statsByDept.get(dept.id) || [];
              if (deptStats.length === 0) return null;

              const deptTotals = deptStats.reduce(
                (acc, s) => ({
                  effectifPrevu: acc.effectifPrevu + s.effectifPrevu,
                  effectifActuel: acc.effectifActuel + s.effectifActuel,
                  vacants: acc.vacants + s.vacants,
                }),
                { effectifPrevu: 0, effectifActuel: 0, vacants: 0 }
              );

              return (
                <React.Fragment key={dept.id}>
                  {deptStats.map((stat, idx) => (
                    <tr key={stat.id} className="border-b border-edge-subtle hover:bg-surface-subtle/30 transition-colors">
                      {idx === 0 ? (
                        <td
                          className="p-3 sm:p-4 font-semibold text-content-primary align-top"
                          rowSpan={deptStats.length}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-accent shrink-0" />
                            <span>{dept.name}</span>
                          </div>
                        </td>
                      ) : null}
                      <td className="p-3 sm:p-4 text-content-secondary">
                        <div>
                          <span className="font-medium">{stat.name}</span>
                          <span className="text-content-muted text-xs ml-2">({stat.code})</span>
                        </div>
                      </td>
                      <td className="p-3 sm:p-4 hidden md:table-cell">
                        {stat.qualification ? (
                          <Badge
                            value={QUALIFICATION_LABELS[stat.qualification] || stat.qualification}
                            variant="neutral"
                            size="xs"
                            rawValue
                          />
                        ) : (
                          <span className="text-content-muted">-</span>
                        )}
                      </td>
                      <td className="p-3 sm:p-4 text-center text-content-secondary font-medium">
                        {stat.effectifPrevu}
                      </td>
                      <td className="p-3 sm:p-4 text-center text-content-secondary font-medium">
                        {stat.effectifActuel}
                      </td>
                      <td className="p-3 sm:p-4 text-center font-bold">
                        <span className={stat.vacants > 0 ? 'text-status-warning' : 'text-status-success'}>
                          {stat.vacants}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Department summary row */}
                  <tr className="bg-surface-subtle/40 border-b border-edge">
                    <td className="p-2 sm:p-3" />
                    <td className="p-2 sm:p-3 text-right font-semibold text-content-muted text-xs uppercase tracking-wide" colSpan={2}>
                      Sous-total {dept.code}
                    </td>
                    <td className="p-2 sm:p-3 text-center font-bold text-content-primary">
                      {deptTotals.effectifPrevu}
                    </td>
                    <td className="p-2 sm:p-3 text-center font-bold text-content-primary">
                      {deptTotals.effectifActuel}
                    </td>
                    <td className="p-2 sm:p-3 text-center font-bold">
                      <span className={deptTotals.vacants > 0 ? 'text-status-warning' : 'text-status-success'}>
                        {deptTotals.vacants}
                      </span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Overall totals */}
            <tr className="bg-accent/5 border-t-2 border-accent/30">
              <td className="p-3 sm:p-4 font-bold text-content-primary" colSpan={3}>
                Total general
              </td>
              <td className="p-3 sm:p-4 text-center font-bold text-content-primary text-base">
                {overallTotals.effectifPrevu}
              </td>
              <td className="p-3 sm:p-4 text-center font-bold text-content-primary text-base">
                {overallTotals.effectifActuel}
              </td>
              <td className="p-3 sm:p-4 text-center font-bold text-base">
                <span className={overallTotals.vacants > 0 ? 'text-status-warning' : 'text-status-success'}>
                  {overallTotals.vacants}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
