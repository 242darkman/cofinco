import React, { useState } from 'react';
import { TabGroup, ConfirmDialog, PageHeader } from '../ui';
import { Users, Calendar, UserPlus, AlertTriangle, Gift, GraduationCap, ClipboardCheck, Building2, FileText } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';

// Hooks
import { useEmployes } from '../../hooks/hr/useEmployes';
import { useConges } from '../../hooks/hr/useConges';
import { useFormations } from '../../hooks/hr/useFormations';
import { useAvantages } from '../../hooks/hr/useAvantages';
import { useSanctions } from '../../hooks/hr/useSanctions';
import { useCandidatures } from '../../hooks/hr/useCandidatures';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

// Components
import EmployesList from './EmployesList';
import EmployeeForm from './EmployeeForm';
import PresenceTracker from './PresenceTracker';
import CongesManager from './CongesManager';
import FormationsManager from './FormationsManager';
import SanctionsManager from './SanctionsManager';
import AvantagesManager from './AvantagesManager';
import RecrutementManager from './RecrutementManager';
import OrganigrammeView from './OrganigrammeView';
import PaieManager from './PaieManager';

const TABS = [
  { key: 'list', label: 'Liste', icon: Users },
  { key: 'presence', label: 'Présence', icon: ClipboardCheck },
  { key: 'conges', label: 'Congés', icon: Calendar },
  { key: 'formations', label: 'Formations', icon: GraduationCap },
  { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle },
  { key: 'avantages', label: 'Avantages', icon: Gift },
  { key: 'paie', label: 'Paie & Docs', icon: FileText },
  { key: 'recrutement', label: 'Recrutement', icon: UserPlus },
  { key: 'organigramme', label: 'Organigramme', icon: Building2 }
];

type TabKey = typeof TABS[number]['key'];

export default function RessourcesHumaines() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateEmployes = hasPermission('rh', 'create') || hasPermission('employes', 'create');

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEmploye, setEditingEmploye] = useState<any>(null);

  // Hooks
  const {
    employes,
    loading,
    getStats,
    filterEmployes,
    createEmploye,
    updateEmploye,
    deleteEmploye,
    getStatutColor
  } = useEmployes();

  const {
    demandesConges,
    approveConge,
    rejectConge,
    createConge,
    getStats: getCongesStats
  } = useConges();

  const {
    formations,
    selectedParticipants,
    toggleParticipant,
    createFormation,
    fetchParticipants
  } = useFormations();

  const {
    avantagesList,
    selectedEmployes,
    toggleEmployeSelection,
    applyAvantageToSelected
  } = useAvantages();

  const {
    sanctions,
    loading: sanctionsLoading,
    createSanction
  } = useSanctions();

  const {
    candidats,
    loading: candidatsLoading,
    createCandidature,
    updateStatut: updateCandidatureStatut
  } = useCandidatures();

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Handlers
  const handleEdit = (employe: any) => {
    setEditingEmploye(employe);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    openConfirm({
      title: 'Confirmer la suppression',
      message: 'Êtes-vous sûr de vouloir supprimer cet employé ? Cette action est irréversible.',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        await deleteEmploye(id);
      }
    });
  };

  const handleSave = async (data: any) => {
    if (editingEmploye) {
      return await updateEmploye(editingEmploye.id, data);
    } else {
      return await createEmploye(data);
    }
  };

  const handleCreateSanction = async (data: any) => {
    return await createSanction(data);
  };

  const handleCreateCandidat = async (data: any) => {
    return await createCandidature(data);
  };

  const handleUpdateCandidatStatus = async (id: number, statut: string) => {
    return await updateCandidatureStatut(id, statut);
  };

  const statistics = getStats();
  const filteredEmployes = filterEmployes(searchTerm);

  // Render tab content
  const renderContent = () => {
    if (loading && activeTab === 'list') {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      );
    }

    switch (activeTab) {
      case 'list':
        return (
          <EmployesList
            employes={filteredEmployes}
            loading={loading}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onEdit={handleEdit}
            onDelete={handleDelete}
            getStatutColor={getStatutColor}
          />
        );

      case 'presence':
        return <PresenceTracker employes={employes} />;

      case 'conges':
        return (
          <CongesManager
            demandes={demandesConges}
            onApprove={approveConge}
            onReject={rejectConge}
            onCreate={createConge}
            stats={getCongesStats()}
          />
        );

      case 'formations':
        return (
          <FormationsManager
            formations={formations}
            employes={employes}
            selectedParticipants={selectedParticipants}
            onToggleParticipant={toggleParticipant}
            onCreate={createFormation}
            onFetchParticipants={fetchParticipants}
          />
        );

      case 'sanctions':
        return (
          <SanctionsManager
            sanctions={sanctions}
            onCreate={handleCreateSanction}
          />
        );

      case 'avantages':
        return (
          <AvantagesManager
            avantages={avantagesList}
            employes={employes}
            selectedEmployes={selectedEmployes}
            onToggleEmploye={toggleEmployeSelection}
            onApplyToSelected={applyAvantageToSelected}
          />
        );

      case 'paie':
        return <PaieManager />;

      case 'recrutement':
        return (
          <RecrutementManager
            candidats={candidats}
            onCreate={handleCreateCandidat}
            onUpdateStatus={handleUpdateCandidatStatus}
          />
        );

      case 'organigramme':
        return <OrganigrammeView employes={employes} />;

      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Ressources Humaines"
        description={`${employes.length} employés • ${statistics.actifs} actifs`}
        actions={
          activeTab === 'list' && canCreateEmployes && (
            <button
              onClick={() => {
                setEditingEmploye(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg font-semibold shadow-lg transition flex items-center gap-2"
            >
              <Users size={18} />
              <span>Nouvel Employé</span>
            </button>
          )
        }
      />

      <TabGroup
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
      />

      {renderContent()}

      <EmployeeForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingEmploye(null);
        }}
        onSave={handleSave}
        editingEmploye={editingEmploye}
        initialData={editingEmploye || {
          matricule: '',
          nom: '',
          prenom: '',
          sexe: 'M',
          email: '',
          phone: '',
          dateNaissance: '',
          dateEmbauche: new Date().toISOString().split('T')[0],
          adresse: '',
          ville: '',
          departement: '',
          poste: '',
          typeContrat: 'CDI',
          salaireBase: '',
          numeroCnss: ''
        }}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || "Confirmer l'action"}
        message={confirmState.message || "Êtes-vous sûr ?"}
        variant={confirmState.variant || 'danger'}
        confirmText={confirmState.confirmText || 'Confirmer'}
      />
    </div>
  );
}
