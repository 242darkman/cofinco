import React, { useState, useMemo, useCallback } from 'react';
import {
  useTimesheets,
  useTimesheet,
  useCreateTimesheet,
  useProjects,
  type Timesheet,
  type TimeEntry,
} from '../../../hooks/hr/useProjectTime';
import { useEmployes } from '../../../hooks/hr/useEmployes';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { usePermissions } from '../../auth/ProtectedFeature';
import { isAdminRole } from '@shared/types/roles';
import { Card, Button, Badge, SelectField, EmptyState } from '../../ui';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  CalendarDays,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from '../../../lib/toast';

// ===================== Helpers =====================

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getWeekDates(weekStr: string): string[] {
  const [year, week] = weekStr.split('-W').map(Number);
  const jan4 = new Date(year, 0, 4);
  const startOfWeek = new Date(jan4);
  startOfWeek.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function getCurrentWeek(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfYear =
    Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000
    ) + 1;
  const weekNum = Math.ceil((dayOfYear + jan4.getDay() - 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function shiftWeek(weekStr: string, delta: number): string {
  const dates = getWeekDates(weekStr);
  const ref = new Date(dates[0] + 'T00:00:00');
  ref.setDate(ref.getDate() + delta * 7);
  const jan4 = new Date(ref.getFullYear(), 0, 4);
  const dayOfYear =
    Math.floor(
      (ref.getTime() - new Date(ref.getFullYear(), 0, 1).getTime()) / 86400000
    ) + 1;
  const weekNum = Math.ceil((dayOfYear + jan4.getDay() - 1) / 7);
  return `${ref.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ===================== Status config =====================

const STATUT_CONFIG: Record<
  string,
  { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' }
> = {
  DRAFT: { label: 'Brouillon', variant: 'neutral' },
  SUBMITTED: { label: 'Soumise', variant: 'warning' },
  APPROVED: { label: 'Approuv\u00e9e', variant: 'success' },
  REJECTED: { label: 'Rejet\u00e9e', variant: 'danger' },
};

function getStatutLabel(s: string) {
  return STATUT_CONFIG[s]?.label ?? s;
}

function getStatutVariant(s: string) {
  return STATUT_CONFIG[s]?.variant ?? 'neutral';
}

// ===================== Component =====================

export default function FeuilleDeTempTab() {
  const { user } = useUserProfile();
  const { hasPermission } = usePermissions();
  const isRH = isAdminRole(user?.role) || hasPermission('rh', 'edit');

  // Filters
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek);
  const [filterStatut, setFilterStatut] = useState('');
  const [filterEmployeId, setFilterEmployeId] = useState('');

  // Selected timesheet for editing
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reject modal
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');

  // Add project row
  const [addProjectId, setAddProjectId] = useState('');

  // Data
  const { timesheets, isLoading: loadingList } = useTimesheets({
    semaine: selectedWeek || undefined,
    statut: filterStatut || undefined,
    employeId: filterEmployeId || undefined,
  });
  const {
    timesheet: detail,
    isLoading: loadingDetail,
    upsertEntry,
    submit,
    isSubmitting,
    approve,
    isApproving,
    reject,
  } = useTimesheet(editingId);
  const { createTimesheet, isCreating } = useCreateTimesheet();
  const { projects } = useProjects({ statut: 'ACTIVE' });
  const { employes } = useEmployes();

  // ---- Derived data for the grid ----
  const weekDates = useMemo(() => {
    if (!detail) return getWeekDates(selectedWeek);
    return getWeekDates(detail.semaine);
  }, [detail, selectedWeek]);

  // Group entries by project
  const entriesByProject = useMemo(() => {
    if (!detail) return new Map<string, Map<string, TimeEntry>>();
    const map = new Map<string, Map<string, TimeEntry>>();
    for (const e of detail.entries) {
      if (!map.has(e.projetId)) map.set(e.projetId, new Map());
      map.get(e.projetId)!.set(e.date, e);
    }
    return map;
  }, [detail]);

  // Projects shown in the grid: those with entries + any manually added
  const [extraProjectIds, setExtraProjectIds] = useState<string[]>([]);
  const gridProjectIds = useMemo(() => {
    const ids = new Set<string>(entriesByProject.keys());
    for (const id of extraProjectIds) ids.add(id);
    return Array.from(ids);
  }, [entriesByProject, extraProjectIds]);

  const projectMap = useMemo(() => {
    const m = new Map<string, { nom: string; code: string }>();
    for (const p of projects) m.set(p.id, { nom: p.nom, code: p.code });
    return m;
  }, [projects]);

  // ---- Handlers ----

  const handleCreateTimesheet = useCallback(async () => {
    if (!user) return;
    const dates = getWeekDates(selectedWeek);
    try {
      const ts = await createTimesheet({
        employeId: user.employeId ?? user.id?.toString() ?? '',
        employeNom: user.fullName ?? user.username ?? '',
        semaine: selectedWeek,
        dateDebut: dates[0],
        dateFin: dates[6],
      });
      setEditingId(ts.id);
      setExtraProjectIds([]);
      toast.success('Feuille de temps cr\u00e9\u00e9e');
    } catch {
      /* handled in hook */
    }
  }, [user, selectedWeek, createTimesheet]);

  const handleCellChange = useCallback(
    async (projetId: string, date: string, value: string) => {
      if (!editingId) return;
      const heures = value === '' ? '0' : value;
      try {
        await upsertEntry({ projetId, date, heures });
      } catch {
        /* handled in hook */
      }
    },
    [editingId, upsertEntry]
  );

  const handleSubmit = useCallback(async () => {
    try {
      await submit();
      setEditingId(null);
    } catch {
      /* handled in hook */
    }
  }, [submit]);

  const handleApprove = useCallback(async () => {
    try {
      await approve();
      setEditingId(null);
    } catch {
      /* handled in hook */
    }
  }, [approve]);

  const handleReject = useCallback(async () => {
    if (!rejectMotif.trim()) {
      toast.warning('Le motif de rejet est obligatoire');
      return;
    }
    try {
      await reject(rejectMotif);
      setRejectModalId(null);
      setRejectMotif('');
      setEditingId(null);
    } catch {
      /* handled in hook */
    }
  }, [reject, rejectMotif]);

  const handleAddProjectRow = useCallback(() => {
    if (!addProjectId) return;
    setExtraProjectIds((prev) =>
      prev.includes(addProjectId) ? prev : [...prev, addProjectId]
    );
    setAddProjectId('');
  }, [addProjectId]);

  // ---- Computed totals ----
  const getHours = (projetId: string, date: string): number => {
    const entry = entriesByProject.get(projetId)?.get(date);
    return entry ? parseFloat(entry.heures) || 0 : 0;
  };

  const getRowTotal = (projetId: string): number =>
    weekDates.reduce((sum, d) => sum + getHours(projetId, d), 0);

  const getColTotal = (date: string): number =>
    gridProjectIds.reduce((sum, pid) => sum + getHours(pid, date), 0);

  const grandTotal = weekDates.reduce((sum, d) => sum + getColTotal(d), 0);

  // Available projects for the "add row" dropdown (not already in grid)
  const availableProjects = projects.filter(
    (p) => !gridProjectIds.includes(p.id)
  );

  const isEditable =
    detail?.statut === 'DRAFT' || detail?.statut === 'REJECTED';

  // ===================== RENDER: Weekly Grid Editor =====================
  if (editingId) {
    if (loadingDetail) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Back + header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => {
              setEditingId(null);
              setExtraProjectIds([]);
            }}
          >
            Retour
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-content-primary truncate">
              {detail?.employeNom ?? 'Feuille de temps'}
            </h3>
            <p className="text-sm text-content-muted">
              Semaine {detail?.semaine} &middot;{' '}
              {detail ? `${formatDate(detail.dateDebut)} - ${formatDate(detail.dateFin)}` : ''}
            </p>
          </div>
          {detail && (
            <Badge
              value={getStatutLabel(detail.statut)}
              variant={getStatutVariant(detail.statut)}
            />
          )}
        </div>

        {/* Rejected reason banner */}
        {detail?.statut === 'REJECTED' && detail.rejeteMotif && (
          <div className="bg-status-danger-bg border border-status-danger/30 rounded-lg p-3 text-sm text-status-danger">
            <strong>Motif de rejet :</strong> {detail.rejeteMotif}
          </div>
        )}

        {/* Grid */}
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge bg-surface-subtle">
                <th className="text-left px-3 py-2 font-semibold text-content-secondary min-w-[160px]">
                  Projet
                </th>
                {weekDates.map((d, i) => (
                  <th
                    key={d}
                    className="text-center px-2 py-2 font-semibold text-content-secondary min-w-[64px]"
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-xs text-content-muted font-normal">
                      {formatDate(d)}
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-2 font-semibold text-content-secondary min-w-[64px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {gridProjectIds.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-8 text-content-muted"
                  >
                    Aucun projet. Ajoutez un projet ci-dessous.
                  </td>
                </tr>
              )}
              {gridProjectIds.map((pid) => {
                const proj = projectMap.get(pid);
                const rowTotal = getRowTotal(pid);
                return (
                  <tr key={pid} className="border-b border-edge hover:bg-surface-subtle/50">
                    <td className="px-3 py-2 text-content-primary font-medium">
                      <div className="truncate max-w-[200px]">
                        {proj?.nom ?? pid}
                      </div>
                      {proj?.code && (
                        <div className="text-xs text-content-muted">
                          {proj.code}
                        </div>
                      )}
                    </td>
                    {weekDates.map((d) => {
                      const val = getHours(pid, d);
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {isEditable ? (
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              className="w-14 h-8 text-center text-sm rounded border border-edge bg-input-bg text-input-text focus:outline-none focus:border-input-focus focus:ring-1 focus:ring-input-focus/30"
                              defaultValue={val || ''}
                              onBlur={(e) =>
                                handleCellChange(pid, d, e.target.value)
                              }
                            />
                          ) : (
                            <span
                              className={
                                val > 0
                                  ? 'text-content-primary font-medium'
                                  : 'text-content-muted'
                              }
                            >
                              {val || '-'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-semibold text-accent">
                      {rowTotal.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {gridProjectIds.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-edge bg-surface-subtle">
                  <td className="px-3 py-2 font-semibold text-content-secondary">
                    Total
                  </td>
                  {weekDates.map((d) => (
                    <td
                      key={d}
                      className="px-2 py-2 text-center font-semibold text-content-primary"
                    >
                      {getColTotal(d).toFixed(1)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-bold text-accent">
                    {grandTotal.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>

        {/* Add project row */}
        {isEditable && availableProjects.length > 0 && (
          <div className="flex items-end gap-2">
            <SelectField
              label="Ajouter un projet"
              name="addProject"
              value={addProjectId}
              onChange={(e) => setAddProjectId(e.target.value)}
              options={availableProjects.map((p) => ({
                value: p.id,
                label: `${p.code} - ${p.nom}`,
              }))}
              placeholder="Choisir un projet..."
              containerClassName="flex-1 max-w-sm"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={handleAddProjectRow}
              disabled={!addProjectId}
            >
              Ajouter
            </Button>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex flex-wrap gap-3 pt-2">
          {detail?.statut === 'DRAFT' && (
            <Button
              variant="primary"
              icon={Send}
              onClick={handleSubmit}
              isLoading={isSubmitting}
            >
              Soumettre
            </Button>
          )}
          {detail?.statut === 'REJECTED' && (
            <Button
              variant="primary"
              icon={Send}
              onClick={handleSubmit}
              isLoading={isSubmitting}
            >
              Resoumettre
            </Button>
          )}
          {detail?.statut === 'SUBMITTED' && isRH && (
            <>
              <Button
                variant="success"
                icon={CheckCircle}
                onClick={handleApprove}
                isLoading={isApproving}
              >
                Approuver
              </Button>
              <Button
                variant="danger"
                icon={XCircle}
                onClick={() => setRejectModalId(editingId)}
              >
                Rejeter
              </Button>
            </>
          )}
        </div>

        {/* Reject modal (inline) */}
        {rejectModalId && (
          <Card className="mt-2 max-w-md">
            <h4 className="font-semibold text-content-primary mb-2">
              Motif de rejet
            </h4>
            <textarea
              className="w-full h-20 p-2 rounded border border-edge bg-input-bg text-input-text text-sm focus:outline-none focus:border-input-focus focus:ring-1 focus:ring-input-focus/30 resize-none"
              placeholder="Indiquez la raison du rejet..."
              value={rejectMotif}
              onChange={(e) => setRejectMotif(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <Button variant="danger" size="sm" onClick={handleReject}>
                Confirmer le rejet
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRejectModalId(null);
                  setRejectMotif('');
                }}
              >
                Annuler
              </Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ===================== RENDER: Timesheets list =====================
  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        {/* Week selector */}
        <div className="flex items-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            onClick={() => setSelectedWeek((w) => shiftWeek(w, -1))}
            aria-label="Semaine pr\u00e9c\u00e9dente"
          />
          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">
              Semaine
            </label>
            <input
              type="week"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="h-10 px-3 rounded-lg border border-edge bg-input-bg text-input-text text-sm focus:outline-none focus:border-input-focus focus:ring-1 focus:ring-input-focus/30"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            onClick={() => setSelectedWeek((w) => shiftWeek(w, 1))}
            aria-label="Semaine suivante"
          />
        </div>

        {/* Filter by status */}
        <SelectField
          label="Statut"
          name="filterStatut"
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          options={[
            { value: '', label: 'Tous' },
            { value: 'DRAFT', label: 'Brouillon' },
            { value: 'SUBMITTED', label: 'Soumise' },
            { value: 'APPROVED', label: 'Approuv\u00e9e' },
            { value: 'REJECTED', label: 'Rejet\u00e9e' },
          ]}
          placeholder=""
          containerClassName="w-40"
        />

        {/* Filter by employee (HR only) */}
        {isRH && employes.length > 0 && (
          <SelectField
            label="Employ\u00e9"
            name="filterEmploye"
            value={filterEmployeId}
            onChange={(e) => setFilterEmployeId(e.target.value)}
            options={[
              { value: '', label: 'Tous' },
              ...employes.map((emp: any) => ({
                value: emp.id,
                label: `${emp.prenom ?? ''} ${emp.nom ?? ''}`.trim() || emp.matricule || emp.id,
              })),
            ]}
            placeholder=""
            containerClassName="w-48"
          />
        )}

        {/* Spacer + create button */}
        <div className="sm:ml-auto">
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleCreateTimesheet}
            isLoading={isCreating}
          >
            Nouvelle feuille
          </Button>
        </div>
      </div>

      {/* List */}
      {loadingList ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
        </div>
      ) : timesheets.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Aucune feuille de temps"
          description="Aucune feuille de temps trouv\u00e9e pour cette semaine. Cliquez sur \u00ab Nouvelle feuille \u00bb pour en cr\u00e9er une."
          action={{ label: 'Nouvelle feuille', onClick: handleCreateTimesheet }}
        />
      ) : (
        <div className="grid gap-3">
          {timesheets.map((ts) => (
            <Card
              key={ts.id}
              padding="sm"
              className="cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => {
                setEditingId(ts.id);
                setExtraProjectIds([]);
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Clock size={18} className="text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-content-primary truncate">
                      {ts.employeNom}
                    </p>
                    <p className="text-xs text-content-muted flex items-center gap-1">
                      <CalendarDays size={12} />
                      {ts.semaine} &middot; {formatDate(ts.dateDebut)} -{' '}
                      {formatDate(ts.dateFin)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="text-sm font-semibold text-content-primary">
                    {parseFloat(ts.totalHeures).toFixed(1)}h
                  </span>
                  <Badge
                    value={getStatutLabel(ts.statut)}
                    variant={getStatutVariant(ts.statut)}
                    size="sm"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
