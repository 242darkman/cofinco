import React, { useState } from 'react';
import { 
  Search, Filter, MoreVertical, 
  Briefcase, Building2, Phone, Eye, EyeOff,
  FileText, UserX, Ban, PenLine
} from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { usePermissions } from '../auth/ProtectedFeature';
import { resolveStorageUrl } from '@/lib/format';
import { StatutUser } from '@shared/enum/status-constants';
import EmployeeProfileDrawer from './EmployeeProfileDrawer';

interface EmployesListProps {
  employes: Employe[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEdit: (employe: Employe) => void;
  onDelete: (id: string) => void;
  getStatutColor: (statut: string) => string;
}

export default function EmployesList({
  employes,
  loading,
  searchTerm,
  onSearchChange,
  onEdit,
  onDelete,
  getStatutColor
}: EmployesListProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canEditEmployees = hasPermission('rh', 'edit') || hasPermission('users', 'edit');
  const canDeleteEmployees = hasPermission('rh', 'delete') || hasPermission('users', 'delete');

  // State
  const [showSalaries, setShowSalaries] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterContrat, setFilterContrat] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employe | null>(null);
  const ITEMS_PER_PAGE = 10;
  
  // Apply filters
  const filteredEmployes = employes.filter(emp => {
    if (filterStatus !== 'all' && emp.statut !== filterStatus) return false;
    if (filterContrat !== 'all' && emp.typeContrat !== filterContrat) return false;
    return true;
  });
  
  const totalPages = Math.ceil(filteredEmployes.length / ITEMS_PER_PAGE);
  const paginatedEmployes = filteredEmployes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Helper function to generate initials
  const getInitials = (nom: string, prenom: string) => {
    return `${(nom || '').charAt(0)}${(prenom || '').charAt(0)}`.toUpperCase();
  };

