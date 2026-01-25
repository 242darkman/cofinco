import React, { useState } from 'react';
import { Plus, Briefcase, Eye, Calendar, Mail, Phone } from 'lucide-react';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { StatutCandidature, STATUT_CANDIDATURE_LABELS } from '@shared/enum/status-constants';

interface Candidat {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  posteVise: string;
  experience?: string;
  datePostulation: string;
  statut: string; // EN values: 'PENDING' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED'
  cv?: string;
}

interface RecrutementManagerProps {
  candidats: Candidat[];
  onCreate: (data: {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    posteVise: string;
    experience?: string;
  }) => Promise<boolean>;
  onUpdateStatus: (id: number, statut: string) => Promise<boolean>;
}

export default function RecrutementManager({
  candidats,
  onCreate,
  onUpdateStatus
}: RecrutementManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateCandidats = hasPermission('rh', 'create');
  const canEditCandidats = hasPermission('rh', 'edit');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    posteVise: '',
    experience: '',
    datePostulation: new Date().toISOString().split('T')[0]
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(candidats.length / ITEMS_PER_PAGE);
  const paginatedCandidats = candidats.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({
        nom: '',
        prenom: '',
        email: '',
        telephone: '',
        posteVise: '',
        experience: '',
        datePostulation: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);
    }
  };

  const getStatutVariant = (statut: Candidat['statut']) => {
    switch (statut) {
      case StatutCandidature.ACCEPTED: return 'success';
      case StatutCandidature.REJECTED: return 'danger';
      case StatutCandidature.INTERVIEW: return 'warning';
      default: return 'info';
    }
  };

  const stats = {
    total: candidats.length,
    enAttente: candidats.filter(c => c.statut === StatutCandidature.PENDING).length,
    entretien: candidats.filter(c => c.statut === StatutCandidature.INTERVIEW).length,
    acceptes: candidats.filter(c => c.statut === StatutCandidature.ACCEPTED).length
  };

  const columns = [
    {
      label: 'Candidat',
      key: 'nom',
      primary: true,
      format: (val: string, item: Candidat) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {item.nom.charAt(0)}{item.prenom.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate">{item.nom} {item.prenom}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Briefcase size={10} />
              {item.posteVise}
            </div>
          </div>
        </div>
      )
    },
    {
      label: 'Contact',
      key: 'email',
      hideOnMobile: true,
      format: (val: string, item: Candidat) => (
        <div className="text-xs text-slate-300 space-y-0.5">
          <div className="flex items-center gap-1"><Mail size={10} />{val}</div>
          {item.telephone && <div className="flex items-center gap-1"><Phone size={10} />{item.telephone}</div>}
        </div>
      )
    },
    {
      label: 'Expérience',
      key: 'experience',
      hideOnMobile: true,
      format: (val: string) => (
        <span className="text-xs text-slate-300">{val || '-'}</span>
      )
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string, item: Candidat) => (
        <div className="flex items-center gap-2">
          <Badge variant={getStatutVariant(item.statut)} value={val} size="sm" />
          {canEditCandidats && (
            <select
              value={item.statut}
              onChange={(e) => onUpdateStatus(item.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={StatutCandidature.PENDING}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.PENDING]}</option>
              <option value={StatutCandidature.INTERVIEW}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.INTERVIEW]}</option>
              <option value={StatutCandidature.ACCEPTED}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.ACCEPTED]}</option>
              <option value={StatutCandidature.REJECTED}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.REJECTED]}</option>
            </select>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Stats Cards - Compact */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card className="p-3 bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 transition-colors">
          <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">Total</div>
          <div className="text-xl font-bold text-white leading-none">{stats.total}</div>
        </Card>
        <Card className="p-3 bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 transition-colors">
          <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">En Attente</div>
          <div className="text-xl font-bold text-blue-400 leading-none">{stats.enAttente}</div>
        </Card>
        <Card className="p-3 bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 transition-colors">
          <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">Entretien</div>
          <div className="text-xl font-bold text-yellow-400 leading-none">{stats.entretien}</div>
        </Card>
        <Card className="p-3 bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 transition-colors">
          <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">Acceptés</div>
          <div className="text-xl font-bold text-green-400 leading-none">{stats.acceptes}</div>
        </Card>
      </div>

      {/* Main Content - Flex Grow */}
      <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
        {/* Compact Header Toolbar */}
        <div className="shrink-0 p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
           <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Briefcase size={14} className="text-purple-400" />
              Candidatures
           </h3>
           {canCreateCandidats && (
             <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="h-7 text-xs px-2">
               <Plus size={14} />
               <span className="hidden sm:inline">Nouvelle</span>
             </Button>
           )}
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-hidden">
          <ResponsiveTable
            data={paginatedCandidats}
            columns={columns}
            mobileBreakpoint="md"
            emptyMessage="Aucune candidature enregistrée."
            maxHeight="100%"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
            density="compact"
            className="border-0 rounded-none h-full"
            headerClassName="bg-slate-900 sticky top-0"
          />
        </div>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Candidature"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nom"
              name="nom"
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
            />

            <FormField
              label="Prénom"
              name="prenom"
              type="text"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              required
            />

            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />

            <FormField
              label="Téléphone"
              name="telephone"
              type="tel"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              required
            />

            <FormField
              label="Poste Visé"
              name="posteVise"
              type="text"
              value={formData.posteVise}
              onChange={(e) => setFormData({ ...formData, posteVise: e.target.value })}
              required
            />

            <FormField
              label="Date de Postulation"
              name="datePostulation"
              type="date"
              value={formData.datePostulation}
              onChange={(e) => setFormData({ ...formData, datePostulation: e.target.value })}
              required
            />
          </div>

          <TextareaField
            label="Expérience"
            name="experience"
            value={formData.experience}
            onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
            rows={4}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
