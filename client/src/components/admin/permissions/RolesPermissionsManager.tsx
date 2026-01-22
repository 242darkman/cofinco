import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shield, Award, CheckCircle, AlertCircle, Search, AlertTriangle, Eye, Edit, Trash2, Save, X, Loader2 } from 'lucide-react';
import { SelectField, SearchInput, Switch, Button } from '../../ui';
import { Module } from '../../../hooks/admin/useModules';
import { Permission } from '../../../hooks/admin/usePermissions';
import { ADMIN_ROLES, CATEGORY_LABELS } from '../../../constants/admin-constants';
import { getRoleBadgeStyle } from '../../../lib/role-utils';
import { SystemRole } from '@shared/types/roles';

interface RolesPermissionsManagerProps {
  modules: Module[];
  permissions: Permission[];
  selectedRole: SystemRole;
  onRoleChange: (role: SystemRole) => void;
  roleHasPermission: (role: SystemRole, permCode: string) => boolean;
  toggleRolePermission: (role: SystemRole, permCode: string) => void;
  activePermissionsCount: number;
  confirmMessage?: string;
}

// Helper to categorize permissions by action type
function categorizePermission(code: string): 'consultation' | 'gestion' | 'danger' {
  const lowerCode = code.toLowerCase();
  
  // Danger actions
  if (lowerCode.includes('delete') || lowerCode.includes('supprimer') || 
      lowerCode.includes('close') || lowerCode.includes('cloturer') ||
      lowerCode.includes('force') || lowerCode.includes('annuler') ||
      lowerCode.includes('reject') || lowerCode.includes('refuser')) {
    return 'danger';
  }
  
  // Consultation actions
  if (lowerCode.includes('view') || lowerCode.includes('voir') || 
      lowerCode.includes('list') || lowerCode.includes('lister') ||
      lowerCode.includes('read') || lowerCode.includes('rapport') ||
      lowerCode.includes('report') || lowerCode.includes('export') ||
      lowerCode.includes('consulter')) {
    return 'consultation';
  }
  
  // Default to gestion
  return 'gestion';
}

const CATEGORY_ICONS = {
  consultation: Eye,
  gestion: Edit,
  danger: Trash2
};

const CATEGORY_STYLES = {
  consultation: {
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    text: 'text-sky-400',
  },
  gestion: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
  },
  danger: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    text: 'text-rose-400',
  }
};

const CATEGORY_LABELS_SEMANTIC = {
  consultation: 'Consultation',
  gestion: 'Gestion',
  danger: 'Zone Sensible'
};

// Status dot component for module sidebar
function StatusDot({ active, total }: { active: number; total: number }) {
  const ratio = total > 0 ? active / total : 0;
  let colorClass = 'bg-slate-500'; // None
  
  if (ratio === 1) {
    colorClass = 'bg-emerald-500'; // All active
  } else if (ratio > 0) {
    colorClass = 'bg-amber-500'; // Partial
  }
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-medium">{active}/{total}</span>
      <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
    </div>
  );
}

