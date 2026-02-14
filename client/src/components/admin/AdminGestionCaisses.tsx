import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Monitor, Lock, MoreVertical, User, UserMinus, UserPlus, XCircle, Trash2, Clock, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, CalendarDays, X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, FormField, SelectField, Modal, ConfirmDialog, SearchableSelect } from '../ui';
import { authService } from '../../lib/auth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { api, caisseApi } from '../../lib/api-client';
import { ForceCloseModal } from './ForceCloseModal';
import AssignCashierModal from './AssignCashierModal';
import CaisseOperatingHoursModal from './CaisseOperatingHoursModal';
import { isAdminRole, normalizeRole } from '@shared/types/roles';
import { StatutClient, StatutCaisseAgent, StatutCaisse, StatutCaisseType, TYPE_CAISSE_LABELS, TypeCaisseType } from '@shared/enum/status-constants';

interface AssignmentDetail {
  id: string;
  userId: string;
  assignedAt: string | null;
  nom: string;
  prenom: string;
  photoProfile?: string | null;
}

interface Caisse {
  id: string;
  nom: string;
  type: TypeCaisseType | string;
  statut: StatutCaisseType;
  solde: string;
  isOccupied?: boolean;
  occupiedBy?: string;
  agenceId: string;
  assignmentsDetails?: AssignmentDetail[];
  // Operating hours
  operatingHoursEnabled?: boolean;
  operatingHoursStart?: string;
  operatingHoursEnd?: string;
  operatingDays?: number[];
}

