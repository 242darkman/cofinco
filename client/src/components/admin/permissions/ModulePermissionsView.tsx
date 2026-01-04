import React from 'react';
import { Key, Search, AlertCircle, Shield, CheckCircle, XCircle } from 'lucide-react';
import { Card, SearchInput } from '../../ui';
import { Module } from '../../../hooks/admin/useModules';
import { Permission } from '../../../hooks/admin/usePermissions';
import { CATEGORY_LABELS, ADMIN_ROLES } from '../../../constants/admin-constants';
import { getPermissionDetails } from '../../../constants/permission-descriptions';

interface ModulePermissionsViewProps {
  modules: Module[];
  permissions: Permission[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  roleHasPermission: (role: string, permCode: string) => boolean;
  selectedRole: string;
}

export default function ModulePermissionsView({
  modules = [],
  permissions = [],
  searchTerm,
  onSearchChange,
  roleHasPermission,
  selectedRole
}: ModulePermissionsViewProps) {
  // Group modules by category
  const groupedModules = (modules || []).reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  }, {} as Record<string, Module[]>);

  // Statistics
  const totalPermissions = permissions.length;
  const activeModules = (modules || []).filter(m => m.isActive).length;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card variant="default" padding="sm" className="bg-surface-base">
          <div className="flex flex-col">
             <span className="text-xs text-content-secondary uppercase tracking-wider font-semibold">Modules Actifs</span>
             <span className="text-2xl font-bold text-primary mt-1">{activeModules}</span>
          </div>
        </Card>
        <Card variant="default" padding="sm" className="bg-surface-base">
          <div className="flex flex-col">
             <span className="text-xs text-content-secondary uppercase tracking-wider font-semibold">Permissions</span>
             <span className="text-2xl font-bold text-primary mt-1">{totalPermissions}</span>
          </div>
        </Card>
      </div>

      <Card variant="default" padding="none" className="bg-surface-base overflow-hidden">
        <div className="p-4 border-b border-edge">
           <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center shrink-0 border border-cyan-500/20">
                       <Key size={20} className="text-cyan-400" />
                    </div>
                    <div>
                       <h3 className="font-bold text-content-primary">Catalogue Permissions</h3>
                       <p className="text-xs text-content-secondary">Vue d'ensemble des accès système</p>
                    </div>
                 </div>
              </div>

              <SearchInput
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher une permission..."
                onClear={() => onSearchChange('')}
                className="bg-surface-muted border-edge focus:ring-cyan-500/20"
              />
           </div>
        </div>

        <div className="p-2 sm:p-4 space-y-4 bg-surface-muted/30 min-h-[300px]">
           {Object.entries(groupedModules).map(([category, categoryModules]) => (
              <div key={category} className="space-y-2">
                 <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1 flex items-center gap-2 mt-2">
                    <Shield size={14} /> {CATEGORY_LABELS[category]}
                 </h4>

                 <div className="grid gap-3 md:grid-cols-2">
                    {categoryModules.map((module) => {
                       const modulePerms = permissions.filter(p => p.moduleId === module.id);
                       
                       return (
                          <div key={module.id} className="bg-surface-base border border-edge rounded-xl overflow-hidden shadow-sm">
                             <div className="px-3 py-2 border-b border-edge flex items-center justify-between bg-surface-muted/20">
                                <div className="flex items-center gap-2">
                                   <div className="w-6 h-6 rounded bg-cyan-500/10 flex items-center justify-center">
                                      <Shield size={14} className="text-cyan-400" />
                                   </div>
                                   <span className="text-sm font-semibold text-content-primary">{module.name}</span>
                                </div>
                                <span className="text-[10px] font-medium bg-surface-muted px-2 py-0.5 rounded-full text-content-secondary">
                                   {modulePerms.length} perms
                                </span>
                             </div>

                             <div className="p-2 space-y-2">
                                {modulePerms.map((perm) => {
                                   const rolesWithPermission = ADMIN_ROLES.filter(role => 
                                      roleHasPermission(role, perm.code)
                                   );

                                   return (
                                      <div key={perm.id} className="bg-surface-muted/30 rounded-lg p-2 border border-dashed border-edge">
                                         <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-medium text-content-primary">{perm.name}</span>
                                            <code className="text-[10px] text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                                               {perm.code}
                                            </code>
                                         </div>

                                         <div className="flex flex-wrap gap-1 mt-2">
                                            {rolesWithPermission.length > 0 ? (
                                               rolesWithPermission.map(role => (
                                                  <span key={role} className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                                                     {role}
                                                  </span>
                                               ))
                                            ) : (
                                               <span className="text-[9px] px-1.5 py-0.5 bg-slate-500/10 text-slate-500 rounded border border-slate-500/20">
                                                  Aucun rôle actif
                                               </span>
                                            )}
                                         </div>
                                      </div>
                                   );
                                })}
                             </div>
                          </div>
                       );
                    })}
                 </div>
              </div>
           ))}

           {searchTerm && permissions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                 <Search size={32} className="mb-2 opacity-50" />
                 <p className="text-sm">Aucune permission trouvée</p>
              </div>
           )}
        </div>
      </Card>
    </div>
  );
}
