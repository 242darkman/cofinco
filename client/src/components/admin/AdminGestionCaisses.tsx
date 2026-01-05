import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Monitor, Lock, AlertCircle, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, FormField, SelectField, Badge, Modal, ConfirmDialog, Pagination } from '../ui';
import { authService } from '../../lib/auth';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { api } from '../../lib/api';

// Types
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
  const isAdmin = user?.role === 'admin' || user?.role === 'admin_generale' || user?.role === 'Administrateur';
  const queryClient = useQueryClient();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Agencies per page for admin view
  
  // Fetch Agences for Admin
  const { data: agences = [] } = useQuery<any[]>({
    queryKey: ['agences'],
    queryFn: async () => {
       const res = await api.get('/agences');
       return (res.data as any[]) || [];
    },
    enabled: isAdmin
  });
  
  // Form State
  const [formData, setFormData] = useState({
    nom: '',
    type: 'Physique',
    agenceId: user?.agenceId || '', 
  }); 

  // Reset form when opening modal for admin
  React.useEffect(() => {
     if (isModalOpen && isAdmin && !formData.agenceId) {
         // Optionally set first agency or keep empty?
         // Let's keep empty to force selection
     }
  }, [isModalOpen, isAdmin]);

  // Assignment State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCaisseForAssign, setSelectedCaisseForAssign] = useState<Caisse | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Fetch Employees for Assignment (filtered by agency)
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', user?.agence],
    queryFn: async () => {
        // Use users endpoint or employees endpoint. Users seems safer for auth ID matching.
        // Assuming we have a way to get users by agency. 
        // Failing that, we fetch all and filter.
        const res = await api.get<any[]>('/users'); 
        return (res.data || []).filter((u: any) => u.agence === user?.agence && u.role !== 'admin' && u.role !== 'Administrateur');
    },
    enabled: isAssignModalOpen
  });

  // Assign Mutation
  const assignMutation = useMutation({
      mutationFn: async ({ caisseId, userIds }: { caisseId: string, userIds: string[] }) => {
          const res = await api.post(`/caisses/${caisseId}/assign`, { userIds });
          if (res.error) throw new Error(res.error);
          return res.data;
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
      // Pre-select existing assignments directly from caisse object (enriched by backend)
      // We need to extend the Caisse interface locally to include assignments or cast it
      const existing = (caisse as any).assignments || [];
      setSelectedUserIds(existing);
      setIsAssignModalOpen(true);
  };

  const toggleUserSelection = (userId: string) => {
      setSelectedUserIds(prev => 
          prev.includes(userId) 
            ? prev.filter(id => id !== userId)
            : [...prev, userId]
      );
  };


  // Fetch Caisses
  // Fetch Caisses (Global for admin, Scoped for others)
  const { data: caisses = [], isLoading } = useQuery<Caisse[]>({
    queryKey: ['caisses', isAdmin ? 'all' : user?.agenceId],
    queryFn: async () => {
       const endpoint = isAdmin ? '/caisses' : `/agences/${user?.agenceId}/caisses`;
       const res = await api.get<Caisse[]>(endpoint);
       return res.data || [];
    },
    enabled: !!user?.agenceId || isAdmin
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/caisses', data);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caisses'] });
      setIsModalOpen(false);
      setFormData({ nom: '', type: 'Physique', agenceId: user?.agenceId || '' });
      toast.success('Caisse créée avec succès');
    },
    onError: (err: any) => {
      toast.error(err.error || "Erreur lors de la création");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
        const res = await api.delete(`/caisses/${id}`);
        if (res.error) throw new Error(res.error);
        return res.data;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['caisses'] });
        toast.success('Caisse supprimée');
    },
    onError: (err: any) => {
        toast.error(err.message || "Impossible de supprimer (Caisse utilisée ?)");
    }
  });

  const handleDelete = (id: string, nom: string) => {
      openConfirm({
          title: "Supprimer la caisse",
          message: `Êtes-vous sûr de vouloir supprimer la caisse "${nom}" ? Cette action est irréversible et impossible si la caisse a de l'historique.`,
          variant: 'danger',
          confirmText: "Supprimer",
          onConfirm: () => deleteMutation.mutate(id)
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredCaisses = caisses.filter(c => 
    c.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCaisseCard = (caisse: Caisse) => (
      <Card key={caisse.id} padding="md" className="flex flex-col gap-3 hover:border-primary/50 transition-colors">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              caisse.type === 'Coffre-Fort' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
            }`}>
              {caisse.type === 'Coffre-Fort' ? <Lock className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-lg">{caisse.nom}</h3>
              <p className="text-xs text-muted-foreground">{caisse.type}</p>
            </div>
          </div>
          <Badge value={caisse.statut} variant={caisse.statut === 'Ouverte' ? 'success' : 'neutral'} />
        </div>

        <div className="mt-2 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Solde Actuel</span>
            <span className="font-mono font-medium">{Number(caisse.solde).toLocaleString()} FCFA</span>
          </div>
            <div className="flex flex-wrap gap-1 mt-1">
               {(caisse as any).assignments?.length > 0 ? (
                   <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                       {(caisse as any).assignments.length} agent(s) assigné(s)
                   </span>
               ) : (
                   <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                       Accès libre / Non assigné
                   </span>
               )}
            </div>

           {caisse.isOccupied && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
               <AlertCircle className="w-3 h-3" />
               Session en cours (Par: {caisse.occupiedBy})
            </div>
          )}
        </div>

        <div className="pt-4 mt-auto border-t border-border flex items-center justify-between gap-3">
             <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handleDelete(caisse.id, caisse.nom)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 px-2 h-8"
                title="Supprimer définitivement"
             >
                <Trash2 size={15} className="mr-1.5" />
                <span className="text-xs font-medium">Supprimer</span>
             </Button>

            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleOpenAssign(caisse)}
                className="text-xs h-8 ml-auto"
            >
                Assigner
            </Button>
        </div>
      </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <FormField 
            name="search"
            label=""
            placeholder="Rechercher une caisse..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={Search}
            containerClassName="mb-0"
          />
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-primary hover:bg-primary/90 text-white gap-2">
          <Plus className="w-4 h-4" />
          Nouvelle Caisse
        </Button>
      </div>

      {/* Grid Display */}
      {isAdmin ? (
         // Grouped View for Admin with Pagination
         <div className="space-y-8">
            {(() => {
                // Group by Agency
                const grouped = filteredCaisses.reduce((acc, caisse) => {
                    const agenceName = agences.find(a => a.id === caisse.agenceId)?.nom || 'Agence Inconnue';
                    if (!acc[agenceName]) acc[agenceName] = [];
                    acc[agenceName].push(caisse);
                    return acc;
                }, {} as Record<string, Caisse[]>);

                const sortedAgencies = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
                
                // Pagination Logic
                const totalItems = sortedAgencies.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const visibleAgencies = sortedAgencies.slice(startIndex, startIndex + itemsPerPage);

                return (
                    <>
                        {visibleAgencies.map(([agenceName, agenceCaisses]) => (
                            <div key={agenceName} className="space-y-3">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    {agenceName} ({agenceCaisses.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {agenceCaisses.map(caisse => renderCaisseCard(caisse))}
                                </div>
                            </div>
                        ))}
                        
                        {totalItems > itemsPerPage && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                canGoNext={currentPage < totalPages}
                                canGoPrevious={currentPage > 1}
                                totalItems={totalItems}
                                itemsPerPage={itemsPerPage}
                                className="mt-8"
                            />
                        )}
                        
                        {totalItems === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                Aucune caisse trouvée.
                            </div>
                        )}
                    </>
                );
            })()}
         </div>
      ) : (
         // Standard View
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCaisses.map((caisse) => renderCaisseCard(caisse))}
         </div>
      )}


      {/* Modal Creation */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nouvelle Caisse">
        <div className="p-6 pt-2 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField 
              label="Nom de la caisse"
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
                  options={agences.map(a => ({ value: a.id, label: a.nom }))}
                  value={formData.agenceId}
                  onChange={e => setFormData({...formData, agenceId: e.target.value})}
                />
            )}
            
            <SelectField
              label="Type"
              name="type"
              // Standard SelectField uses options prop or children? 
              // Checking usage: usually options={[ {value, label} ]}
              options={[
                { value: 'Physique', label: 'Physique (Guichet)' },
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

      {/* Assignment Modal */}
      <Modal 
        isOpen={isAssignModalOpen} 
        onClose={() => setIsAssignModalOpen(false)} 
        title={`Assigner - ${selectedCaisseForAssign?.nom}`}
      >
        <div className="p-6 pt-2 space-y-4">
            <p className="text-sm text-muted-foreground">
                Sélectionnez les agents autorisés à ouvrir cette caisse.
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={selectedUserIds.includes(emp.id)}
                            onChange={() => toggleUserSelection(emp.id)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{emp.nom} {emp.prenom}</span>
                            <span className="text-xs text-gray-500">@{emp.username} · {emp.role}</span>
                        </div>
                    </label>
                ))}
                {employees.length === 0 && (
                    <p className="text-center text-sm text-gray-500 py-4">Aucun agent trouvé dans cette agence.</p>
                )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setIsAssignModalOpen(false)}>Annuler</Button>
              <Button 
                onClick={() => assignMutation.mutate({ 
                    caisseId: selectedCaisseForAssign!.id, 
                    userIds: selectedUserIds 
                })} 
                isLoading={assignMutation.isPending}
              >
                Sauvegarder
              </Button>
            </div>
        </div>
      </Modal>

      {/* Confirmation Dialog */}
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
