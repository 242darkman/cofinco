import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '../ui';
import {
  Search, Filter, MoreVertical,
  Briefcase, Building2, Phone, Eye, EyeOff,
  FileText, UserX, Ban, PenLine
} from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { usePermissions } from '../auth/ProtectedFeature';
import { resolveStorageUrl } from '@/lib/format';
import { StatutUser } from '@shared/enum/status-constants';
import { currencySymbol } from '@shared/config/currency';
import EmployeeProfileDrawer from './EmployeeProfileDrawer';
import TransferAgenceModal from './TransferAgenceModal';

interface EmployesListProps {
  employes: Employe[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEdit: (employe: Employe) => void;
  onDelete: (id: string) => void;
  getStatutColor: (statut: string) => string;
  onRefresh?: () => void;
}

export default function EmployesList({
  employes,
  loading,
  searchTerm,
  onSearchChange,
  onEdit,
  onDelete,
  getStatutColor,
  onRefresh
}: EmployesListProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canEditEmployees = hasPermission('rh', 'edit') || hasPermission('users', 'edit');
  const canDeleteEmployees = hasPermission('rh', 'delete') || hasPermission('users', 'delete');

  // Agency filter
  const [filterAgence, setFilterAgence] = useState<string>('all');
  const [agencyOptions, setAgencyOptions] = useState<Array<{ id: string; nom: string }>>([]);

  useEffect(() => {
    fetch('/api/auth/my-agencies', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.agencies?.length > 1) {
          setAgencyOptions(data.agencies.map((a: any) => ({ id: a.agenceId, nom: a.agenceNom })));
        }
      })
      .catch(() => {});
  }, []);

  // State
  const [showSalaries, setShowSalaries] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterContrat, setFilterContrat] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  // NEW STATE: replaced simple ID with full state object
  const [menuState, setMenuState] = useState<{
    id: string;
    emp: Employe;
    position: { top: number; right: number };
  } | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<Employe | null>(null);
  const [transferEmployee, setTransferEmployee] = useState<Employe | null>(null);
  const ITEMS_PER_PAGE = 10;
  
  // ... (keeping existing filters logic) ...
  const filteredEmployes = employes.filter(emp => {
    if (filterStatus !== 'all' && emp.statut !== filterStatus) return false;
    if (filterContrat !== 'all' && emp.typeContrat !== filterContrat) return false;
    if (filterAgence !== 'all' && emp.agenceId !== filterAgence) return false;
    return true;
  });
  
  const totalPages = Math.ceil(filteredEmployes.length / ITEMS_PER_PAGE);
  const paginatedEmployes = filteredEmployes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  
  // ... (keeping existing helpers) ...
  
  // Helper function to generate initials
  const getInitials = (nom: string, prenom: string) => {
    return `${(nom || '').charAt(0)}${(prenom || '').charAt(0)}`.toUpperCase();
  };


  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      [StatutUser.ACTIVE]: 'Actif', [StatutUser.INACTIVE]: 'Inactif',
      [StatutUser.SUSPENDED]: 'Suspendu', 'Congé': 'Congé'
    };
    return statusMap[status] || status;
  };

  const getContractBadge = (typeContrat: string) => {
    const contractColors: Record<string, string> = {
      'CDI': 'bg-status-success-bg text-status-success border-status-success/20',
      'CDD': 'bg-status-info-bg text-status-info border-status-info/20',
      'Stage': 'bg-status-info-bg text-status-info border-status-info/20',
      'Freelance': 'bg-status-warning-bg text-status-warning border-status-warning/20',
      'Temporaire': 'bg-surface-subtle/30 text-content-muted border-edge-strong/20'
    };
    return contractColors[typeContrat] || 'bg-surface-subtle/30 text-content-muted border-edge-strong/20';
  };

  const handleRowClick = (emp: Employe) => {
    setSelectedEmployee(emp);
  };

  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>, emp: Employe) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({
      id: emp.id,
      emp: emp,
      position: {
        top: rect.bottom + 5,
        right: window.innerWidth - rect.right
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface-base space-y-2">
      
      {/* 2. BARRE D'OUTILS - Compact */}
      <div className="flex flex-col gap-2">
         {/* ... (keeping component content) ... */}
         <div className="flex flex-col md:flex-row gap-2 bg-surface-base/50 p-2 rounded-lg border border-edge">
            {/* Same Toolbar Content */}
            <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted w-3.5 h-3.5" />
               <input 
                 type="text"
                 value={searchTerm}
                 onChange={(e) => onSearchChange(e.target.value)}
                 placeholder="Rechercher..." 
                 className="w-full bg-surface-base border border-edge rounded-md pl-9 pr-3 py-2 text-sm text-content-secondary focus:ring-1 focus:ring-accent focus:outline-none h-9"
               />
            </div>
            <div className="flex gap-2">
               <button 
                 onClick={() => setShowSalaries(!showSalaries)}
                 className="px-3 py-1.5 text-content-muted hover:text-content-primary border border-edge rounded-md bg-surface-base flex items-center gap-1.5 text-xs transition-colors h-9"
               >
                 {showSalaries ? <EyeOff size={14}/> : <Eye size={14}/>} 
                 <span className="hidden md:inline">Salaires</span>
               </button>
               <button 
                 onClick={() => setShowFilters(!showFilters)}
                 className={`px-3 py-1.5 border border-edge rounded-md bg-surface-base flex items-center gap-1.5 text-xs transition-colors h-9 ${
                   showFilters ? 'text-accent border-accent/50' : 'text-content-muted hover:text-content-primary'
                 }`}
               >
                 <Filter size={14}/> Filtres
               </button>
            </div>
         </div>
         
         {/* Filters Panel */}
         {showFilters && (
           <div className="bg-surface-base/50 p-4 rounded-xl border border-edge flex flex-col md:flex-row gap-4">
             {/* Same Filters Content */}
             <div className="flex-1">
               <label className="text-xs text-content-muted uppercase mb-2 block">Statut</label>
               <select
                 value={filterStatus}
                 onChange={(e) => setFilterStatus(e.target.value)}
                 className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-secondary focus:ring-2 focus:ring-accent focus:outline-none"
               >
                 <option value="all">Tous les statuts</option>
                 <option value={StatutUser.ACTIVE}>Actif</option>
                 <option value={StatutUser.INACTIVE}>Inactif</option>
                 <option value={StatutUser.SUSPENDED}>Suspendu</option>
                 <option value="Congé">Congé</option>
               </select>
             </div>
             <div className="flex-1">
               <label className="text-xs text-content-muted uppercase mb-2 block">Type de contrat</label>
               <select
                 value={filterContrat}
                 onChange={(e) => setFilterContrat(e.target.value)}
                 className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-secondary focus:ring-2 focus:ring-accent focus:outline-none"
               >
                 <option value="all">Tous les contrats</option>
                 <option value="CDI">CDI</option>
                 <option value="CDD">CDD</option>
                 <option value="Stage">Stage</option>
                 <option value="Freelance">Freelance</option>
                 <option value="Temporaire">Temporaire</option>
               </select>
             </div>
             {agencyOptions.length > 1 && (
               <div className="flex-1">
                 <label className="text-xs text-content-muted uppercase mb-2 block">Agence</label>
                 <select
                   value={filterAgence}
                   onChange={(e) => setFilterAgence(e.target.value)}
                   className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-content-secondary focus:ring-2 focus:ring-accent focus:outline-none"
                 >
                   <option value="all">Toutes les agences</option>
                   {agencyOptions.map(a => (
                     <option key={a.id} value={a.id}>{a.nom}</option>
                   ))}
                 </select>
               </div>
             )}
             <div className="flex items-end">
               <button
                 onClick={() => { setFilterStatus('all'); setFilterContrat('all'); setFilterAgence('all'); }}
                 className="px-4 py-2 text-content-muted hover:text-content-primary border border-edge rounded-lg bg-surface-base text-sm transition-colors"
               >
                 Réinitialiser
               </button>
             </div>
           </div>
         )}
      </div>

      {/* 3. TABLEAU PIXEL PERFECT (Desktop) */}
      <div className="hidden md:block flex-1 bg-surface-base border border-edge rounded-lg overflow-hidden shadow-sm min-h-0">
        <div className="h-full overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-base shadow-sm border-b border-edge">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-content-muted uppercase tracking-wider bg-surface-base/95 backdrop-blur">Employé</th>
              <th className="px-4 py-3 text-xs font-bold text-content-muted uppercase tracking-wider bg-surface-base/95 backdrop-blur">Poste & Service</th>
              <th className="px-4 py-3 text-xs font-bold text-content-muted uppercase tracking-wider bg-surface-base/95 backdrop-blur">Contrat</th>
              <th className="px-4 py-3 text-xs font-bold text-content-muted uppercase tracking-wider bg-surface-base/95 backdrop-blur">Statut</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-content-muted uppercase tracking-wider bg-surface-base/95 backdrop-blur">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <Spinner size="md" />
                  </div>
                </td>
              </tr>
            ) : paginatedEmployes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-content-muted">
                  Aucun employé trouvé.
                </td>
              </tr>
            ) : (
              paginatedEmployes.map((emp) => (
                <tr 
                  key={emp.id} 
                  onClick={() => handleRowClick(emp)}
                  className="group hover:bg-surface/40 transition-colors cursor-pointer relative"
                >
                  
                  {/* 1. EMPLOYÉ (Alignement Flex) */}
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-3">
                      <Avatar
                        photoUrl={emp.photoProfile}
                        fullName={`${emp.nom} ${emp.prenom}`}
                        initials={getInitials(emp.nom, emp.prenom)}
                        size="sm"
                      />
                      <div>
                        <div className="font-bold text-content-primary text-xs group-hover:text-accent transition-colors">
                          {emp.nom} {emp.prenom}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-content-muted font-mono">{emp.matricule}</span>
                          {emp.agence?.nom && (
                            <span className="text-[9px] text-content-muted/70 truncate max-w-[100px]">• {emp.agence.nom}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 2. POSTE */}
                  <td className="px-4 py-2 align-middle">
                     <div className="flex flex-col">
                        <span className="text-xs text-content-secondary font-medium">{emp.poste || 'Non défini'}</span>
                        <span className="text-[10px] text-content-muted">{emp.departement || 'N/A'}</span>
                     </div>
                  </td>

                  {/* 3. CONTRAT & SALAIRE */}
                  <td className="px-4 py-2 align-middle">
                     <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getContractBadge(emp.typeContrat)}`}>
                          {emp.typeContrat}
                        </span>
                        <span className={`text-xs font-medium transition-all ${showSalaries ? 'text-status-success' : 'text-content-muted blur-sm select-none'}`}>
                          {parseFloat(emp.salaireBase || '0').toLocaleString()} {currencySymbol()}
                        </span>
                     </div>
                  </td>

                  {/* 4. STATUT */}
                  <td className="px-4 py-2 align-middle">
                     <StatusBadge status={getStatusLabel(emp.statut)} />
                  </td>

                  {/* 5. ACTIONS (Button Only - Menu Detached) */}
                  <td className="px-4 py-2 align-middle text-right relative">
                     <button 
                       onClick={(e) => handleMenuOpen(e, emp)}
                       className={`p-1.5 rounded-lg transition-colors ${
                         menuState?.id === emp.id 
                           ? 'bg-accent text-white' 
                           : 'text-content-muted hover:text-content-primary hover:bg-surface-elevated'
                       }`}
                     >
                       <MoreVertical size={14} />
                     </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* 4. CARTES RESPONSIVES (Mobile/POS) */}
      <div className="md:hidden space-y-3 pb-20 px-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="xl" />
          </div>
        ) : paginatedEmployes.length === 0 ? (
          <div className="text-center py-12 text-content-muted">
            Aucun employé trouvé.
          </div>
        ) : (
          paginatedEmployes.map((emp) => (
            <div 
              key={emp.id} 
              onClick={() => handleRowClick(emp)}
              className="bg-surface-base border border-edge p-4 rounded-xl flex flex-col gap-3 shadow-md cursor-pointer hover:bg-surface/50 transition-colors"
            >
               
               {/* Card Header */}
               <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                    <Avatar
                      photoUrl={emp.photoProfile}
                      fullName={`${emp.nom} ${emp.prenom}`}
                      initials={getInitials(emp.nom, emp.prenom)}
                      size="md"
                    />
                    <div>
                      <div className="font-bold text-content-primary">{emp.nom} {emp.prenom}</div>
                      <div className="text-xs text-content-muted">{emp.poste || 'Non défini'}</div>
                    </div>
                 </div>
                 <StatusBadge status={getStatusLabel(emp.statut)} />
               </div>

               {/* Card Body (Info Grid) */}
               <div className="grid grid-cols-2 gap-3 text-sm bg-surface-base/50 p-3 rounded-lg border border-edge">
                  <div>
                     <span className="text-[10px] text-content-muted uppercase block mb-1">Matricule</span>
                     <div className="font-mono text-xs text-content-secondary">{emp.matricule}</div>
                     <span className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${getContractBadge(emp.typeContrat)}`}>
                       {emp.typeContrat}
                     </span>
                  </div>
                  <div className="text-right">
                     <span className="text-[10px] text-content-muted uppercase block mb-1">Salaire</span>
                     <div className={`font-medium text-xs ${showSalaries ? 'text-status-success' : 'blur-sm text-content-muted'}`}>
                       {parseFloat(emp.salaireBase || '0').toLocaleString()} FCFA
                     </div>
                  </div>
               </div>
            </div>
          ))
        )}
      </div>


      {/* 5. PAGINATION */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pb-4 px-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-surface text-content-secondary rounded-lg border border-edge disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors text-sm"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-content-muted flex items-center text-sm">
            Page {currentPage} sur {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-surface text-content-secondary rounded-lg border border-edge disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors text-sm"
          >
            Suivant
          </button>
        </div>
      )}

      {/* DRAWER / FICHE PROFIL */}
      {selectedEmployee && (
        <EmployeeProfileDrawer
           employee={selectedEmployee}
           onClose={() => setSelectedEmployee(null)}
           onEdit={(emp) => {
             setSelectedEmployee(null);
             onEdit(emp);
           }}
           onRefresh={() => {
             setSelectedEmployee(null);
             onRefresh?.();
           }}
        />
      )}

      {/* TRANSFER MODAL */}
      {transferEmployee && (
        <TransferAgenceModal
          employee={transferEmployee}
          onClose={() => setTransferEmployee(null)}
          onSuccess={() => { setTransferEmployee(null); onRefresh?.(); }}
        />
      )}

      {/* GLOBAL DROPDOWN MENU (Fixed Position) */}
      {menuState && (
        <>
          <div 
            className="fixed inset-0 z-[60]" 
            onClick={() => setMenuState(null)} 
          />
          <div 
            className="fixed z-[70] w-48 bg-surface-base border border-edge rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-200"
            style={{ 
              top: `${menuState.position.top}px`, 
              right: `${menuState.position.right}px` 
            }}
          >
            <div className="px-3 py-2 text-[10px] uppercase font-bold text-content-muted border-b border-edge">
              Actions
            </div>
            
            <DropdownItem 
              icon={PenLine} 
              label="Modifier le profil" 
              onClick={(e) => { 
                e.stopPropagation(); 
                onEdit(menuState.emp); 
                setMenuState(null); 
              }} 
            />
            <DropdownItem
              icon={FileText}
              label="Voir la fiche"
              onClick={(e) => {
                e.stopPropagation();
                handleRowClick(menuState.emp);
                setMenuState(null);
              }}
            />
            <DropdownItem
              icon={Building2}
              label="Changer d'agence"
              onClick={(e) => {
                e.stopPropagation();
                setTransferEmployee(menuState.emp);
                setMenuState(null);
              }}
            />

            <div className="my-1 border-t border-edge" />
            
            {canDeleteEmployees && (
              <DropdownItem 
                icon={UserX} 
                label="Supprimer" 
                color="text-status-danger hover:bg-status-danger-bg" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onDelete(menuState.emp.id); 
                  setMenuState(null); 
                }} 
              />
            )}
          </div>
        </>
      )}

    </div>
  );
}

// --- SOUS-COMPOSANTS ---

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'Actif';
  const isSuspended = status === 'Suspendu';
  
  const getStyles = () => {
    if (isActive) return 'bg-status-success-bg text-status-success border-status-success/20';
    if (isSuspended) return 'bg-status-warning-bg text-status-warning border-status-warning/20';
    return 'bg-status-danger-bg text-status-danger border-status-danger/20';
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStyles()}`}>
      {status}
    </span>
  );
}

function DropdownItem({ 
  icon: Icon, 
  label, 
  onClick, 
  color = "text-content-secondary hover:bg-surface" 
}: {
  icon: React.ElementType;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  color?: string;
}) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${color}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
