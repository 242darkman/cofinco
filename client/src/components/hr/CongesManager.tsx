import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, Calendar, Clock, Lock, RefreshCw, AlertCircle, Wifi, WifiOff, List, CalendarDays, Search } from 'lucide-react';
import { DemandeConge } from '../../hooks/hr/useConges';
import { Card, Button, Modal, FormField, SelectField, Badge, StatCard, ResponsiveTable } from '../ui';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePermissions } from '../auth/ProtectedFeature';
import { StatutConge, STATUT_CONGE_LABELS } from '@shared/enum/status-constants';
import { useHrRealtime, useHrSyncStatus } from '../../hooks/hr/useHrRealtime';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import LeaveCalendar from './LeaveCalendar';
import type { Employe } from '../../hooks/hr/useEmployes';

interface LeaveBalanceByType {
  type: string;
  approved: number;
  pending: number;
  joursApproved: number;
  joursPending: number;
}

interface LeaveBalance {
  employeId: string;
  year: number;
  available: number;
  balance?: {
    acquired: number;
    used: number;
    pending: number;
    carryOver: number;
  };
  byType?: LeaveBalanceByType[];
}

interface CongesManagerProps {
  demandes: DemandeConge[];
  onApprove: (id: number, commentaire?: string) => Promise<void>;
  onReject: (id: number, commentaire: string) => Promise<void>;
  onCreate: (data: {
    employeId: string;
    employeNom: string;
    type: string;
    dateDebut: string;
    dateFin: string;
    motif?: string;
  }) => Promise<boolean>;
  stats: {
    enCours: number;
    enAttente: number;
    approuves: number;
    refuses: number;
  };
  currentEmployeId?: string;
  employes?: Employe[];
}