  // Helper function to generate gradient colors based on name
  const getGradientColors = (nom: string) => {
    const colors = [
      'from-slate-700 to-slate-800',
      'from-blue-600 to-blue-700',
      'from-indigo-600 to-indigo-700',
      'from-purple-600 to-purple-700',
      'from-emerald-600 to-emerald-700',
      'from-teal-600 to-teal-700',
      'from-cyan-600 to-cyan-700',
    ];
    const index = (nom || 'A').charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Helper to translate status to French
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      [StatutUser.ACTIVE]: 'Actif',
      [StatutUser.INACTIVE]: 'Inactif',
      [StatutUser.SUSPENDED]: 'Suspendu',
      'Congé': 'Congé'
    };
    return statusMap[status] || status;
  };

  // Helper to get contract type badge
  const getContractBadge = (typeContrat: string) => {
    const contractColors: Record<string, string> = {
      'CDI': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'CDD': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'Stage': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'Freelance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'Temporaire': 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
    return contractColors[typeContrat] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  // Handle row click
  const handleRowClick = (emp: Employe) => {
    setSelectedEmployee(emp);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 space-y-6">
      
      {/* 1. HEADER D'ACTIONS */}
      <div className="flex flex-col md:flex-row justify-between gap-4 px-2">
        <div>
           <h1 className="text-2xl font-bold text-white">Ressources Humaines</h1>
           <p className="text-slate-400 text-sm">Gérez les {employes.length} collaborateurs • {filteredEmployes.length} affichés</p>
        </div>
      </div>

      {/* 2. BARRE D'OUTILS */}
      <div className="flex flex-col gap-3 px-2">
        <div className="flex flex-col md:flex-row gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher par nom, matricule ou poste..." 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
           </div>
           <div className="flex gap-2">
              <button 
                onClick={() => setShowSalaries(!showSalaries)}
                className="px-4 py-2.5 text-slate-400 hover:text-white border border-slate-800 rounded-lg bg-slate-950 flex items-center gap-2 text-sm transition-colors"
              >
                {showSalaries ? <EyeOff size={16}/> : <Eye size={16}/>} 
                <span className="hidden md:inline">Salaires</span>
              </button>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2.5 border border-slate-800 rounded-lg bg-slate-950 flex items-center gap-2 text-sm transition-colors ${
                  showFilters ? 'text-indigo-400 border-indigo-500/50' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Filter size={16}/> Filtres
              </button>
           </div>
        </div>
        
        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase mb-2 block">Statut</label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">Tous les statuts</option>
                <option value={StatutUser.ACTIVE}>Actif</option>
                <option value={StatutUser.INACTIVE}>Inactif</option>
                <option value={StatutUser.SUSPENDED}>Suspendu</option>
                <option value="Congé">Congé</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase mb-2 block">Type de contrat</label>
              <select 
                value={filterContrat}
                onChange={(e) => setFilterContrat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">Tous les contrats</option>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="Stage">Stage</option>
                <option value="Freelance">Freelance</option>
                <option value="Temporaire">Temporaire</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilterStatus('all'); setFilterContrat('all'); }}
                className="px-4 py-2 text-slate-400 hover:text-white border border-slate-800 rounded-lg bg-slate-950 text-sm transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. TABLEAU PIXEL PERFECT (Desktop) */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-visible shadow-xl mx-2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/50">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employé</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Poste & Service</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contrat</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Statut</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                  </div>
                </td>
              </tr>
            ) : paginatedEmployes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  Aucun employé trouvé.
                </td>
              </tr>
            ) : (
              paginatedEmployes.map((emp) => (
                <tr 
                  key={emp.id} 
                  onClick={() => handleRowClick(emp)}
                  className="group hover:bg-slate-800/40 transition-colors cursor-pointer relative"
                >
                  
                  {/* 1. EMPLOYÉ (Alignement Flex) */}
                  <td className="px-6 py-4 align-middle">
                    <div className="flex items-center gap-4">
                      {emp.photoProfile ? (
                        <div className="w-11 h-11 flex-shrink-0 rounded-full bg-slate-800 border-2 border-slate-700 overflow-hidden">
                          <img 
                            src={resolveStorageUrl(emp.photoProfile)} 
                            alt={`${emp.nom} ${emp.prenom}`}
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      ) : (
                        <div className={`w-11 h-11 flex-shrink-0 rounded-full bg-gradient-to-br ${getGradientColors(emp.nom)} border-2 border-slate-700 flex items-center justify-center`}>
                          <span className="font-bold text-slate-100 text-sm">{getInitials(emp.nom, emp.prenom)}</span>
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors">
                          {emp.nom} {emp.prenom}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{emp.matricule}</div>
                      </div>
                    </div>
                  </td>

                  {/* 2. POSTE */}
                  <td className="px-6 py-4 align-middle">
                     <div className="flex flex-col gap-1">
                        <span className="text-sm text-slate-200 font-medium">{emp.poste || 'Non défini'}</span>
                        <span className="text-xs text-slate-500">{emp.departement || 'N/A'}</span>
                     </div>
                  </td>

                  {/* 3. CONTRAT & SALAIRE */}
                  <td className="px-6 py-4 align-middle">
                     <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getContractBadge(emp.typeContrat)}`}>
                          {emp.typeContrat}
                        </span>
                        <span className={`text-sm font-medium transition-all ${showSalaries ? 'text-emerald-400' : 'text-slate-600 blur-sm select-none'}`}>
                          {parseFloat(emp.salaireBase || '0').toLocaleString()}
                        </span>
                     </div>
                  </td>

                  {/* 4. STATUT */}
                  <td className="px-6 py-4 align-middle">
                     <StatusBadge status={getStatusLabel(emp.statut)} />
                  </td>

                  {/* 5. ACTIONS (Dropdown Only) */}
                  <td className="px-6 py-4 align-middle text-right relative">
                     <button 
                       onClick={(e) => { 
                         e.stopPropagation(); 
                         setOpenMenuId(openMenuId === emp.id ? null : emp.id); 
                       }}
                       className={`p-2 rounded-lg transition-colors ${
                         openMenuId === emp.id 
                           ? 'bg-indigo-600 text-white' 
                           : 'text-slate-500 hover:text-white hover:bg-slate-700'
                       }`}
                     >
                       <MoreVertical size={18} />
                     </button>

                     {/* DROPDOWN MENU FLOTTANT */}
                     {openMenuId === emp.id && (
                       <>
                         {/* Click outside closer */}
                         <div 
                           className="fixed inset-0 z-10" 
                           onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} 
                         />
                         
                         <div className="absolute right-8 top-10 z-20 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-200">
                           <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                             Actions
                           </div>
                           
                           <DropdownItem 
                             icon={PenLine} 
                             label="Modifier le profil" 
                             onClick={(e) => { 
                               e.stopPropagation(); 
                               onEdit(emp); 
                               setOpenMenuId(null); 
                             }} 
                           />
                           <DropdownItem 
                             icon={FileText} 
                             label="Voir la fiche" 
                             onClick={(e) => { 
                               e.stopPropagation(); 
                               handleRowClick(emp); 
                               setOpenMenuId(null); 
                             }} 
                           />
                           
                           <div className="my-1 border-t border-slate-800" />
                           
                           {canDeleteEmployees && (
                             <DropdownItem 
                               icon={UserX} 
                               label="Supprimer" 
                               color="text-red-500 hover:bg-red-500/10" 
                               onClick={(e) => { 
                                 e.stopPropagation(); 
                                 onDelete(emp.id); 
                                 setOpenMenuId(null); 
                               }} 
                             />
                           )}
                         </div>
                       </>
                     )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 4. CARTES RESPONSIVES (Mobile/POS) */}
      <div className="md:hidden space-y-3 pb-20 px-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        ) : paginatedEmployes.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            Aucun employé trouvé.
          </div>
        ) : (
          paginatedEmployes.map((emp) => (
            <div 
              key={emp.id} 
              onClick={() => handleRowClick(emp)}
              className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col gap-3 shadow-md cursor-pointer hover:bg-slate-800/50 transition-colors"
            >
               
               {/* Card Header */}
               <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                    {emp.photoProfile ? (
                      <img 
                        src={resolveStorageUrl(emp.photoProfile)} 
                        alt={`${emp.nom} ${emp.prenom}`}
                        className="w-10 h-10 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientColors(emp.nom)} flex items-center justify-center font-bold text-white`}>
                        {getInitials(emp.nom, emp.prenom)}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-white">{emp.nom} {emp.prenom}</div>
                      <div className="text-xs text-slate-400">{emp.poste || 'Non défini'}</div>
                    </div>
                 </div>
                 <StatusBadge status={getStatusLabel(emp.statut)} />
               </div>

               {/* Card Body (Info Grid) */}
               <div className="grid grid-cols-2 gap-3 text-sm bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                  <div>
                     <span className="text-[10px] text-slate-500 uppercase block mb-1">Matricule</span>
                     <div className="font-mono text-xs text-slate-300">{emp.matricule}</div>
                     <span className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${getContractBadge(emp.typeContrat)}`}>
                       {emp.typeContrat}
                     </span>
                  </div>
                  <div className="text-right">
                     <span className="text-[10px] text-slate-500 uppercase block mb-1">Salaire</span>
                     <div className={`font-medium text-xs ${showSalaries ? 'text-emerald-400' : 'blur-sm text-slate-600'}`}>
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
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-slate-400 flex items-center text-sm">
            Page {currentPage} sur {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm"
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
        />
      )}

    </div>
  );
}

// --- SOUS-COMPOSANTS ---

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'Actif';
  const isSuspended = status === 'Suspendu';
  
  const getStyles = () => {
    if (isActive) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (isSuspended) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
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
  color = "text-slate-300 hover:bg-slate-800" 
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
