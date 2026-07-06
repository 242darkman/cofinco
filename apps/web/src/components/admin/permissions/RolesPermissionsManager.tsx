import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shield, Award, CheckCircle, AlertCircle, Search, AlertTriangle, Eye, Edit, Trash2, Save, X, Loader2 } from 'lucide-react';
import { SelectField, SearchInput, Switch, Button } from '../../ui';
import { Module } from '../../../hooks/admin/useModules';
import { Permission } from '../../../hooks/admin/usePermissions';
import { RolePermission } from '../../../hooks/admin/useRolePermissions';
import { ADMIN_ROLES, CATEGORY_LABELS } from '../../../constants/admin-constants';
import { getRoleBadgeStyle } from '../../../lib/role-utils';
import { SystemRole, getRoleLabel } from '@shared/types/roles';
import { Link2 } from 'lucide-react';

interface RolesPermissionsManagerProps {
  modules: Module[];
  permissions: Permission[];
  selectedRole: SystemRole;
  onRoleChange: (role: SystemRole) => void;
  roleHasPermission: (role: SystemRole, permCode: string) => boolean;
  toggleRolePermission: (role: SystemRole, permCode: string) => void;
  activePermissionsCount: number;
  confirmMessage?: string;
  rolePermissionsData?: RolePermission[];
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
    bg: 'bg-status-info-bg',
    border: 'border-status-info/20',
    text: 'text-status-info',
  },
  gestion: {
    bg: 'bg-status-success-bg',
    border: 'border-status-success/20',
    text: 'text-status-success',
  },
  danger: {
    bg: 'bg-status-danger/10',
    border: 'border-status-danger/20',
    text: 'text-status-danger',
  }
};

const CATEGORY_LABELS_SEMANTIC = {
  consultation: 'Consultation',
  gestion: 'Gestion',
  danger: 'Zone Sensible'
};