export default function CongesManager({
  demandes,
  onApprove,
  onReject,
  onCreate,
  stats,
  currentEmployeId,
  employes = [],
}: CongesManagerProps) {
  // RBAC permissions
  const { isAdmin, hasPermission } = usePermissions();
  const canCreateConges = hasPermission('rh', 'edit') || hasPermission('conges', 'create');
  const canApproveConges = hasPermission('rh', 'approve') || hasPermission('conges', 'approve');

  // Hook appelé au niveau racine du composant (règle des hooks respectée)
  const { user, getFullName } = useUserProfile();
  const canApproveActions = canApproveConges || isAdmin;

  // Resolve current employee ID from user profile or prop
  const resolvedEmployeId = currentEmployeId || user?.employeId;

  // Real-time sync
  const { syncStatus, refresh } = useHrRealtime({
    entities: ['conge'],
    showToasts: true,
  });
  const { statusText, statusColor, lastUpdateTime, isConnected } = useHrSyncStatus();

  // Fetch leave balance for current employee
  const { data: leaveBalance } = useQuery<{ success: boolean; data: LeaveBalance }>({
    queryKey: ['/api/hr/conges/balance', resolvedEmployeId],
    queryFn: () => api.get<{ success: boolean; data: LeaveBalance }>(`/api/hr/conges/balance/${resolvedEmployeId}`),
    enabled: !!resolvedEmployeId,
    staleTime: 30000,
  });

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showForm, setShowForm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [formData, setFormData] = useState({
    employeId: '',
    employeNom: '',
    type: 'Congé Annuel',
    dateDebut: '',
    dateFin: '',
    demiJournee: '' as '' | 'AM' | 'PM',
    motif: ''
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Employee search for admin mode
  const [employeSearch, setEmployeSearch] = useState('');
  const [showEmployeDropdown, setShowEmployeDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const filteredEmployes = useMemo(() => {
    if (!employeSearch.trim()) return employes.filter(e => e.statut === 'ACTIVE').slice(0, 10);
    const q = employeSearch.toLowerCase();
    return employes
      .filter(e => e.statut === 'ACTIVE')
      .filter(e =>
        `${e.nom} ${e.prenom}`.toLowerCase().includes(q) ||
        e.matricule?.toLowerCase().includes(q) ||
        e.poste?.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [employes, employeSearch]);

  const selectEmploye = (emp: Employe) => {
    setFormData(prev => ({
      ...prev,
      employeId: emp.id,
      employeNom: `${emp.nom} ${emp.prenom}`.trim(),
    }));
    setEmployeSearch(`${emp.nom} ${emp.prenom}`.trim());
    setShowEmployeDropdown(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowEmployeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-populate for non-admin when opening form
  const handleOpenForm = () => {
    if (!isAdmin && user) {
      setFormData(prev => ({
        ...prev,
        employeId: user.employeId || '',
        employeNom: getFullName(),
      }));
    }
    setShowForm(true);
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(demandes.length / ITEMS_PER_PAGE);
  const paginatedDemandes = demandes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Calculate requested days (supports half-day on last day)
  const calculateDays = (start: string, end: string, demiJournee: '' | 'AM' | 'PM') => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    let count = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++; // Exclude weekends
      current.setDate(current.getDate() + 1);
    }
    // Half-day on last day: subtract 0.5 from total
    if (demiJournee && count > 0) return count - 0.5;
    return count;
  };

  const requestedDays = useMemo(
    () => calculateDays(formData.dateDebut, formData.dateFin, formData.demiJournee),
    [formData.dateDebut, formData.dateFin, formData.demiJournee]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    if (new Date(formData.dateFin) < new Date(formData.dateDebut)) {
      setFormError('La date de fin doit être postérieure à la date de début');
      return;
    }

    if (!formData.employeId) {
      setFormError("Veuillez sélectionner un employé");
      return;
    }

    // Check balance if creating for current user
    if (formData.employeId === resolvedEmployeId && leaveBalance?.data) {
      if (requestedDays > leaveBalance.data.available) {
        setFormError(`Solde insuffisant: ${leaveBalance.data.available} jour(s) disponible(s), ${requestedDays} demandé(s)`);
        return;
      }
    }

    // Build motif with half-day info if relevant
    const motifParts: string[] = [];
    if (formData.demiJournee) {
      const period = formData.demiJournee === 'AM' ? 'matin' : 'après-midi';
      if (formData.dateDebut === formData.dateFin) {
        motifParts.push(`Demi-journée (${period})`);
      } else {
        const lastDay = new Date(formData.dateFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        motifParts.push(`Dernier jour (${lastDay}) : demi-journée ${period}`);
      }
    }
    if (formData.motif) motifParts.push(formData.motif);

    const success = await onCreate({
      ...formData,
      motif: motifParts.join(' — ') || undefined,
    });
    if (success) {
      setFormData({
        employeId: '',
        employeNom: '',
        type: 'Congé Annuel',
        dateDebut: '',
        dateFin: '',
        demiJournee: '',
        motif: ''
      });
      setEmployeSearch('');
      setShowForm(false);
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || !rejectComment.trim()) return;
    await onReject(showRejectModal, rejectComment);
    setShowRejectModal(null);
    setRejectComment('');
  };

  const columns = [
    {
      label: 'Employé',
      key: 'employeNom',
      primary: true,
      format: (val: string, item: DemandeConge) => (
          <div className="flex flex-col">
              <span className="font-semibold text-content-primary">{val}</span>
              <span className="text-[10px] text-content-muted">{item.type}</span>
          </div>
      )
    },
    {
        label: 'Période',
        key: 'dateDebut',
        format: (_: string, item: DemandeConge) => (
            <div className="flex items-center gap-1 text-xs text-content-secondary">
                <Calendar size={12} className="text-content-muted" />
                <span>{new Date(item.dateDebut).toLocaleDateString()} - {new Date(item.dateFin).toLocaleDateString()}</span>
            </div>
        )
    },
    {
        label: 'Durée',
        key: 'duree',
        hideOnMobile: true,
        format: (_: any, item: DemandeConge) => {
             const start = new Date(item.dateDebut);
             const end = new Date(item.dateFin);
             let count = 0;
             const cur = new Date(start);
             while (cur <= end) {
               if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
               cur.setDate(cur.getDate() + 1);
             }
             // Check if motif contains half-day info
             const isHalf = item.motif?.includes('demi-journée') || item.motif?.includes('Demi-journée');
             const days = isHalf ? count - 0.5 : count;
             const display = days % 1 !== 0 ? days.toFixed(1).replace('.', ',') : String(days);
             return <span className="text-xs font-mono">{display}j</span>;
        }
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string) => {
         const variant = val === StatutConge.APPROVED ? 'success' : val === StatutConge.REJECTED ? 'danger' : 'warning';
         return <Badge variant={variant} value={STATUT_CONGE_LABELS[val as keyof typeof STATUT_CONGE_LABELS] || val} size="sm" />;
      }
    },
    {
      label: 'Actions',
      key: 'actions',
      format: (_: any, item: DemandeConge) => {
        // Utilise canApproveActions défini au niveau racine du composant (via closure)
        if (!canApproveActions || item.statut !== StatutConge.PENDING) return null;

        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(item.id); }}
              className="p-1.5 hover:bg-status-success-bg text-status-success rounded-lg transition"
              title="Approuver"
            >
              <CheckCircle size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowRejectModal(item.id); }}
              className="p-1.5 hover:bg-status-danger-bg text-status-danger rounded-lg transition"
              title="Refuser"
            >
              <XCircle size={16} />
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Sync Status Bar */}
      <div className="shrink-0 flex items-center justify-between px-2 py-1 bg-surface/50 rounded text-xs">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi size={12} className="text-status-success" />
          ) : (
            <WifiOff size={12} className="text-status-danger" />
          )}
          <span className={statusColor}>{statusText}</span>
          {lastUpdateTime && (
            <span className="text-content-muted">· {lastUpdateTime}</span>
          )}
        </div>
        <button
          onClick={() => refresh('conge')}
          className={`p-1 hover:bg-surface-elevated rounded transition ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
          title="Rafraîchir"
        >
          <RefreshCw size={12} className="text-content-muted" />
        </button>
      </div>

      {/* Leave Balance Card (if available) */}
      {leaveBalance?.data && (
        <div className="shrink-0 bg-gradient-to-r from-accent/10 to-status-info/10 border border-accent/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-medium text-content-muted">Votre solde congés {new Date().getFullYear()}</h4>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-accent">{leaveBalance.data.available}</span>
                <span className="text-xs text-content-muted">jours disponibles</span>
              </div>
            </div>
            {leaveBalance.data.balance && (
              <div className="text-right text-xs text-content-muted space-y-0.5">
                <div>Acquis: <span className="text-content-primary">{leaveBalance.data.balance.acquired}j</span></div>
                <div>Utilisés: <span className="text-status-warning">{leaveBalance.data.balance.used}j</span></div>
                <div>En attente: <span className="text-status-warning">{leaveBalance.data.balance.pending}j</span></div>
              </div>
            )}
          </div>
          {/* Per-type breakdown */}
          {leaveBalance.data.byType && leaveBalance.data.byType.length > 0 && (
            <div className="mt-3 pt-3 border-t border-accent/20">
              <h5 className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-2">Répartition par type</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {leaveBalance.data.byType.map((bt) => (
                  <div key={bt.type} className="bg-surface/60 rounded-md px-2.5 py-1.5">
                    <div className="text-[10px] text-content-muted truncate" title={bt.type}>{bt.type}</div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-sm font-bold text-content-primary">{bt.joursApproved}j</span>
                      {bt.joursPending > 0 && (
                        <span className="text-[10px] text-status-warning">+{bt.joursPending}j en att.</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards - Compact */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
            title="En Cours"
             value={stats.enCours}
             icon={Clock}
             color="primary"
             className="p-3"
        />
        <StatCard
             title="En Attente"
             value={stats.enAttente}
             icon={Lock}
             color="warning"
             className="p-3"
        />
        <StatCard
             title="Approuvés"
             value={stats.approuves}
             icon={CheckCircle}
             color="success"
             className="p-3"
        />
        <StatCard
             title="Refusés"
             value={stats.refuses}
             icon={XCircle}
             color="danger"
             className="p-3"
        />
      </div>

      {/* Main Content - Flex Grow */}
      <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col">
        {/* Compact Header Toolbar */}
        <div className="shrink-0 p-2 border-b border-edge flex justify-between items-center bg-surface-base/50">
           <h3 className="text-xs font-bold text-content-primary flex items-center gap-2">
              <Calendar size={14} className="text-accent" />
              Demandes de Congés
           </h3>
           <div className="flex items-center gap-2">
             {/* View Mode Toggle */}
             <div className="flex items-center bg-surface rounded-lg p-0.5">
               <button
                 onClick={() => setViewMode('list')}
                 className={`p-1 rounded transition ${viewMode === 'list' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
                 title="Vue liste"
               >
                 <List size={14} />
               </button>
               <button
                 onClick={() => setViewMode('calendar')}
                 className={`p-1 rounded transition ${viewMode === 'calendar' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
                 title="Vue calendrier"
               >
                 <CalendarDays size={14} />
               </button>
             </div>
             {canCreateConges && (
               <Button variant="primary" size="sm" onClick={handleOpenForm} className="h-7 text-xs px-2">
                 <Plus size={14} />
                 <span className="hidden sm:inline">Nouvelle Demande</span>
               </Button>
             )}
           </div>
        </div>

        {/* Content: List or Calendar */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'list' ? (
            <ResponsiveTable
              data={paginatedDemandes}
              columns={columns}
              mobileBreakpoint="md"
              emptyMessage="Aucune demande de congé."
              maxHeight="100%"
              pagination={{
                page: currentPage,
                totalPages,
                onPageChange: setCurrentPage
              }}
              density="compact"
              className="border-0 rounded-none h-full"
              headerClassName="bg-surface-base sticky top-0"
            />
          ) : (
            <LeaveCalendar demandes={demandes} />
          )}
        </div>
      </div>

      {/* Create Leave Request Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setFormError(null); setEmployeSearch(''); }}
        title="Nouvelle Demande de Congé"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-status-danger-bg border border-status-danger/30 rounded-lg text-status-danger text-sm">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          {/* ── Employee Selection ─────────────────────── */}
          {isAdmin ? (
            /* Admin: searchable employee select */
            <div ref={searchRef} className="relative">
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Employé <span className="text-status-danger">*</span>
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="text"
                  value={employeSearch}
                  onChange={(e) => {
                    setEmployeSearch(e.target.value);
                    setShowEmployeDropdown(true);
                    // Clear selection if user edits the text
                    if (formData.employeId) {
                      setFormData(prev => ({ ...prev, employeId: '', employeNom: '' }));
                    }
                  }}
                  onFocus={() => setShowEmployeDropdown(true)}
                  placeholder="Rechercher par nom, matricule..."
                  className="w-full pl-9 pr-3 py-2 bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-accent focus:outline-none text-sm"
                />
              </div>
              {/* Selected badge */}
              {formData.employeId && (
                <div className="mt-1.5 flex items-center gap-2 px-2 py-1 bg-accent/10 border border-accent/30 rounded text-xs text-accent">
                  <CheckCircle size={12} />
                  <span className="font-medium">{formData.employeNom}</span>
                  <span className="text-content-muted">({employes.find(e => e.id === formData.employeId)?.matricule})</span>
                </div>
              )}
              {/* Dropdown */}
              {showEmployeDropdown && !formData.employeId && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-surface border border-edge rounded-lg shadow-xl">
                  {filteredEmployes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-content-muted">Aucun employé trouvé</div>
                  ) : (
                    filteredEmployes.map(emp => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => selectEmploye(emp)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-elevated transition flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm text-content-primary">{emp.nom} {emp.prenom}</div>
                          <div className="text-[10px] text-content-muted">{emp.poste || 'N/A'}</div>
                        </div>
                        <span className="text-[10px] font-mono text-content-muted">{emp.matricule}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Non-admin: auto-populated, read-only display */
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Employé</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-surface/60 border border-edge rounded-lg">
                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                  {user?.prenom?.charAt(0)}{user?.nom?.charAt(0)}
                </div>
                <div>
                  <div className="text-sm text-content-primary font-medium">{getFullName()}</div>
                  {user?.matricule && <div className="text-[10px] text-content-muted">{user.matricule}</div>}
                </div>
              </div>
            </div>
          )}

          <SelectField
            label="Type de Congé"
            name="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            options={[
              { value: 'Congé Annuel', label: 'Congé Annuel' },
              { value: 'Congé Maladie', label: 'Congé Maladie' },
              { value: 'Congé Sans Solde', label: 'Congé Sans Solde' },
              { value: 'Congé Maternité', label: 'Congé Maternité' },
              { value: 'Congé Paternité', label: 'Congé Paternité' },
              { value: 'Congé Décès', label: 'Congé Décès' },
              { value: 'Congé Spécial', label: 'Congé Spécial' }
            ]}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Date de Début"
              name="dateDebut"
              type="date"
              value={formData.dateDebut}
              onChange={(e) => {
                const val = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  dateDebut: val,
                  // Auto-fill end date if empty
                  dateFin: prev.dateFin || val,
                }));
              }}
              required
            />

            <FormField
              label="Date de Fin"
              name="dateFin"
              type="date"
              value={formData.dateFin}
              onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
              required
            />
          </div>

          {/* Half-day option on last day */}
          {formData.dateDebut && formData.dateFin && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                {formData.dateDebut === formData.dateFin
                  ? 'Durée de la journée'
                  : `Dernier jour (${new Date(formData.dateFin).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })})`
                }
              </label>
              <div className="flex gap-2">
                {[
                  { value: '' as const, label: 'Journée entière', icon: '☀️' },
                  { value: 'AM' as const, label: 'Matin seul.', icon: '🌅' },
                  { value: 'PM' as const, label: 'Après-midi seul.', icon: '🌇' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, demiJournee: opt.value }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                      formData.demiJournee === opt.value
                        ? 'bg-accent-secondary text-content-primary ring-1 ring-accent'
                        : 'bg-surface text-content-muted hover:bg-surface-elevated'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              {formData.demiJournee && formData.dateDebut !== formData.dateFin && (
                <p className="mt-1 text-[10px] text-content-muted">
                  Les jours précédents comptent comme journées entières, le dernier jour en demi-journée ({formData.demiJournee === 'AM' ? 'matin' : 'après-midi'}).
                </p>
              )}
            </div>
          )}

          {/* Days Preview */}
          {requestedDays > 0 && (
            <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
              <span className="text-sm text-content-muted">Jours ouvrés demandés:</span>
              <span className={`text-lg font-bold ${
                leaveBalance?.data && requestedDays > leaveBalance.data.available
                  ? 'text-status-danger'
                  : 'text-accent'
              }`}>
                {requestedDays % 1 !== 0
                  ? `${requestedDays.toFixed(1).replace('.', ',')} jour(s)`
                  : `${requestedDays} jour(s)`
                }
              </span>
            </div>
          )}

          <FormField
            label="Motif (optionnel)"
            name="motif"
            type="text"
            value={formData.motif}
            onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
            placeholder="Raison de la demande..."
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowForm(false); setFormError(null); setEmployeSearch(''); }}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Créer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal !== null}
        onClose={() => { setShowRejectModal(null); setRejectComment(''); }}
        title="Refuser la demande de congé"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-muted">
            Veuillez indiquer le motif du refus. Ce commentaire sera visible par l'employé.
          </p>
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="Motif du refus..."
            className="w-full p-3 bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-status-danger focus:outline-none resize-none"
            rows={3}
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowRejectModal(null); setRejectComment(''); }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleReject}
              variant="danger"
              disabled={!rejectComment.trim()}
            >
              Confirmer le refus
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
