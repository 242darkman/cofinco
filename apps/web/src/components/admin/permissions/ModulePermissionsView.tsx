import React, { useState, useMemo, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Search, ShieldCheck, Info, Users, RefreshCcw, Award } from 'lucide-react';
import { Module } from '../../../hooks/admin/useModules';
import { Permission } from '../../../hooks/admin/usePermissions';
import { CATEGORY_LABELS, ADMIN_ROLES } from '../../../constants/admin-constants';
import { getRoleBadgeStyle } from '../../../lib/role-utils';

interface ModulePermissionsViewProps {
  modules: Module[];
  permissions: Permission[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  roleHasPermission: (role: string, permCode: string) => boolean;
  selectedRole: string;
}

// Status dot component for module sidebar - Compact
function StatusDot({ active, total }: { active: number; total: number }) {
  const ratio = total > 0 ? active / total : 0;
  let colorClass = 'bg-surface-muted0';

  if (ratio === 1) {
    colorClass = 'bg-status-success';
  } else if (ratio > 0) {
    colorClass = 'bg-status-warning';
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-content-muted font-medium">{active}/{total}</span>
      <div className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />
    </div>
  );
}

export default function ModulePermissionsView({
  modules = [],
  permissions = [],
  searchTerm,
  onSearchChange,
  roleHasPermission,
}: ModulePermissionsViewProps) {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });

  // Statistics
  const totalPermissions = permissions.length;
  const activeModules = (modules || []).filter(m => m.isActive).length;

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

  // Auto-select first module if none selected
  useEffect(() => {
    if (!activeModuleId && modules.length > 0) {
      setActiveModuleId(modules[0].id);
    }
  }, [activeModuleId, modules]);

  // Get permissions for active module with role count
  const activeModulePermissions = useMemo(() => {
    if (!activeModuleId) return [];
    
    const modulePerms = permissions.filter(p => p.moduleId === activeModuleId);
    const searchLower = searchTerm.toLowerCase().trim();
    
    const filteredPerms = searchLower 
      ? modulePerms.filter(p => 
          p.name.toLowerCase().includes(searchLower) || 
          p.code.toLowerCase().includes(searchLower)
        )
      : modulePerms;
    
    return filteredPerms.map(perm => {
      const rolesWithPerm = ADMIN_ROLES.filter(role => roleHasPermission(role, perm.code));
      return {
        ...perm,
        activeRolesCount: rolesWithPerm.length,
        roleLabels: rolesWithPerm.map(role => getRoleBadgeStyle(role).label)
      };
    });
  }, [activeModuleId, permissions, searchTerm, roleHasPermission]);

  // Get module stats
  const getModuleStats = (moduleId: string) => {
    const modulePerms = permissions.filter(p => p.moduleId === moduleId);
    const activeCount = modulePerms.filter(p => 
      ADMIN_ROLES.some(role => roleHasPermission(role, p.code))
    ).length;
    return { active: activeCount, total: modulePerms.length };
  };

  // Active module details
  const activeModule = modules.find(m => m.id === activeModuleId);
  const activeStats = activeModuleId ? getModuleStats(activeModuleId) : { active: 0, total: 0 };

  // Simulate refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    const now = new Date();
    setLastUpdated(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    setIsRefreshing(false);
  };

  return (
    <div className="flex flex-col h-full space-y-2">

      {/* TOP BAR - Compact */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-surface-base px-3 py-2 rounded-lg border border-edge">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck size={14} className="text-accent" />
          </div>
          <h2 className="text-sm font-bold text-content-primary flex items-center gap-2">
            Catalogue des Permissions
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-success"></span>
            </span>
          </h2>
          <span className="hidden sm:inline text-content-muted text-xs">
            {activeModules} modules • {totalPermissions} permissions
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-52 group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              className="w-full h-8 pl-8 pr-3 border border-edge rounded-lg bg-surface text-content-secondary placeholder-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 text-xs transition-all"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-content-muted font-mono hidden sm:inline">{lastUpdated}</span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8 flex items-center justify-center bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content-secondary rounded-lg transition-colors border border-edge"
            >
              {isRefreshing ? <Spinner size="xs" tone="current" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* SPLIT VIEW - Compact */}
      <div className="grid grid-cols-12 gap-2 lg:gap-3 items-start flex-1 min-h-0">

        {/* SIDEBAR - Modules List - Compact */}
        <div className="col-span-12 lg:col-span-3 bg-surface-base rounded-lg border border-edge overflow-hidden">
          <div className="px-3 py-2 bg-surface/50 border-b border-edge flex items-center gap-2">
            <Award size={14} className="text-content-muted" />
            <span className="text-xs font-semibold text-content-secondary">Modules</span>
            <span className="ml-auto text-[10px] text-content-muted">{modules.length}</span>
          </div>
          <div className="max-h-[350px] lg:max-h-[calc(100vh-280px)] overflow-y-auto">
            {Object.entries(groupedModules).map(([category, categoryModules]) => (
              <div key={category}>
                <div className="px-3 py-1.5 bg-surface/30 sticky top-0">
                  <span className="text-[9px] font-bold text-content-muted uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                </div>
                <div className="divide-y divide-edge/50">
                  {categoryModules.map(module => {
                    const stats = getModuleStats(module.id);
                    const isActive = activeModuleId === module.id;

                    return (
                      <button
                        key={module.id}
                        onClick={() => setActiveModuleId(module.id)}
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
              </div>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT - Permissions Detail - Compact */}
        <div className="col-span-12 lg:col-span-9 bg-surface-base rounded-lg border border-edge overflow-hidden flex flex-col max-h-[400px] lg:max-h-[calc(100vh-280px)]">
          {/* Module Header - Compact */}
          <div className="px-3 py-2 border-b border-edge bg-surface/30 shrink-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-accent/10 rounded flex items-center justify-center">
                  <ShieldCheck size={12} className="text-accent" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-content-primary">
                    {activeModule?.name || 'Sélectionnez un module'}
                  </h3>
                  <p className="text-[10px] text-content-muted">
                    {activeStats.active}/{activeStats.total} permissions utilisées
                  </p>
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-[10px] text-content-muted">Couverture</span>
                <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${activeStats.total > 0 ? (activeStats.active / activeStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Permissions List - Compact */}
          <div className="flex-1 overflow-y-auto">
            {activeModulePermissions.length > 0 ? (
              <div className="divide-y divide-edge/50">
                {activeModulePermissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="group px-3 py-2 hover:bg-surface/40 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-content-secondary">
                            {perm.name}
                          </span>
                          <div className="relative group/tooltip">
                            <Info className="w-3 h-3 text-content-muted cursor-help opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-surface-base border border-edge text-[10px] text-content-secondary rounded-lg hidden group-hover/tooltip:block z-20 pointer-events-none shadow-xl">
                              {perm.description || `Permission technique: ${perm.code}`}
                            </div>
                          </div>
                        </div>
                        <code className="text-[10px] text-content-muted block font-mono">
                          {perm.code}
                        </code>
                        {/* Show roles with this permission */}
                        {perm.roleLabels && perm.roleLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {perm.roleLabels.map((label, idx) => (
                              <span key={idx} className="text-[9px] px-1 py-0.5 bg-accent/10 text-accent rounded border border-accent/20">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Usage Badge - Compact */}
                      <div className={`
                        flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-all shrink-0
                        ${perm.activeRolesCount > 0
                          ? 'bg-accent/10 text-accent border-accent/20'
                          : 'bg-surface/50 text-content-muted border-edge-subtle'}
                      `}>
                        <Users className="w-3 h-3" />
                        {perm.activeRolesCount > 0 ? `${perm.activeRolesCount} rôle${perm.activeRolesCount > 1 ? 's' : ''}` : 'Inutilisé'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-content-muted">
                <Search size={28} className="mb-2 opacity-50" />
                <p className="text-xs font-medium">
                  {searchTerm ? `Aucun résultat pour "${searchTerm}"` : 'Aucune permission dans ce module'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