export default function RolesPermissionsManager({
  modules = [],
  permissions = [],
  selectedRole,
  onRoleChange,
  roleHasPermission,
  toggleRolePermission,
  activePermissionsCount,
  confirmMessage
}: RolesPermissionsManagerProps) {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pending changes management - Map<permCode, newState>
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  
  const roleOptions = ADMIN_ROLES.map(role => ({ value: role, label: getRoleBadgeStyle(role).label }));
  const isSuperAdmin = selectedRole === SystemRole.ADMIN;

  // Reset pending changes when role changes
  useEffect(() => {
    setPendingChanges(new Map());
  }, [selectedRole]);

  // Group modules by category
  const groupedModules = useMemo(() => {
    return (modules || []).reduce((acc, module) => {
      if (!acc[module.category]) {
        acc[module.category] = [];
      }
      acc[module.category].push(module);
      return acc;
    }, {} as Record<string, Module[]>);
  }, [modules]);

  // Flatten modules for sidebar display
  const allModules = useMemo(() => {
    return Object.entries(groupedModules).flatMap(([category, mods]) => 
      mods.map(m => ({ ...m, categoryLabel: CATEGORY_LABELS[category] || category }))
    );
  }, [groupedModules]);

  // Auto-select first module if none selected
  useEffect(() => {
    if (!activeModuleId && allModules.length > 0) {
      setActiveModuleId(allModules[0].id);
    }
  }, [activeModuleId, allModules]);

  // Get effective permission state (considering pending changes)
  const getEffectivePermissionState = useCallback((permCode: string): boolean => {
    if (pendingChanges.has(permCode)) {
      return pendingChanges.get(permCode)!;
    }
    return roleHasPermission(selectedRole, permCode);
  }, [pendingChanges, roleHasPermission, selectedRole]);

  // Get permissions for active module
  const activeModulePermissions = useMemo(() => {
    if (!activeModuleId) return [];
    return permissions.filter(p => p.moduleId === activeModuleId);
  }, [activeModuleId, permissions]);

  // Filter permissions based on search query
  const filteredPermissions = useMemo(() => {
    if (!searchQuery.trim()) return activeModulePermissions;
    const query = searchQuery.toLowerCase();
    return activeModulePermissions.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.code.toLowerCase().includes(query)
    );
  }, [activeModulePermissions, searchQuery]);

  // If searching globally, show all matching permissions across modules
  const globalSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    return permissions.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.code.toLowerCase().includes(query)
    );
  }, [searchQuery, permissions]);

  // Group filtered permissions by category
  const groupedPermissions = useMemo(() => {
    const permsToGroup = globalSearchResults || filteredPermissions;
    return permsToGroup.reduce((acc, perm) => {
      const category = categorizePermission(perm.code);
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(perm);
      return acc;
    }, {} as Record<'consultation' | 'gestion' | 'danger', Permission[]>);
  }, [filteredPermissions, globalSearchResults]);

  // Calculate module stats (considering pending changes)
  const getModuleStats = useCallback((moduleId: string) => {
    const modulePerms = permissions.filter(p => p.moduleId === moduleId);
    const activeCount = modulePerms.filter(p => getEffectivePermissionState(p.code)).length;
    return { active: activeCount, total: modulePerms.length };
  }, [permissions, getEffectivePermissionState]);

  // Get active module details
  const activeModule = allModules.find(m => m.id === activeModuleId);
  const activeModuleStats = activeModuleId ? getModuleStats(activeModuleId) : { active: 0, total: 0 };
  const isAllEnabled = activeModuleStats.active === activeModuleStats.total && activeModuleStats.total > 0;

  // Handle local toggle (adds to pending changes)
  const handleLocalToggle = (permCode: string) => {
    if (isSuperAdmin) return;
    
    const currentState = getEffectivePermissionState(permCode);
    const originalState = roleHasPermission(selectedRole, permCode);
    const newState = !currentState;
    
    setPendingChanges(prev => {
      const next = new Map(prev);
      // If new state equals original, remove from pending (no change needed)
      if (newState === originalState) {
        next.delete(permCode);
      } else {
        next.set(permCode, newState);
      }
      return next;
    });
  };

  // Toggle all permissions for active module
  const handleToggleAll = () => {
    if (isSuperAdmin || !activeModuleId) return;
    const modulePerms = permissions.filter(p => p.moduleId === activeModuleId);
    
    modulePerms.forEach(perm => {
      const currentState = getEffectivePermissionState(perm.code);
      const originalState = roleHasPermission(selectedRole, perm.code);
      // If all are enabled, disable all. Otherwise enable all.
      const newState = !isAllEnabled;
      
      setPendingChanges(prev => {
        const next = new Map(prev);
        if (newState === originalState) {
          next.delete(perm.code);
        } else {
          next.set(perm.code, newState);
        }
        return next;
      });
    });
  };

  // Cancel all pending changes
  const handleCancel = () => {
    setPendingChanges(new Map());
  };

  // Save all pending changes
  const handleSave = async () => {
    if (pendingChanges.size === 0) return;
    
    setIsSaving(true);
    try {
      // Apply all pending changes
      const entries = Array.from(pendingChanges.entries());
      for (const [permCode] of entries) {
        await toggleRolePermission(selectedRole, permCode);
      }
      setPendingChanges(new Map());
    } catch (error) {
      console.error('Error saving permissions:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasPendingChanges = pendingChanges.size > 0;

  return (
    <div className="flex flex-col h-full space-y-4 relative">
      {/* TOP BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center shrink-0 border border-indigo-500/20">
            <Shield size={20} className="text-indigo-400" />
          </div>
          <div className="flex-1 sm:w-56">
            <SelectField
              label=""
              name="role"
              value={selectedRole}
              onChange={(e) => {
                if (hasPendingChanges) {
                  if (!confirm('Vous avez des modifications non enregistrées. Voulez-vous continuer ?')) {
                    return;
                  }
                }
                onRoleChange(e.target.value as SystemRole);
              }}
              options={roleOptions}
              className="bg-slate-800 border-slate-700 text-white focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-700"></div>
          <span className="hidden sm:inline text-slate-400 text-sm whitespace-nowrap">
            {activePermissionsCount} permissions actives
          </span>
        </div>
        <div className="w-full sm:w-64">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder="Rechercher un droit d'accès..."
            className="bg-slate-800 border-slate-700"
          />
        </div>
      </div>

      {/* Special Banner for Admin */}
      {isSuperAdmin && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex gap-3">
          <Shield size={18} className="text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-purple-300 leading-relaxed">
              <strong>Compte Super-Administrateur :</strong> Ce rôle dispose d'un accès complet et illimité au système. Ces permissions ne sont pas modifiables.
            </p>
          </div>
        </div>
      )}

      {/* Confirm Message */}
      {confirmMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <span className="text-sm font-medium text-emerald-400">{confirmMessage}</span>
        </div>
      )}

      {/* SPLIT VIEW */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6 items-start flex-1 min-h-0">
        
        {/* SIDEBAR NAVIGATION */}
        <div className="col-span-12 lg:col-span-4 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
            <Award size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-300">Modules</span>
            <span className="ml-auto text-xs text-slate-500">{allModules.length}</span>
          </div>
          <div className="divide-y divide-slate-800 max-h-[500px] lg:max-h-[600px] overflow-y-auto">
            {Object.entries(groupedModules).map(([category, categoryModules]) => (
              <div key={category}>
                <div className="px-4 py-2 bg-slate-800/30">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                </div>
                {categoryModules.map(module => {
                  const stats = getModuleStats(module.id);
                  const isActive = activeModuleId === module.id;
                  
                  return (
                    <button
                      key={module.id}
                      onClick={() => {
                        setActiveModuleId(module.id);
                        setSearchQuery(''); // Clear search when switching modules
                      }}
                      className={`
                        w-full flex justify-between items-center px-4 py-3 hover:bg-slate-800/70 transition-colors text-left
                        ${isActive ? 'bg-slate-800 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}
                      `}
                    >
                      <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>
                        {module.name}
                      </span>
                      <StatusDot active={stats.active} total={stats.total} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT (Permissions List) */}
        <div className="col-span-12 lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col max-h-[600px] lg:max-h-[700px]">
          {/* Module Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-800/30 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {globalSearchResults ? (
                  <>
                    <Search size={18} className="text-indigo-400" />
                    Résultats de recherche
                  </>
                ) : (
                  <>
                    <Shield size={18} className="text-indigo-400" />
                    {activeModule?.name || 'Sélectionnez un module'}
                  </>
                )}
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {globalSearchResults 
                  ? `${globalSearchResults.length} permission(s) trouvée(s) pour "${searchQuery}"`
                  : `${activeModuleStats.active}/${activeModuleStats.total} permissions actives`
                }
              </p>
            </div>
            {!globalSearchResults && activeModuleId && !isSuperAdmin && (
              <div 
                onClick={handleToggleAll}
                className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2.5 cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700"
              >
                <span className="text-sm font-medium text-white">Tout activer</span>
                <Switch 
                  checked={isAllEnabled} 
                  onChange={() => {}} 
                  className={isAllEnabled ? 'bg-indigo-600' : 'bg-slate-600'}
                />
              </div>
            )}
          </div>

          {/* Permissions Grid */}
          <div className="p-4 lg:p-6 space-y-6 overflow-y-auto flex-1">
            {(Object.entries(groupedPermissions) as [keyof typeof CATEGORY_STYLES, Permission[]][])
              .filter(([_, perms]) => perms.length > 0)
              .map(([category, perms]) => {
                const Icon = CATEGORY_ICONS[category];
                const styles = CATEGORY_STYLES[category];
                
                return (
                  <div key={category} className="space-y-3">
                    {/* Category Header */}
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${styles.bg} border ${styles.border}`}>
                        <Icon size={14} className={styles.text} />
                      </div>
                      <h3 className={`text-sm font-bold uppercase tracking-wide ${styles.text}`}>
                        {CATEGORY_LABELS_SEMANTIC[category]}
                      </h3>
                      <span className="text-xs text-slate-500 ml-1">({perms.length})</span>
                    </div>

                    {/* Permissions List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {perms.map(perm => {
                        const isGranted = isSuperAdmin ? true : getEffectivePermissionState(perm.code);
                        const isDanger = category === 'danger';
                        const hasPending = pendingChanges.has(perm.code);
                        
                        return (
                          <div 
                            key={perm.id}
                            onClick={() => handleLocalToggle(perm.code)}
                            className={`
                              flex items-center justify-between p-3 rounded-lg border transition-all
                              ${isSuperAdmin 
                                ? 'cursor-not-allowed bg-purple-500/5 border-purple-500/10 opacity-75' 
                                : 'cursor-pointer hover:bg-slate-800/70'
                              }
                              ${hasPending ? 'ring-2 ring-amber-500/50 ring-offset-1 ring-offset-slate-900' : ''}
                              ${isGranted && !isSuperAdmin
                                ? isDanger 
                                  ? 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10'
                                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600' 
                                : !isSuperAdmin ? 'bg-transparent border-slate-800 hover:border-slate-700' : ''
                              }
                            `}
                          >
                            <div className="flex flex-col gap-0.5 overflow-hidden pr-3">
                              <span className={`text-sm font-medium truncate ${isGranted ? 'text-slate-200' : 'text-slate-400'}`}>
                                {perm.name}
                              </span>
                              {isDanger && (
                                <span className="text-[10px] text-rose-400 uppercase tracking-wider font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  Action sensible
                                </span>
                              )}
                            </div>
                            
                            {/* Toggle Switch Visual */}
                            <div className={`
                              w-9 h-5 rounded-full relative transition-colors shrink-0
                              ${isGranted 
                                ? isSuperAdmin 
                                  ? 'bg-purple-500' 
                                  : isDanger 
                                    ? 'bg-rose-500' 
                                    : 'bg-indigo-500' 
                                : 'bg-slate-600/50'
                              }
                            `}>
                              <div 
                                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm`}
                                style={{ left: isGranted ? 'calc(100% - 18px)' : '2px' }} 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            {/* Empty State */}
            {Object.values(groupedPermissions).every(arr => arr.length === 0) && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Search size={40} className="mb-4 opacity-50" />
                <p className="text-base font-medium">Aucune permission trouvée</p>
                <p className="text-sm mt-1">
                  {searchQuery ? 'Essayez un autre terme de recherche' : 'Ce module ne contient pas de permissions'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STICKY FOOTER - Pending Changes */}
      {hasPendingChanges && !isSuperAdmin && (
        <div className="sticky bottom-0 left-0 right-0 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-sm shadow-lg shadow-black/20 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
              <AlertCircle size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {pendingChanges.size} modification{pendingChanges.size > 1 ? 's' : ''} non enregistrée{pendingChanges.size > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-400/70">
                Les changements ne seront pas appliqués tant que vous n'aurez pas enregistré
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <X size={16} className="mr-2" />
              Annuler
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isSaving ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
