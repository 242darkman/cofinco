import React, { useState } from 'react';
import { Plus, CheckCircle, XCircle, Calendar, Clock, Lock } from 'lucide-react';
import { DemandeConge } from '../../hooks/hr/useConges';
import { Card, Button, Modal, FormField, SelectField, Badge, StatCard, ResponsiveTable } from '../ui';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePermissions } from '../auth/ProtectedFeature';

interface CongesManagerProps {
  demandes: DemandeConge[];
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
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
}

export default function CongesManager({
  demandes,
  onApprove,
  onReject,
  onCreate,
  stats
}: CongesManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateConges = hasPermission('rh', 'edit') || hasPermission('conges', 'create');
  const canApproveConges = hasPermission('rh', 'approve') || hasPermission('conges', 'approve');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeId: '',
    employeNom: '',
    type: 'Congé Annuel',
    dateDebut: '',
    dateFin: '',
    motif: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(demandes.length / ITEMS_PER_PAGE);
  const paginatedDemandes = demandes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({ 
        employeId: '',
        employeNom: '',
        type: 'Congé Annuel', 
        dateDebut: '', 
        dateFin: '',
        motif: ''
      });
      setShowForm(false);
    }
  };

  const columns = [
    {
      label: 'Employé',
      key: 'employeNom',
      primary: true,
      format: (val: string, item: DemandeConge) => (
          <div className="flex flex-col">
              <span className="font-semibold text-white">{val}</span>
              <span className="text-[10px] text-slate-400">{item.type}</span>
          </div>
      )
    },
    {
        label: 'Période',
        key: 'dateDebut',
        format: (_: string, item: DemandeConge) => (
            <div className="flex items-center gap-1 text-xs text-slate-300">
                <Calendar size={12} className="text-slate-500" />
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
             const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
             return <span className="text-xs font-mono">{diff}j</span>;
        }
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string) => {
         const variant = val === 'Approuvé' ? 'success' : val === 'Refusé' ? 'danger' : 'warning';
         return <Badge variant={variant} value={val} size="sm" />;
      }
    },
    {
      label: 'Actions',
      key: 'actions',
      format: (_: any, item: DemandeConge) => {
        const { user } = useUserProfile();
        const canApprove = ['Administrateur', 'rh', "Chef d'Agence", 'direction', 'pdg', 'dg'].includes(user?.role || '');
        
        if (!canApprove || item.statut !== 'En attente') return null;

        return (
          <div className="flex gap-2 justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(item.id); }}
              className="p-1.5 hover:bg-green-500/20 text-green-400 rounded-lg transition"
              title="Approuver"
            >
              <CheckCircle size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject(item.id); }}
              className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition"
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
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
            title="En Cours"
            value={stats.enCours}
            icon={Clock}
            color="primary"
        />
        <StatCard
            title="En Attente"
            value={stats.enAttente}
            icon={Lock}
            color="warning"
        />
        <StatCard
            title="Approuvés"
            value={stats.approuves}
            icon={CheckCircle}
            color="success"
        />
        <StatCard
            title="Refusés"
            value={stats.refuses}
            icon={XCircle}
            color="danger"
        />
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-base sm:text-lg font-bold text-white">Demandes de Congés</h3>
        {canCreateConges && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle Demande</span>
          </Button>
        )}
      </div>

      <Card padding="none" className="bg-slate-900/50 overflow-hidden border-slate-800">
          <ResponsiveTable
            data={paginatedDemandes}
            columns={columns}
            mobileBreakpoint="md"
            emptyMessage="Aucune demande de congé."
            maxHeight="500px"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
          />
      </Card>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Demande de Congé"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Employé (ID)"
            name="employeId"
            type="text"
            value={formData.employeId}
            onChange={(e) => setFormData({ ...formData, employeId: e.target.value })}
            required
          />

          <FormField
            label="Nom Employé"
            name="employeNom"
            type="text"
            value={formData.employeNom}
            onChange={(e) => setFormData({ ...formData, employeNom: e.target.value })}
            required
          />

          <SelectField
            label="Type de Congé"
            name="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            options={[
              { value: 'Congé Annuel', label: 'Congé Annuel' },
              { value: 'Congé Maladie', label: 'Congé Maladie' },
              { value: 'Congé Sans Solde', label: 'Congé Sans Solde' },
              { value: 'Congé Maternité', label: 'Congé Maternité' }
            ]}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Date de Début"
              name="dateDebut"
              type="date"
              value={formData.dateDebut}
              onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
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

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Créer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
