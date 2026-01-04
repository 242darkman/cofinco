import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Monitor, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, FormField, SelectField, Badge, Modal } from '../ui';
import { authService } from '../../lib/auth';
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
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    nom: '',
    type: 'Physique',
    agenceId: user?.agenceId || '', 
  });

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
  const { data: caisses = [], isLoading } = useQuery<Caisse[]>({
    queryKey: ['caisses', user?.agenceId],
    queryFn: async () => {
       const res = await api.get<Caisse[]>(`/agences/${user?.agenceId}/caisses`);
       return res.data || [];
    },
    enabled: !!user?.agenceId
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/caisses', {
        ...data,
        agenceId: user?.agenceId
      });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredCaisses = caisses.filter(c => 
    c.nom.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCaisses.map((caisse) => (
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
                {/* Assignment Info */}
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

            <div className="pt-2 mt-auto border-t flex justify-end">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleOpenAssign(caisse)}
                    className="text-xs h-8"
                >
                    Assigner
                </Button>
            </div>
          </Card>
        ))}
      </div>

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
    </div>
  );
}