export default function AdminGestionCaisses() {
  const user = authService.getCurrentUser();
  const isAdmin = isAdminRole(user?.role);
  const queryClient = useQueryClient();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  
  const { data: agences = [] } = useQuery<any[]>({
    queryKey: ['agences'],
    queryFn: async () => {
       const res = await api.get('/agences');
       return (res as any[]) || [];
    },
    enabled: isAdmin
  });
  
  const [formData, setFormData] = useState({
    nom: '',
    type: 'PHYSICAL',
    agenceId: user?.agenceId || '', 
  }); 

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCaisseForAssign, setSelectedCaisseForAssign] = useState<Caisse | null>(null);
  const [currentAssigneeIds, setCurrentAssigneeIds] = useState<string[]>([]);
  const [agentsPanelCaisse, setAgentsPanelCaisse] = useState<Caisse | null>(null);
  const [agentsSearch, setAgentsSearch] = useState('');
  
  const [isForceCloseModalOpen, setIsForceCloseModalOpen] = useState(false);
  const [selectedCaisseForClose, setSelectedCaisseForClose] = useState<Caisse | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  // Operating Hours Modal State
  const [isOperatingHoursModalOpen, setIsOperatingHoursModalOpen] = useState(false);
  const [selectedCaisseForHours, setSelectedCaisseForHours] = useState<Caisse | null>(null);
  
  // Utiliser l'agenceId de la caisse sélectionnée pour récupérer les employés de cette agence
  const targetAgenceId = selectedCaisseForAssign?.agenceId || user?.agenceId;

  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<any[]>({
    queryKey: ['employes-agence', targetAgenceId],
    queryFn: async () => {
        const res = await api.get<any[]>(`/employes?agenceId=${targetAgenceId}`);
        return (res || []).filter((emp: any) => {
          // Le rôle est dans user.role (Architecture V3)
          const role = emp.user?.role || emp.role;
          const normalizedRole = normalizeRole(role);
          return !isAdminRole(normalizedRole);
        }).map((emp: any) => ({
          id: emp.user?.id,
          nom: emp.user?.nom,
          prenom: emp.user?.prenom,
          username: emp.user?.username,
          role: emp.user?.role || emp.role || 'Agent',
          photoProfile: emp.user?.photoProfile
        }));
    },
    enabled: isAssignModalOpen && !!targetAgenceId
  });

  const assignMutation = useMutation({
      mutationFn: async ({ caisseId, userIds }: { caisseId: string, userIds: string[] }) => {
          return await api.post(`/caisses/${caisseId}/assign`, { userIds });
      },
      onSuccess: (_data, variables) => {
          queryClient.invalidateQueries({ queryKey: ['caisses'] });
          setIsAssignModalOpen(false);
          const count = variables.userIds.length;
          toast.success(count > 0 ? `${count} agent${count > 1 ? 's' : ''} habilité${count > 1 ? 's' : ''}` : 'Habilitations retirées');
          setSelectedCaisseForAssign(null);
          setCurrentAssigneeIds([]);
      },
      onError: () => toast.error("Erreur lors de l'assignation")
  });

  const unassignAgent = (caisse: Caisse, userIdToRemove: string) => {
      const currentIds = (caisse as any).assignments || [];
      const newIds = currentIds.filter((id: string) => id !== userIdToRemove);
      assignMutation.mutate({ caisseId: caisse.id, userIds: newIds });
  };

  const handleOpenAssign = (caisse: Caisse) => {
      setSelectedCaisseForAssign(caisse);
      // Récupérer les assignés actuels depuis la BDD
      const existing = (caisse as any).assignments || [];
      setCurrentAssigneeIds(existing);
      setIsAssignModalOpen(true);
  };

  const handleAssignSave = (userIds: string[]) => {
      if (!selectedCaisseForAssign) return;
      assignMutation.mutate({ caisseId: selectedCaisseForAssign.id, userIds });
  };

  const { data: caisses = [], isLoading } = useQuery<Caisse[]>({
    queryKey: ['caisses', isAdmin ? 'all' : user?.agenceId],
    queryFn: async () => {
       const endpoint = isAdmin ? '/caisses' : `/agences/${user?.agenceId}/caisses`;
       const res = await api.get<Caisse[]>(endpoint);
       return res || [];
    },
    enabled: !!user?.agenceId || isAdmin,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Refresh every 30 seconds instead of using unstable WebSocket
  });

  // Récupérer les caisses occupées pour détecter les agents busy
  const busyUserIds = useMemo(() => {
    const selectedCaisseId = selectedCaisseForAssign?.id;
    return caisses
      .filter(c => c.isOccupied && c.id !== selectedCaisseId)
      .map(c => (c as any).occupiedById)
      .filter(Boolean);
  }, [caisses, selectedCaisseForAssign]);

  // Enrichir les employés avec le statut busy
  const employeesWithBusyStatus = useMemo(() => {
    return employees.map(emp => ({
      ...emp,
      isBusy: busyUserIds.includes(emp.id)
    }));
  }, [employees, busyUserIds]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/caisses', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caisses'] });
      setIsModalOpen(false);
      setFormData({ nom: '', type: 'PHYSICAL', agenceId: user?.agenceId || '' });
      toast.success('Caisse créée');
    },
    onError: (err: any) => toast.error(err.error || "Erreur")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await caisseApi.delete(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['caisses'] });
        toast.success('Caisse supprimée');
    },
    onError: (err: any) => toast.error(err.message || "Impossible de supprimer")
  });

  const liquidateMutation = useMutation({
    mutationFn: async (id: string) => await caisseApi.liquidate(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['caisses'] });
        toast.success('Caisse liquidée');
    },
    onError: (err: any) => toast.error(err.message || "Erreur")
  });

  const handleDelete = (caisse: Caisse) => {
      setOpenMenuId(null);
      if (caisse.statut === StatutCaisse.OPEN) {
          toast.error("Fermez d'abord la session");
          return;
      }
      const balance = Number(caisse.solde);
      if (balance > 0) {
          openConfirm({
              title: "Liquider ?",
              message: `${balance.toLocaleString()} FCFA seront transférés au coffre.`,
              variant: 'danger',
              confirmText: "Liquider",
              onConfirm: () => liquidateMutation.mutate(caisse.id)
          });
      } else {
          openConfirm({
              title: "Supprimer ?",
              message: `Supprimer "${caisse.nom}" ?`,
              variant: 'danger',
              confirmText: "Supprimer",
              onConfirm: () => deleteMutation.mutate(caisse.id)
          });
      }
  };

  const filteredCaisses = caisses.filter(c =>
    c.type === 'PHYSICAL' &&
    c.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredCaisses.length / pageSize);
  const paginatedCaisses = filteredCaisses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-2">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3 p-2 border-b border-edge bg-surface-muted/30">
        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface/40 border border-edge-subtle rounded-md text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-edge-strong"
          />
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)} 
          size="sm"
          className="bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary h-7 px-3 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nouvelle
        </Button>
      </div>

      {/* Compact Table View */}
      <div className="bg-surface/40 border border-edge-subtle rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-base/50 border-b border-edge-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Caisse</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Agence</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider">Statut</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-content-muted uppercase tracking-wider">Solde</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-content-muted uppercase tracking-wider min-w-[180px]">Agents assignés</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-content-muted uppercase tracking-wider w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/30">
              {paginatedCaisses.map((caisse) => (
                <tr key={caisse.id} className="hover:bg-surface-elevated/20 transition-colors">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        caisse.type === 'Coffre-Fort' 
                          ? 'bg-status-warning-bg' 
                          : 'bg-status-info-bg'
                      }`}>
                        {caisse.type === 'Coffre-Fort' ? 
                          <Lock className="w-4 h-4 text-status-warning" /> : 
                          <Monitor className="w-4 h-4 text-status-info" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-content-primary truncate">{caisse.nom}</div>
                        <div className="text-xs text-content-muted">{TYPE_CAISSE_LABELS[caisse.type as TypeCaisseType] || caisse.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-surface-elevated/50 text-content-secondary border border-edge-strong/50 min-w-[100px] max-w-[140px] truncate">
                      {agences.find(a => a.id === caisse.agenceId)?.nom || 'N/A'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        caisse.isOccupied 
                          ? 'bg-status-success shadow-sm shadow-status-success/50 animate-pulse' 
                          : 'bg-surface-muted0'
                      }`} />
                      <span className={`text-xs font-medium ${
                        caisse.isOccupied ? 'text-status-success' : 'text-content-muted'
                      }`}>
                        {caisse.isOccupied ? 'En ligne' : 'Fermée'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="font-mono font-semibold text-content-primary">
                      {Number(caisse.solde).toLocaleString()}
                    </div>
                    <div className="text-xs text-content-muted">FCFA</div>
                  </td>
                  <td className="px-3 py-1.5">
                    {(() => {
                      const details: AssignmentDetail[] = caisse.assignmentsDetails || [];
                      if (details.length === 0) {
                        return (
                          <span className="text-xs text-content-muted italic flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-content-muted" />
                            Non assignée
                          </span>
                        );
                      }
                      const onlineAgent = details.find(a => caisse.isOccupied && caisse.occupiedBy === a.userId);
                      return (
                        <button
                          onClick={() => { setAgentsPanelCaisse(caisse); setAgentsSearch(''); }}
                          className="flex items-center gap-2 group/btn hover:bg-surface-elevated/30 rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors w-full text-left"
                        >
                          {/* Avatar stack */}
                          <div className="flex -space-x-1.5">
                            {details.slice(0, 3).map((a, i) => (
                              <div
                                key={a.userId}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-edge ${
                                  caisse.isOccupied && caisse.occupiedBy === a.userId
                                    ? 'bg-status-success/30 text-status-success'
                                    : 'bg-accent-secondary/15 text-accent'
                                }`}
                                style={{ zIndex: 3 - i }}
                              >
                                {(a.prenom?.[0] || a.nom?.[0] || '?').toUpperCase()}
                              </div>
                            ))}
                            {details.length > 3 && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-edge bg-surface-elevated text-content-secondary">
                                +{details.length - 3}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-content-secondary group-hover/btn:text-content-primary transition-colors">
                              {details.length} agent{details.length > 1 ? 's' : ''}
                            </span>
                            {onlineAgent && (
                              <span className="block text-[10px] text-status-success truncate">
                                {onlineAgent.prenom} en ligne
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === caisse.id ? null : caisse.id);
                        }}
                        className="p-1 hover:bg-surface-elevated/50 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-content-muted" />
                      </button>

                      {openMenuId === caisse.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="fixed z-20 w-44 bg-surface border border-edge rounded-lg shadow-xl overflow-hidden"
                            style={{
                              top: `${(document.activeElement as HTMLElement)?.getBoundingClientRect().bottom + 4}px`,
                              right: `${window.innerWidth - (document.activeElement as HTMLElement)?.getBoundingClientRect().right}px`
                            }}
                          >
                            {caisse.isOccupied && (
                              <button
                                onClick={() => {
                                  setSelectedCaisseForClose(caisse);
                                  // Get sessionId from caisse object - it might be in different formats
                                  const sid = (caisse as any).sessionId || (caisse as any).currentSessionId || '';
                                  console.log('Session ID for force close:', sid, 'Caisse:', caisse);
                                  setActiveSessionId(sid);
                                  setIsForceCloseModalOpen(true);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs text-status-warning hover:bg-surface-elevated/50 flex items-center gap-2"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Forcer clôture
                              </button>
                            )}
                            <button
                              onClick={() => {
                                handleOpenAssign(caisse);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-content-secondary hover:bg-surface-elevated/50 flex items-center gap-2"
                            >
                              <User className="w-3.5 h-3.5" />
                              Assigner
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCaisseForHours(caisse);
                                setIsOperatingHoursModalOpen(true);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-content-secondary hover:bg-surface-elevated/50 flex items-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Horaires d'accès
                            </button>
                            <button
                              onClick={() => handleDelete(caisse)}
                              className="w-full px-3 py-2 text-left text-xs text-status-danger hover:bg-surface-elevated/50 flex items-center gap-2 border-t border-edge"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* Advanced Pagination Controls */}
      <div className="p-2 border border-edge-subtle bg-surface/40 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-content-muted">
          <span className="hidden sm:inline">
            {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredCaisses.length)} sur {filteredCaisses.length}
          </span>
          <span className="sm:hidden">
            Page {currentPage}/{totalPages || 1}
          </span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 bg-surface-base border border-edge rounded text-[10px] text-content-secondary focus:border-accent outline-none"
          >
            <option value={8}>8 / page</option>
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          
          <div className="flex items-center gap-1 mx-1">
             <span className="text-xs font-medium text-content-primary px-2">
               {currentPage} / {Math.max(1, totalPages)}
             </span>
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nouvelle Caisse">
        <div className="p-6 pt-2 space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
            <FormField 
              label="Nom"
              name="nom"
              required 
              placeholder="Ex: Guichet 01"
              value={formData.nom}
              onChange={e => setFormData({...formData, nom: e.target.value})}
            />
            {isAdmin && (
                <SearchableSelect
                  label="Agence"
                  name="agenceId"
                  required
                  variant="dark"
                  placeholder="Rechercher une agence..."
                  options={agences.filter((a: any) => a.statut === StatutClient.ACTIVE).map((a: any) => ({ value: a.id, label: a.nom }))}
                  value={formData.agenceId}
                  onChange={val => setFormData({...formData, agenceId: String(val)})}
                />
            )}
            <input type="hidden" name="type" value="PHYSICAL" />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" isLoading={createMutation.isPending}>Créer</Button>
            </div>
          </form>
        </div>
      </Modal>

      <AssignCashierModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setSelectedCaisseForAssign(null);
          setCurrentAssigneeIds([]);
        }}
        onSave={handleAssignSave}
        users={employeesWithBusyStatus}
        caisseName={selectedCaisseForAssign?.nom || ''}
        currentAssigneeIds={currentAssigneeIds}
        isLoading={isLoadingEmployees}
        isSaving={assignMutation.isPending}
      />

      <ForceCloseModal
        isOpen={isForceCloseModalOpen}
        caisse={selectedCaisseForClose}
        sessionId={activeSessionId}
        onConfirm={async (motif: string, keepFunds: boolean) => {
          try {
            await api.post(`/caisses/sessions/${activeSessionId}/force-close`, { motif, keepFunds });
            queryClient.invalidateQueries({ queryKey: ['caisses'] });
            toast.success('Session fermée');
            setIsForceCloseModalOpen(false);
          } catch (err: any) {
            throw new Error(err.error || 'Erreur');
          }
        }}
        onClose={() => setIsForceCloseModalOpen(false)}
      />

      <CaisseOperatingHoursModal
        isOpen={isOperatingHoursModalOpen}
        caisse={selectedCaisseForHours}
        onClose={() => {
          setIsOperatingHoursModalOpen(false);
          setSelectedCaisseForHours(null);
        }}
      />

      {/* Agents Panel Slide-over */}
      {agentsPanelCaisse && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setAgentsPanelCaisse(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-surface-base border-l border-edge shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-edge/60 bg-surface/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Users size={16} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-content-primary">{agentsPanelCaisse.nom}</h3>
                    <p className="text-[10px] text-content-muted">
                      {(agentsPanelCaisse.assignmentsDetails || []).length} agent{(agentsPanelCaisse.assignmentsDetails || []).length > 1 ? 's' : ''} assigné{(agentsPanelCaisse.assignmentsDetails || []).length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button onClick={() => setAgentsPanelCaisse(null)} className="p-1.5 rounded-lg hover:bg-surface-elevated text-content-muted hover:text-content-primary transition-colors">
                  <X size={16} />
                </button>
              </div>
              {/* Search */}
              {(agentsPanelCaisse.assignmentsDetails || []).length > 4 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher un agent..."
                    value={agentsSearch}
                    onChange={e => setAgentsSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>

            {/* Agent list - scrollable */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {(() => {
                const allDetails = agentsPanelCaisse.assignmentsDetails || [];
                const filtered = agentsSearch
                  ? allDetails.filter(a =>
                      `${a.prenom} ${a.nom}`.toLowerCase().includes(agentsSearch.toLowerCase())
                    )
                  : allDetails;

                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                      <User size={28} className="mb-2 opacity-20" />
                      <p className="text-xs">{agentsSearch ? 'Aucun résultat' : 'Aucun agent assigné'}</p>
                    </div>
                  );
                }

                return filtered.map(agent => {
                  const isOnline = agentsPanelCaisse.isOccupied && agentsPanelCaisse.occupiedBy === agent.userId;
                  return (
                    <div
                      key={agent.userId}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface/50 border border-edge/40 hover:bg-surface transition-colors group/item"
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                        isOnline
                          ? 'bg-status-success-bg text-status-success ring-2 ring-status-success/30'
                          : 'bg-accent/10 text-accent'
                      }`}>
                        {(agent.prenom?.[0] || agent.nom?.[0] || '?').toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-content-primary truncate">
                            {agent.prenom} {agent.nom}
                          </span>
                          {isOnline && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-status-success-bg text-status-success border border-status-success/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                              EN LIGNE
                            </span>
                          )}
                        </div>
                        {agent.assignedAt && (
                          <span className="text-[11px] text-content-muted flex items-center gap-1 mt-0.5">
                            <CalendarDays size={10} />
                            Assigné le {new Date(agent.assignedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {/* Unassign button */}
                      {!isOnline && (
                        <button
                          onClick={() => {
                            openConfirm({
                              title: 'Désassigner ?',
                              message: `Retirer ${agent.prenom} ${agent.nom} de "${agentsPanelCaisse.nom}" ?`,
                              variant: 'danger',
                              confirmText: 'Retirer',
                              onConfirm: () => {
                                unassignAgent(agentsPanelCaisse, agent.userId);
                                setAgentsPanelCaisse(null);
                              },
                            });
                          }}
                          className="shrink-0 p-2 rounded-lg text-content-muted hover:text-status-danger hover:bg-status-danger-bg opacity-0 group-hover/item:opacity-100 transition-all"
                          title="Désassigner"
                        >
                          <UserMinus size={14} />
                        </button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 p-4 border-t border-edge/60 bg-surface/30">
              <Button
                size="sm"
                className="w-full bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary"
                onClick={() => {
                  handleOpenAssign(agentsPanelCaisse);
                  setAgentsPanelCaisse(null);
                }}
              >
                <UserPlus size={14} className="mr-1.5" />
                Gérer les assignations
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || "Confirmation"}
        message={confirmState.message || ""}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
