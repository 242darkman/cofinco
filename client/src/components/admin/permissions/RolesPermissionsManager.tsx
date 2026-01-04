import React from 'react';
import { Shield, Award, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, SelectField } from '../../ui';
import { Module } from '../../../hooks/admin/useModules';
import { Permission } from '../../../hooks/admin/usePermissions';
import { ADMIN_ROLES, ROLE_COLORS, CATEGORY_LABELS } from '../../../constants/admin-constants';
import { getPermissionDetails } from '../../../constants/permission-descriptions';

interface RolesPermissionsManagerProps {
  modules: Module[];
  permissions: Permission[];
  selectedRole: string;
  onRoleChange: (role: string) => void;
  roleHasPermission: (role: string, permCode: string) => boolean;
  toggleRolePermission: (role: string, permCode: string) => void;
  activePermissionsCount: number;
  confirmMessage?: string;
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
  // Group modules by category
  const groupedModules = (modules || []).reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  }, {} as Record<string, Module[]>);

  const roleOptions = ADMIN_ROLES.map(role => ({ value: role, label: role }));

  return (
    <div className="space-y-4">
      <Card variant="default" padding="sm" className="bg-surface-base">
        <div className="flex flex-col gap-4">
           {/* Header & Role Selector */}
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-edge pb-4 mb-2">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Shield size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-content-primary">Gestion des Rôles</h3>
                  <p className="text-xs text-content-secondary line-clamp-1">Permissions et accès ({activePermissionsCount} actives)</p>
                </div>
             </div>

             <div className="w-full sm:w-64">
                <SelectField
                  label=""
                  name="role"
                  value={selectedRole}
                  onChange={(e) => onRoleChange(e.target.value)}
                  options={roleOptions}
                  className="bg-slate-800 border-slate-700 text-white focus:border-primary focus:ring-primary/20"
                />
             </div>
           </div>

           {/* Info Banner */}
           <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex gap-3">
             <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
             <div className="space-y-1">
               <p className="text-xs text-blue-300/90 leading-relaxed">
                 <strong>Liaison active :</strong> Les modifications affectent immédiatement tous les utilisateurs ayant ce rôle.
               </p>
             </div>
           </div>

           {/* Confirm Message */}
           {confirmMessage && (
             <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
               <CheckCircle size={16} className="text-emerald-400 shrink-0" />
               <span className="text-xs font-medium text-emerald-400">{confirmMessage}</span>
             </div>
           )}

           {/* Permissions Grid */}
           <div className="space-y-4 mt-2">
              {Object.entries(groupedModules).map(([category, categoryModules]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider pl-1 flex items-center gap-2">
                     <Award size={14} /> {CATEGORY_LABELS[category]}
                  </h4>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {categoryModules.map((module) => {
                       const modulePerms = permissions.filter(p => p.moduleId === module.id);
                       const grantedCount = modulePerms.filter(p => roleHasPermission(selectedRole, p.code)).length;
                       const allGranted = grantedCount === modulePerms.length && modulePerms.length > 0;

                       return (
                         <div key={module.id} className="bg-surface-muted/30 border border-edge rounded-xl overflow-hidden">
                           <div className="bg-surface-base px-3 py-2 border-b border-edge flex items-center justify-between">
                              <span className="text-sm font-semibold text-content-primary flex items-center gap-2">
                                {allGranted && <CheckCircle size={14} className="text-emerald-400" />}
                                {module.name}
                              </span>
                              <span className="text-[10px] font-medium bg-surface-muted px-2 py-0.5 rounded-full text-content-secondary">
                                {grantedCount}/{modulePerms.length}
                              </span>
                           </div>

                           <div className="p-1">
                             {modulePerms.map((perm) => {
                               const isGranted = roleHasPermission(selectedRole, perm.code);
                               return (
                                 <div 
                                   key={perm.id}
                                   onClick={() => toggleRolePermission(selectedRole, perm.code)}
                                   className={`
                                     flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border mb-1 last:mb-0
                                     ${isGranted 
                                       ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10' 
                                       : 'bg-transparent border-transparent hover:bg-surface-muted border-dashed hover:border-edge'
                                     }
                                   `}
                                 >
                                   <div className="flex items-center gap-2 overflow-hidden">
                                     <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isGranted ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                     <span className={`text-xs truncate ${isGranted ? 'text-content-primary font-medium' : 'text-content-muted'}`}>
                                       {perm.name}
                                     </span>
                                   </div>
                                   
                                   {/* Toggle Switch Visual */}
                                   <div className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${isGranted ? 'bg-emerald-500' : 'bg-slate-600/50'}`}>
                                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${isGranted ? 'left-4.5' : 'left-0.5'}`} style={{ left: isGranted ? 'calc(100% - 14px)' : '2px' }} />
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
           </div>
        </div>
      </Card>
    </div>
  );
}
