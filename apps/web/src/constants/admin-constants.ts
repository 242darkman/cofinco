/**
 * Constantes pour le module Admin
 */
import { SystemRole } from '@shared/types/roles';

export const ADMIN_ROLES = [
  SystemRole.ADMIN,
  SystemRole.CHEF_AGENCE,
  SystemRole.CAISSIER,
  SystemRole.AGENT_TERRAIN,
  SystemRole.COMPTABLE,
  SystemRole.GESTIONNAIRE_CREDIT,
  SystemRole.SUPERVISEUR
] as const;

export type AdminRole = typeof ADMIN_ROLES[number];

export const ROLE_COLORS: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.CHEF_AGENCE]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.CAISSIER]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.AGENT_TERRAIN]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.COMPTABLE]: 'bg-accent/10 text-accent border-accent/30',
  [SystemRole.GESTIONNAIRE_CREDIT]: 'bg-accent/10 text-accent border-accent/30',
  [SystemRole.SUPERVISEUR]: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
  [SystemRole.AUDITEUR]: 'bg-status-warning-bg text-status-warning border-status-warning/30',
  [SystemRole.RH]: 'bg-status-success-bg text-status-success border-status-success/30',
  [SystemRole.SUPPORT_IT]: 'bg-status-info-bg text-status-info border-status-info/30',
  [SystemRole.CLIENT]: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
};

export const CATEGORY_LABELS: Record<string, string> = {
  'principal': 'Modules Principaux',
  'gestion': 'Gestion',
  'Administrateur': 'Administration'
};

/**
 * Onglets d'administration : la SOURCE UNIQUE de vérité vit désormais dans
 * `components/admin/admin-tabs.tsx` (métadonnées + URL + rendu). On re-exporte
 * ici pour ne pas casser les imports existants (vues/hook de permissions).
 */
export {
  ADMIN_TABS,
  ADMIN_TAB_TENANT_FEATURE,
  ADMIN_SUBROUTES,
  getAdminTab,
  type AdminTab,
} from '@/components/admin/admin-tabs';
