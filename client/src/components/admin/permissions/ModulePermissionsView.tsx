import React, { useState, useMemo, useEffect } from 'react';
import { Search, ShieldCheck, Info, Users, Loader2, RefreshCcw, Award } from 'lucide-react';
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

// Status dot component for module sidebar
function StatusDot({ active, total }: { active: number; total: number }) {
  const ratio = total > 0 ? active / total : 0;
  let colorClass = 'bg-slate-500';
  
  if (ratio === 1) {
    colorClass = 'bg-emerald-500';
  } else if (ratio > 0) {
    colorClass = 'bg-amber-500';
  }
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-medium">{active}/{total}</span>
      <div className={`w-2 h-2 rounded-full ${colorClass}`} />
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
    <div className="flex flex-col h-full space-y-4">
      
      {/* TOP BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            Catalogue des Permissions
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h2>
          <div className="hidden sm:block h-6 w-px bg-slate-700"></div>
          <span className="hidden sm:inline text-slate-400 text-sm">
            {activeModules} modules • {totalPermissions} permissions
          </span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              className="w-full h-10 pl-9 pr-4 border border-slate-700 rounded-lg bg-slate-800 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-sm transition-all"
              placeholder="Rechercher une permission..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">{lastUpdated}</span>
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-10 w-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg transition-colors border border-slate-700"
            >
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* SPLIT VIEW */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6 items-start flex-1 min-h-0">
        
        {/* SIDEBAR - Modules List */}
        <div className="col-span-12 lg:col-span-4 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
            <Award size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-300">Modules</span>
            <span className="ml-auto text-xs text-slate-500">{modules.length}</span>
          </div>
          <div className="max-h-[500px] lg:max-h-[600px] overflow-y-auto">
            {Object.entries(groupedModules).map(([category, categoryModules]) => (
              <div key={category}>
                <div className="px-4 py-2 bg-slate-800/30 sticky top-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {categoryModules.map(module => {
                    const stats = getModuleStats(module.id);
                    const isActive = activeModuleId === module.id;
                    
                    return (
                      <button
                        key={module.id}
                        onClick={() => setActiveModuleId(module.id)}
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
              </div>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT - Permissions Detail */}
        <div className="col-span-12 lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col max-h-[600px] lg:max-h-[700px]">
          {/* Module Header */}
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={18} className="text-indigo-400" />
                  {activeModule?.name || 'Sélectionnez un module'}
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  {activeStats.active}/{activeStats.total} permissions utilisées par au moins un rôle
                </p>
              </div>
              {/* Mini progress bar */}
              <div className="hidden sm:flex flex-col items-end gap-1">
                <span className="text-xs text-slate-500">Couverture</span>
                <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${activeStats.total > 0 ? (activeStats.active / activeStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Permissions List */}
          <div className="flex-1 overflow-y-auto">
            {activeModulePermissions.length > 0 ? (
              <div className="divide-y divide-slate-800/50">
                {activeModulePermissions.map((perm) => (
                  <div 
                    key={perm.id} 
                    className="group px-6 py-4 hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">
                            {perm.name}
                          </span>
                          <div className="relative group/tooltip">
                            <Info className="w-3.5 h-3.5 text-slate-600 cursor-help opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded-lg hidden group-hover/tooltip:block z-20 pointer-events-none shadow-xl">
                              {perm.description || `Permission technique: ${perm.code}`}
                            </div>
                          </div>
                        </div>
                        <code className="text-[11px] text-slate-600 mt-1 block font-mono">
                          {perm.code}
                        </code>
                        {/* Show roles with this permission */}
                        {perm.roleLabels && perm.roleLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {perm.roleLabels.map((label, idx) => (
                              <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Usage Badge */}
                      <div className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0
                        ${perm.activeRolesCount > 0 
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                          : 'bg-slate-800/50 text-slate-600 border-slate-700/50'}
                      `}>
                        <Users className="w-3.5 h-3.5" />
                        {perm.activeRolesCount > 0 ? `${perm.activeRolesCount} rôle${perm.activeRolesCount > 1 ? 's' : ''}` : 'Inutilisé'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Search size={40} className="mb-4 opacity-50" />
                <p className="text-base font-medium">
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