// Status dot component for module sidebar - Compact
function StatusDot({ active, total }: { active: number; total: number }) {
  const ratio = total > 0 ? active / total : 0;
  let colorClass = 'bg-surface-muted0'; // None

  if (ratio === 1) {
    colorClass = 'bg-status-success'; // All active
  } else if (ratio > 0) {
    colorClass = 'bg-status-warning'; // Partial
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] text-content-muted font-medium">{active}/{total}</span>
      <div className={`w-2 h-2 rounded-full ${colorClass}`} />
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
  confirmMessage,
  rolePermissionsData = [],
}: RolesPermissionsManagerProps) {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Pending changes management - Map<permCode, newState>
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const roleOptions = ADMIN_ROLES.map(role => ({ value: role, label: getRoleBadgeStyle(role).label }));
  const isSuperAdmin = selectedRole === SystemRole.ADMIN;

  // Build inheritance lookup: permissionCode → inheritedFrom role
  const inheritanceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const rp of rolePermissionsData) {
      if (rp.inherited && rp.inheritedFrom && rp.permissionCode) {
        map.set(rp.permissionCode, rp.inheritedFrom);
      }
    }
    return map;
  }, [rolePermissionsData]);

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
    <div className="flex flex-col h-full space-y-2 relative">
      {/* TOP BAR - Compact */}
      <div className="flex items-center gap-3 bg-surface-base px-3 py-2 rounded-lg border border-edge">
        <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center shrink-0 border border-accent/20">
          <Shield size={16} className="text-accent" />
        </div>
        <div className="min-w-[220px]">
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
            className="bg-surface border-edge text-content-primary text-sm h-8 focus:border-accent focus:ring-accent/20"
          />
        </div>
        <div className="h-5 w-px bg-surface-elevated"></div>
        <span className="text-content-muted text-xs whitespace-nowrap">
          {activePermissionsCount} permissions actives
        </span>
        <div className="flex-1"></div>
        <div className="w-52">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder="Rechercher..."
            className="bg-surface border-edge h-8 text-sm"
          />
        </div>
      </div>

      {/* Special Banner for Admin - Compact */}
      {isSuperAdmin && (
        <div className="bg-status-info-bg border border-status-info/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <Shield size={14} className="text-status-info shrink-0" />
          <p className="text-xs text-status-info">
            <strong>Compte Super-Administrateur :</strong> Ce rôle dispose d'un accès complet et illimité au système. Ces permissions ne sont pas modifiables.
          </p>
        </div>
      )}

      {/* Confirm Message - Compact */}
      {confirmMessage && (
        <div className="px-3 py-2 bg-status-success-bg border border-status-success/20 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <CheckCircle size={14} className="text-status-success shrink-0" />
          <span className="text-xs font-medium text-status-success">{confirmMessage}</span>
        </div>
      )}

      {/* SPLIT VIEW - Compact */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">

        {/* SIDEBAR NAVIGATION - Compact */}
        <div className="col-span-12 lg:col-span-3 bg-surface-base rounded-lg border border-edge overflow-hidden flex flex-col lg:h-full max-h-[40vh] lg:max-h-none">
          <div className="px-3 py-2 bg-surface/50 border-b border-edge flex items-center gap-2">
            <Award size={14} className="text-content-muted" />
            <span className="text-sm font-semibold text-content-secondary">Modules</span>
            <span className="ml-auto text-[10px] text-content-muted">{allModules.length}</span>
          </div>
          <div className="divide-y divide-edge/50 flex-1 overflow-y-auto custom-scrollbar">
            {Object.entries(groupedModules).map(([category, categoryModules]) => (
              <div key={category}>
                <div className="px-3 py-1.5 bg-surface/30">
                  <span className="text-[9px] font-bold text-content-muted uppercase tracking-wider">
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
                        setSearchQuery('');
                      }}
                      className={`
                        w-full flex justify-between items-center px-3 py-2 hover:bg-surface/70 transition-colors text-left
                        ${isActive ? 'bg-surface border-l-2 border-accent' : 'border-l-2 border-transparent'}
                      `}
                    >
                      <span className={`text-xs font-medium truncate ${isActive ? 'text-content-primary' : 'text-content-secondary'}`}>
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

        {/* MAIN CONTENT (Permissions List) - Compact */}
        <div className="col-span-12 lg:col-span-9 bg-surface-base rounded-lg border border-edge overflow-hidden flex flex-col h-full">
          {/* Module Header - Compact */}
          <div className="px-3 py-2 border-b border-edge flex justify-between items-center gap-3 bg-surface/30 shrink-0">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-content-primary flex items-center gap-2">
                {globalSearchResults ? (
                  <>
                    <Search size={14} className="text-accent shrink-0" />
                    <span className="truncate">Résultats de recherche</span>
                  </>
                ) : (
                  <>
                    <Shield size={14} className="text-accent shrink-0" />
                    <span className="truncate">{activeModule?.name || 'Sélectionnez un module'}</span>
                  </>
                )}
              </h2>
              <p className="text-[11px] text-content-muted">
                {globalSearchResults
                  ? `${globalSearchResults.length} permission(s) trouvée(s)`
                  : `${activeModuleStats.active}/${activeModuleStats.total} permissions actives`
                }
              </p>
            </div>
            {!globalSearchResults && activeModuleId && !isSuperAdmin && (
              <div
                onClick={handleToggleAll}
                className="flex items-center gap-2 bg-surface rounded px-2.5 py-1.5 cursor-pointer hover:bg-surface-elevated transition-colors border border-edge shrink-0"
              >
                <span className="text-xs font-medium text-content-primary">Tout activer</span>
                <Switch
                  checked={isAllEnabled}
                  onChange={() => {}}
                  className={isAllEnabled ? 'bg-accent' : 'bg-surface-subtle'}
                />
              </div>
            )}
          </div>

          {/* Permissions Grid - Compact */}
          <div className="p-3 space-y-4 overflow-y-auto flex-1">
            {(Object.entries(groupedPermissions) as [keyof typeof CATEGORY_STYLES, Permission[]][])
              .filter(([_, perms]) => perms.length > 0)
              .map(([category, perms]) => {
                const Icon = CATEGORY_ICONS[category];
                const styles = CATEGORY_STYLES[category];

                return (
                  <div key={category} className="space-y-2">
                    {/* Category Header - Compact */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${styles.bg} border ${styles.border}`}>
                        <Icon size={10} className={styles.text} />
                      </div>
                      <h3 className={`text-[11px] font-bold uppercase tracking-wide ${styles.text}`}>
                        {CATEGORY_LABELS_SEMANTIC[category]}
                      </h3>
                      <span className="text-[10px] text-content-muted">({perms.length})</span>
                    </div>

                    {/* Permissions List - Compact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {perms.map(perm => {
                        const isGranted = isSuperAdmin ? true : getEffectivePermissionState(perm.code);
                        const isDanger = category === 'danger';
                        const hasPending = pendingChanges.has(perm.code);
                        const inheritedFrom = inheritanceMap.get(perm.code);
                        const isInherited = !!inheritedFrom;
                        const isDisabled = isSuperAdmin || isInherited;

                        return (
                          <div
                            key={perm.id}
                            onClick={() => !isDisabled && handleLocalToggle(perm.code)}
                            title={isInherited ? `Hérité du rôle ${getRoleLabel(inheritedFrom as SystemRole)}` : undefined}
                            className={`
                              flex items-center justify-between px-2.5 py-2 rounded border transition-all
                              ${isDisabled
                                ? 'cursor-not-allowed opacity-75'
                                : 'cursor-pointer hover:bg-surface/70'
                              }
                              ${isInherited
                                ? 'bg-status-info/5 border-status-info/15'
                                : isSuperAdmin
                                  ? 'bg-status-info/5 border-status-info/10'
                                  : ''
                              }
                              ${hasPending ? 'ring-1 ring-status-warning/50' : ''}
                              ${isGranted && !isDisabled
                                ? isDanger
                                  ? 'bg-status-danger/5 border-status-danger/20 hover:bg-status-danger/10'
                                  : 'bg-surface/50 border-edge hover:border-edge-strong'
                                : !isDisabled ? 'bg-transparent border-edge hover:border-edge' : ''
                              }
                            `}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-2">
                              <span className={`text-xs font-medium truncate ${isGranted ? 'text-content-secondary' : 'text-content-muted'}`}>
                                {perm.name}
                              </span>
                              {isInherited && (
                                <span className="inline-flex items-center gap-0.5 shrink-0 px-1 py-0.5 rounded bg-status-info/10 border border-status-info/20 text-[8px] font-semibold text-status-info">
                                  <Link2 size={8} />
                                  {getRoleLabel(inheritedFrom as SystemRole)}
                                </span>
                              )}
                            </div>

                            {/* Toggle Switch Visual - Compact */}
                            <div className={`
                              w-8 h-4 rounded-full relative transition-colors shrink-0
                              ${isGranted
                                ? isInherited
                                  ? 'bg-status-info/60'
                                  : isSuperAdmin
                                    ? 'bg-status-info'
                                    : isDanger
                                      ? 'bg-status-danger'
                                      : 'bg-accent'
                                : 'bg-surface-subtle/50'
                              }
                            `}>
                              <div
                                className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm"
                                style={{ left: isGranted ? 'calc(100% - 14px)' : '2px' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            {/* Empty State - Compact */}
            {Object.values(groupedPermissions).every(arr => arr.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-content-muted">
                <Search size={28} className="mb-2 opacity-50" />
                <p className="text-sm font-medium">Aucune permission trouvée</p>
                <p className="text-xs mt-0.5">
                  {searchQuery ? 'Essayez un autre terme' : 'Ce module ne contient pas de permissions'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STICKY FOOTER - Pending Changes - Compact */}
      {hasPendingChanges && !isSuperAdmin && (
        <div className="sticky bottom-0 left-0 right-0 bg-status-warning-bg border border-status-warning/30 rounded-lg px-3 py-2 flex items-center justify-between gap-3 backdrop-blur-sm shadow-lg shadow-black/20 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-status-warning-bg rounded-full flex items-center justify-center shrink-0">
              <AlertCircle size={14} className="text-status-warning" />
            </div>
            <p className="text-xs font-semibold text-status-warning">
              {pendingChanges.size} modification{pendingChanges.size > 1 ? 's' : ''} non enregistrée{pendingChanges.size > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="text-content-secondary hover:text-content-primary hover:bg-surface-elevated h-7 px-2 text-xs"
            >
              <X size={12} className="mr-1" />
              Annuler
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-accent hover:bg-accent-primary-hover text-white h-7 px-2 text-xs"
            >
              {isSaving ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : (
                <Save size={12} className="mr-1" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
