import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { TabGroup, ConfirmDialog, PageHeader, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import { Users, Calendar, UserPlus, AlertTriangle, Gift, GraduationCap, ClipboardCheck, Building2, FileText, Upload, BarChart3, Star, Briefcase, FileBarChart, FolderOpen, Clock, Crown } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { useAppNavigation } from '../../hooks/useAppNavigation';

// Hooks
import { useEmployes, Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
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
import ImportEmployeesModal from './ImportEmployeesModal';
import HrAnalyticsDashboard from './HrAnalyticsDashboard';
import EvaluationsManager from './EvaluationsManager';
import ProspectionPrimeConfig from '../admin/ProspectionPrimeConfig';
import PositionManager from './PositionManager';
import HrReportsTab from './HrReportsTab';
import MesDocumentsTab from './MesDocumentsTab';
import TempsProjetManager from './TempsProjetManager';
import DirectionGeneralePanel from './DirectionGeneralePanel';

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { key: 'list', label: 'Liste', icon: Users },
  { key: 'presence', label: 'Présence', icon: ClipboardCheck },
  { key: 'conges', label: 'Congés', icon: Calendar },
  { key: 'formations', label: 'Formations', icon: GraduationCap },
  { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle },
  { key: 'avantages', label: 'Avantages & Primes', icon: Gift },
  { key: 'paie', label: 'Paie & Docs', icon: FileText },
  { key: 'evaluations', label: 'Évaluations', icon: Star },
  { key: 'postes', label: 'Postes', icon: Briefcase },
  { key: 'recrutement', label: 'Recrutement', icon: UserPlus },
  { key: 'rapports', label: 'Rapports', icon: FileBarChart },
  { key: 'temps-projet', label: 'Temps Projet', icon: Clock },
  { key: 'mes-documents', label: 'Documents', icon: FolderOpen },
  { key: 'organigramme', label: 'Organigramme', icon: Building2 },
  { key: 'direction-generale', label: 'Direction', icon: Crown }
];

type TabKey = typeof TABS[number]['key'];

export default function RessourcesHumaines() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateEmployes = hasPermission('rh', 'create') || hasPermission('employes', 'create');
  const canManageDirection = hasPermission('rh', 'manage') || hasPermission('admin', 'manage');

  // Filter tabs based on permissions
  const visibleTabs = useMemo(() =>
    TABS.filter(t => t.key !== 'direction-generale' || canManageDirection),
    [canManageDirection]
  );

  // Tab dérivé de l'URL (sous-module) — refresh-safe et deep-linkable
  const { currentSubModule, navigateToModule } = useAppNavigation();
  const VALID_TABS = visibleTabs.map(t => t.key);
  const activeTab = useMemo<TabKey>(() => {
    if (currentSubModule && VALID_TABS.includes(currentSubModule)) {
      return currentSubModule as TabKey;
    }
    return 'list'; // default quand on arrive sur /ressources-humaines sans sous-route
  }, [currentSubModule]);

  const setActiveTab = useCallback((tab: string) => {
    navigateToModule('rh', tab as TabKey);
  }, [navigateToModule]);

  // Redirect bare /ressources-humaines to /ressources-humaines/employes
  useEffect(() => {
    if (!currentSubModule || !VALID_TABS.includes(currentSubModule)) {
      navigateToModule('rh', 'list');
    }
  }, [currentSubModule]);

  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEmploye, setEditingEmploye] = useState<Employe | null>(null);

  // Hooks
  const {
    employes,
    loading,
    fetchEmployes,
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
    updateFormation,
    deleteFormation,
    fetchParticipants,
    evaluateParticipant
  } = useFormations();

  const {
    avantagesList,
    createAvantage,
    updateAvantage,
    deleteAvantage
  } = useAvantages();

  const {
    sanctions,
    loading: sanctionsLoading,
    createSanction,
    updateSanction,
    deleteSanction,
    updateSanctionStatus,
    uploadSanctionDocument,
    fetchSanctionDocuments
  } = useSanctions();

  const {
    candidats,
    loading: candidatsLoading,
    createCandidature,
    updateStatut: updateCandidatureStatut,
    updateCandidature,
    uploadCv,
    getCvUrl
  } = useCandidatures();

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Handlers
  const handleEdit = (employe: Employe) => {
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

  const handleSave = async (data: EmployeFormData) => {
    if (editingEmploye) {
      return await updateEmploye(editingEmploye.id, data);
    } else {
      return await createEmploye(data);
    }
  };

  const handleCreateSanction = async (data: {
    employeId: string;
    employeNom: string;
    type: string;
    motif: string;
    date: string;
    gravite: string;
  }) => {
    return await createSanction(data);
  };

  const handleCreateCandidat = async (data: {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    posteVise: string;
    experience?: string;
    formation?: string;
  }) => {
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <HrAnalyticsDashboard />;

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
            onRefresh={fetchEmployes}
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
            employes={employes}
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
            onUpdate={updateFormation}
            onDelete={deleteFormation}
            onFetchParticipants={fetchParticipants}
            onEvaluateParticipant={evaluateParticipant}
          />
        );

      case 'sanctions':
        return (
          <SanctionsManager
            sanctions={sanctions}
            onCreate={handleCreateSanction}
            onUpdateStatus={updateSanctionStatus}
            onUpdate={updateSanction}
            onDelete={deleteSanction}
            onUploadDocument={uploadSanctionDocument}
            onFetchDocuments={fetchSanctionDocuments}
          />
        );

      case 'avantages':
        return (
          <div className="space-y-6">
            <AvantagesManager
              avantages={avantagesList}
              employes={employes}
              onCreate={createAvantage}
              onUpdate={updateAvantage}
              onDelete={deleteAvantage}
            />
            <div className="border-t border-edge-subtle pt-4">
              <ProspectionPrimeConfig />
            </div>
          </div>
        );

      case 'paie':
        return <PaieManager />;

      case 'evaluations':
        return <EvaluationsManager />;

      case 'postes':
        return <PositionManager />;

      case 'recrutement':
        return (
          <RecrutementManager
            candidats={candidats}
            onCreate={handleCreateCandidat}
            onUpdateStatus={handleUpdateCandidatStatus}
            onUploadCv={uploadCv}
            onGetCvUrl={getCvUrl}
            onUpdateCandidature={updateCandidature}
          />
        );

      case 'rapports':
        return <HrReportsTab />;

      case 'temps-projet':
        return <TempsProjetManager />;

      case 'mes-documents':
        return <MesDocumentsTab />;

      case 'organigramme':
        return <OrganigrammeView employes={employes} />;

      case 'direction-generale':
        return <DirectionGeneralePanel />;

      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-full bg-surface-base overflow-x-hidden ${activeTab === 'organigramme' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {/* Header & Tabs Section - Fixed */}
      <div className="shrink-0 space-y-2 p-2 sm:p-4 pb-0 bg-surface-base border-b border-edge/50">
        <FeatureHeader
          featureKey="hr.employees"
          title={
            <>
              {FEATURE_DESCRIPTIONS['hr.employees'].title}
              <span className="ml-2 px-2 py-0.5 rounded-full bg-surface border border-edge text-content-muted text-[10px] font-medium tracking-wide">
                {employes.length} collab.
              </span>
            </>
          }
          subtitle={`${statistics.actifs} actifs • ${FEATURE_DESCRIPTIONS['hr.employees'].subtitle}`}
          helpText={FEATURE_DESCRIPTIONS['hr.employees'].helpText}
          icon={<Users size={24} />}
          actions={
            activeTab === 'list' && canCreateEmployes ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                  title="Importer des employés depuis un fichier CSV"
                >
                  <Upload size={14} />
                  <span className="hidden sm:inline">Import CSV</span>
                </button>
                <button
                  onClick={() => {
                    setEditingEmploye(null);
                    setShowForm(true);
                  }}
                  className="px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-white rounded-lg text-xs font-bold shadow-lg shadow-accent/20 transition flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <UserPlus size={14} />
                  <span>Nouvel Employé</span>
                </button>
              </div>
            ) : undefined
          }
        />

        <TabGroup
          tabs={visibleTabs}
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key as TabKey)}
          variant="underline"
          size="sm"
          className="mt-2"
          scrollable={false}
        />
      </div>

      {/* Main Content - Scrollable handled by children */}
      <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-4 flex flex-col">
         {renderContent()}
      </div>

      <EmployeeForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingEmploye(null);
        }}
        onSave={handleSave}
        editingEmploye={editingEmploye}
        allEmployes={employes}
        initialData={editingEmploye ? {
          matricule: editingEmploye.matricule || '',
          nom: editingEmploye.nom,
          prenom: editingEmploye.prenom,
          sexe: editingEmploye.sexe,
          email: editingEmploye.email || '',
          phone: editingEmploye.phone || '',
          dateNaissance: editingEmploye.dateNaissance || '',
          lieuNaissance: editingEmploye.lieuNaissance || '',
          lieuNaissanceLocalityId: editingEmploye.lieuNaissanceLocalityId || null,
          lieuNaissanceLocalityType: editingEmploye.lieuNaissanceLocalityType || null,
          nationaliteId: editingEmploye.nationaliteId || null,
          paysNaissanceId: editingEmploye.paysNaissanceId || null,
          dateEmbauche: editingEmploye.dateEmbauche,
          adresse: editingEmploye.adresse || '',
          ville: editingEmploye.ville || '',
          departement: editingEmploye.departement || '',
          poste: editingEmploye.poste,
          typeContrat: editingEmploye.typeContrat,
          salaireBase: editingEmploye.salaireBase,
          numeroCnss: editingEmploye.numeroCnss || '',
          photoProfile: editingEmploye.photoProfile || '',
          managerId: editingEmploye.managerId || null,
          agenceId: editingEmploye.agenceId || null,
          jobPositionId: editingEmploye.jobPositionId || null,
          modeCalculPaie: editingEmploye.modeCalculPaie || 'MONTHLY',
          // Documents
          typePiece: editingEmploye.typePiece || null,
          numeroPiece: editingEmploye.numeroPiece || null,
          dateExpirationPiece: editingEmploye.dateExpirationPiece || null,
          paysEmissionId: editingEmploye.paysEmissionId || null,
          // Paiement
          paymentMethod: editingEmploye.paymentMethod || null,
          paymentDetails: editingEmploye.paymentDetails || null,
          // Coordonnées bancaires
          bankName: editingEmploye.bankName || '',
          bankCode: editingEmploye.bankCode || '',
          branchCode: editingEmploye.branchCode || '',
          bankAccountNumber: editingEmploye.bankAccountNumber || '',
          accountKey: editingEmploye.accountKey || '',
          // Dates contrat
          dateFinContrat: editingEmploye.dateFinContrat || null,
          dateFinEssai: editingEmploye.dateFinEssai || null,
          dureeEssaiMois: editingEmploye.dureeEssaiMois ? String(editingEmploye.dureeEssaiMois) : null,
          prochaineMedicale: editingEmploye.prochaineMedicale || null,
          // Situation familiale
          situationFamiliale: editingEmploye.situationFamiliale || undefined,
          nombreEnfantsCharge: String(editingEmploye.nombreEnfantsCharge ?? 0),
          niu: editingEmploye.niu || '',
          // Sortie
          dateSortie: editingEmploye.dateSortie || null,
          motifSortie: editingEmploye.motifSortie || null,
        } : {
          matricule: '',
          nom: '',
          prenom: '',
          sexe: 'M',
          email: '',
          phone: '',
          dateNaissance: '',
          lieuNaissance: '',
          dateEmbauche: new Date().toISOString().split('T')[0],
          adresse: '',
          ville: '',
          departement: '',
          poste: '',
          typeContrat: 'CDI',
          salaireBase: '',
          numeroCnss: '',
          managerId: null,
          agenceId: null,
          jobPositionId: null,
          modeCalculPaie: 'MONTHLY',
        }}
      />

      <ImportEmployeesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchEmployes}
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
