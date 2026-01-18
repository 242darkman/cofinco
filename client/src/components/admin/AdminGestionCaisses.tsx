import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Monitor, Lock, MoreVertical, User, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, FormField, SelectField, Modal, ConfirmDialog } from '../ui';
import { authService } from '../../lib/auth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { api, caisseApi } from '../../lib/api-client';
import { ForceCloseModal } from './ForceCloseModal';
import { isAdminRole, normalizeRole } from '@shared/types/roles';

interface Caisse {
  id: string;
  nom: string;
  type: 'Physique' | 'Coffre-Fort' | 'Virtuelle';
  statut: 'Ouverte' | 'Fermée';
  solde: string;
  isOccupied?: boolean;
  occupiedBy?: string;
  agenceId: string;
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
  const itemsPerPage = 20; // Augmenté pour moins de pagination
  
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
    type: 'Physique',
    agenceId: user?.agenceId || '', 
  }); 

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCaisseForAssign, setSelectedCaisseForAssign] = useState<Caisse | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  const [isForceCloseModalOpen, setIsForceCloseModalOpen] = useState(false);
  const [selectedCaisseForClose, setSelectedCaisseForClose] = useState<Caisse | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', user?.agence],
    queryFn: async () => {
        const res = await api.get<any[]>('/users'); 
        return (res || []).filter((u: any) => {
          const normalizedRole = normalizeRole(u.role);
          return u.agence === user?.agence && !isAdminRole(normalizedRole);
        });
    },
    enabled: isAssignModalOpen
  });

  const assignMutation = useMutation({
      mutationFn: async ({ caisseId, userIds }: { caisseId: string, userIds: string[] }) => {
          return await api.post(`/caisses/${caisseId}/assign`, { userIds });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['caisses'] });
          setIsAssignModalOpen(false);
          toast.success('Assignations mises à jour');
          setSelectedCaisseForAssign(null);
          setSelectedUserIds([]);
      },
      onError: () => toast.error("Erreur lors de l'assignation")
  });

  const handleOpenAssign = (caisse: Caisse) => {
      setSelectedCaisseForAssign(caisse);
      const existing = (caisse as any).assignments || [];
      setSelectedUserIds(existing);
      setIsAssignModalOpen(true);
  };

  const toggleUserSelection = (userId: string) => {
      setSelectedUserIds(prev => 
          prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      );
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

  // WebSocket removed as per user request to avoid unnecessary connection errors

  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/caisses', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caisses'] });
      setIsModalOpen(false);
      setFormData({ nom: '', type: 'Physique', agenceId: user?.agenceId || '' });
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
      if (caisse.statut === 'Ouverte') {
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
    c.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredCaisses.length / itemsPerPage);
  const paginatedCaisses = filteredCaisses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800/40 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
          />
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)} 
          size="sm"
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <Plus className="w-4 h-4 mr-1" />
          Nouvelle
        </Button>
      </div>

      {/* Compact Table View */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Caisse</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Agence</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Statut</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Solde</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Agent</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {paginatedCaisses.map((caisse) => (
                <tr key={caisse.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        caisse.type === 'Coffre-Fort' 
                          ? 'bg-amber-500/10' 
                          : 'bg-blue-500/10'
                      }`}>
                        {caisse.type === 'Coffre-Fort' ? 
                          <Lock className="w-4 h-4 text-amber-400" /> : 
                          <Monitor className="w-4 h-4 text-blue-400" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{caisse.nom}</div>
                        <div className="text-xs text-slate-500">{caisse.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50 min-w-[100px] max-w-[140px] truncate">
                      {agences.find(a => a.id === caisse.agenceId)?.nom || 'N/A'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        caisse.isOccupied 
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50 animate-pulse' 
                          : 'bg-slate-500'
                      }`} />
                      <span className={`text-xs font-medium ${
                        caisse.isOccupied ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {caisse.isOccupied ? 'En ligne' : 'Fermée'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="font-mono font-semibold text-white">
                      {Number(caisse.solde).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500">FCFA</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {caisse.isOccupied ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-medium border border-emerald-500/30">
                          {(caisse.occupiedBy || 'A')[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-300 truncate max-w-[120px]">{caisse.occupiedBy}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <span className="text-xs text-slate-500">
                          {(caisse as any).assignments?.length > 0 
                            ? `${(caisse as any).assignments.length} agent(s)`
                            : 'Non assignée'
                          }
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === caisse.id ? null : caisse.id);
                        }}
                        className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                      </button>

                      {openMenuId === caisse.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="fixed z-20 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
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
                                className="w-full px-3 py-2 text-left text-xs text-orange-400 hover:bg-slate-700/50 flex items-center gap-2"
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
                              className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 flex items-center gap-2"
                            >
                              <User className="w-3.5 h-3.5" />
                              Assigner
                            </button>
                            <button
                              onClick={() => handleDelete(caisse)}
                              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-slate-700/50 flex items-center gap-2 border-t border-slate-700"
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

        {/* Compact Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 bg-slate-900/30">
            <div className="text-xs text-slate-400">
              {filteredCaisses.length} caisse(s) · Page {currentPage}/{totalPages}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-white"
              >
                Préc.
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-white"
              >
                Suiv.
              </button>
            </div>
          </div>
        )}

        {filteredCaisses.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            Aucune caisse trouvée
          </div>
        )}
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
                <SelectField
                  label="Agence"
                  name="agenceId"
                  required
                  options={agences.filter((a: any) => a.statut === 'Actif').map((a: any) => ({ value: a.id, label: a.nom }))}
                  value={formData.agenceId}
                  onChange={e => setFormData({...formData, agenceId: e.target.value})}
                />
            )}
            <SelectField
              label="Type"
              name="type"
              options={[
                { value: 'Physique', label: 'Physique' },
                { value: 'Coffre-Fort', label: 'Coffre-Fort' },
                { value: 'Virtuelle', label: 'Virtuelle' }
              ]}
              value={formData.type}
              onChange={e => setFormData({...formData, type: e.target.value})}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" isLoading={createMutation.isPending}>Créer</Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Assigner - ${selectedCaisseForAssign?.nom}`}>
        <div className="p-6 pt-2 space-y-4">
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/30 rounded cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={selectedUserIds.includes(emp.id)}
                            onChange={() => toggleUserSelection(emp.id)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <div>
                            <div className="text-sm font-medium">{emp.nom} {emp.prenom}</div>
                            <div className="text-xs text-gray-500">@{emp.username}</div>
                        </div>
                    </label>
                ))}
                {employees.length === 0 && (
                    <p className="text-center text-sm text-gray-500 py-4">Aucun agent</p>
                )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setIsAssignModalOpen(false)}>Annuler</Button>
              <Button 
                onClick={() => assignMutation.mutate({ caisseId: selectedCaisseForAssign!.id, userIds: selectedUserIds })} 
                isLoading={assignMutation.isPending}
              >
                Sauvegarder
              </Button>
            </div>
        </div>
      </Modal>

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
