import React, { useState } from 'react';
import { Gift, CheckCircle2, UserPlus, Users, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avantage } from '../../hooks/hr/useAvantages';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, Button, SelectField } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

interface AvantagesManagerProps {
  avantages: Avantage[];
  employes: Employe[];
  selectedEmployes: string[];
  onToggleEmploye: (employeId: string) => void;
  onApplyToSelected: (avantageId: number) => void;
}

export default function AvantagesManager({
  avantages,
  employes,
  selectedEmployes,
  onToggleEmploye,
  onApplyToSelected,
}: AvantagesManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canApplyAvantages = hasPermission('rh', 'edit') || hasPermission('avantages', 'create');

  const [contractFilter, setContractFilter] = useState<string>('Tous');
  
  // Pagination for employees
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const filteredEmployes = employes.filter(emp => 
    contractFilter === 'Tous' || emp.typeContrat === contractFilter
  );

  const totalPages = Math.ceil(filteredEmployes.length / ITEMS_PER_PAGE);
  const paginatedEmployes = filteredEmployes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filter changes
  const handleFilterChange = (value: string) => {
    setContractFilter(value);
    setCurrentPage(1);
  };

  const contractOptions = [
    { value: 'Tous', label: 'Tous les contrats' },
    { value: 'CDI', label: 'CDI' },
    { value: 'CDD', label: 'CDD' },
    { value: 'Stage', label: 'Stagiaires' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche : Liste des Avantages */}
        <div className="lg:col-span-2 space-y-4">
             <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <Gift className="text-cyan-400" size={20} />
                    <h3 className="text-lg font-bold text-white">Avantages Disponibles</h3>
                </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(avantages || []).map((avantage) => {
                  // Check compatibility with filter (optional visual cue)
                  const isCompatibleWithFilter = contractFilter === 'Tous' || (avantage.eligibleContrats as string[] || []).includes(contractFilter);
                  
                  return (
                  <div key={avantage.id} className={`bg-slate-800/80 border ${isCompatibleWithFilter ? 'border-slate-700' : 'border-red-900/50 opacity-70'} rounded-xl p-4 hover:border-cyan-500/50 transition-colors group`}>
                      <div className="flex justify-between items-start mb-3">
                          <div className="p-2 bg-cyan-500/10 rounded-lg group-hover:bg-cyan-500/20 transition-colors">
                            <Gift size={18} className="text-cyan-400" />
                          </div>
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            {(avantage.montantParDefaut || 0).toLocaleString()} FC
                          </span>
                      </div>
                      
                      <h4 className="text-white font-semibold mb-1">{avantage.nom}</h4>
                      <p className="text-xs text-slate-400 mb-4 line-clamp-2">{avantage.description || 'Aucune description'}</p>
                      
                      {/* Show eligibility */}
                      <div className="flex flex-wrap gap-1 mb-3">
                          {(avantage.eligibleContrats as string[] || []).map(c => (
                              <span key={c} className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">{c}</span>
                          ))}
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        disabled={selectedEmployes.length === 0 || !canApplyAvantages}
                        onClick={() => onApplyToSelected(avantage.id)}
                        className="opacity-90 hover:opacity-100"
                      >
                         Attribuer à {selectedEmployes.length || 0} employé(s)
                      </Button>
                  </div>
                )})} 
            </div>
        </div>

        {/* Colonne droite : Sélection des Employés */}
        <div className="lg:col-span-1">
             <Card padding="md" className="h-full flex flex-col bg-slate-900/50 border-slate-800">
                <div className="flex flex-col gap-3 mb-4 border-b border-slate-800 pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="text-purple-400" size={18} />
                            <h3 className="font-bold text-white">Employés</h3>
                        </div>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full font-bold">
                            {selectedEmployes.length} sel.
                        </span>
                    </div>
                    
                    <SelectField
                        label=""
                        name="contractFilter"
                        value={contractFilter}
                        onChange={(e) => handleFilterChange(e.target.value)}
                        options={contractOptions}
                        className="bg-slate-800 border-slate-700 text-sm"
                    />
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[400px] scrollbar-thin scrollbar-thumb-slate-700">
                    {paginatedEmployes.map(emp => (
                        <div 
                            key={emp.id}
                            onClick={() => onToggleEmploye(emp.id)}
                            className={`
                                flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border
                                ${selectedEmployes.includes(emp.id) 
                                    ? 'bg-purple-500/10 border-purple-500/50 shadow-inner' 
                                    : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
                                }
                            `}
                        >
                            <div className={`
                                w-4 h-4 rounded border flex items-center justify-center transition-colors
                                ${selectedEmployes.includes(emp.id)
                                    ? 'bg-purple-500 border-purple-500'
                                    : 'border-slate-500'
                                }
                            `}>
                                {selectedEmployes.includes(emp.id) && <CheckCircle2 size={10} className="text-white" />}
                            </div>
                            
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                {emp.nom.charAt(0)}{emp.prenom.charAt(0)}
                            </div>
                            
                            <div className="min-w-0">
                                <p className={`text-sm font-medium truncate ${selectedEmployes.includes(emp.id) ? 'text-purple-200' : 'text-slate-300'}`}>
                                    {emp.nom} {emp.prenom}
                                </p>
                                <div className="flex items-center gap-2">
                                     <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{emp.poste}</span>
                                     <span className={`text-[9px] px-1 py-px rounded border ${emp.typeContrat === 'Stage' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' : 'bg-blue-500/10 border-blue-500/30 text-blue-500'}`}>
                                        {emp.typeContrat}
                                     </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredEmployes.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-sm">
                            Aucun employé trouvé.
                        </div>
                    )}
                </div>

                {/* Pagination Controls - Mobile First */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-700">
                    <div className="text-xs text-slate-400">
                      <span className="hidden sm:inline">Page </span>{currentPage}<span className="sm:hidden">/</span><span className="hidden sm:inline"> sur </span>{totalPages}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 sm:px-3 sm:py-1.5 flex items-center justify-center gap-1 text-xs font-medium border border-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-all active:scale-95"
                        aria-label="Page précédente"
                      >
                        <ChevronLeft size={14} />
                        <span className="hidden sm:inline">Préc.</span>
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 sm:px-3 sm:py-1.5 flex items-center justify-center gap-1 text-xs font-medium border border-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-all active:scale-95"
                        aria-label="Page suivante"
                      >
                        <span className="hidden sm:inline">Suiv.</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
             </Card>
        </div>
      </div>
    </div>
  );
}
