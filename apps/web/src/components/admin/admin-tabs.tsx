import { lazy, useState, type ReactNode } from 'react';
import { Activity, MessageSquare } from 'lucide-react';
import type { TenantFeatureKey } from '@shared/tenant-config';

/**
 * SOURCE UNIQUE DE VÉRITÉ des onglets d'administration.
 *
 * Chaque onglet est défini une seule fois ici (identité, libellé, icône, URL,
 * permission, feature tenant, rendu). La navigation, le routage (URL) et le
 * rendu du contenu en dérivent — il n'existe aucune autre liste à maintenir.
 * Ajouter ou retirer un onglet = éditer ce seul tableau.
 *
 * Les composants sont chargés en `lazy` : le chunk admin reste léger et les
 * modules qui n'importent que les métadonnées (routage, permissions) ne tirent
 * pas le code des écrans.
 */

// ── Composants d'onglets (lazy) ──────────────────────────────────────────────
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminGestionProfils = lazy(() => import('./AdminGestionProfils'));
const AdminActivityLogs = lazy(() => import('./AdminActivityLogs'));
const AdminSessionsManager = lazy(() => import('./AdminSessionsManager'));
const AccessManagement = lazy(() => import('./AccessManagement'));
const AdminMaintenanceMode = lazy(() => import('./AdminMaintenanceMode'));
const AdminGestionCaisses = lazy(() => import('./AdminGestionCaisses'));
const AdminCreditsGestion = lazy(() => import('./AdminCreditsGestion'));
const AdminTontinesGestion = lazy(() => import('./AdminTontinesGestion'));
const AdminGestionAgences = lazy(() => import('./AdminGestionAgences'));
const AdminGestionZones = lazy(() => import('./AdminGestionZones'));
const AdminVersionInfo = lazy(() => import('./AdminVersionInfo'));
const AdminCaisseAccessCodes = lazy(() => import('./AdminCaisseAccessCodes'));
const RegularizationDashboard = lazy(() => import('./RegularizationDashboard'));
const AdminClientCredentials = lazy(() => import('./AdminClientCredentials'));
const AdminProductRates = lazy(() => import('./AdminProductRates'));
const ZoneManagement = lazy(() => import('./ZoneManagement'));
const AdminPaymentMethodToggles = lazy(() => import('./AdminPaymentMethodToggles'));
const AdminCurrencySettings = lazy(() => import('./AdminCurrencySettings'));
const AdminCompanyInfoSettings = lazy(() => import('./AdminCompanyInfoSettings'));
const AdminTenantSettings = lazy(() => import('./AdminTenantSettings'));
const AdminAgencyReset = lazy(() => import('./AdminAgencyReset'));
const AdminScoring = lazy(() => import('./AdminScoring'));
const AdminSyncPanel = lazy(() => import('./AdminSyncPanel'));
const AdminNotificationsMonitor = lazy(() => import('./AdminNotificationsMonitor'));
const NotificationTemplatesAdmin = lazy(() => import('./notifications/NotificationTemplatesAdmin'));

/** Contexte transmis au rendu d'un onglet (actions transverses). */
export interface AdminTabContext {
  /** Retour au tableau de bord admin (ex. fermeture d'un écran). */
  goToDashboard: () => void;
}

/** Définition d'un onglet d'administration. */
export interface AdminTab {
  /** Identifiant unique = sous-module d'URL. */
  id: string;
  /** Libellé affiché (navigation + titre de section). */
  label: string;
  /** Clé d'icône (résolue vers une icône lucide dans l'en-tête). */
  icon: string;
  /** Chemin URL réel de l'onglet. */
  path: string;
  /** Permission CASL requise (optionnelle). */
  permission?: string;
  /** Feature tenant : l'onglet est masqué/inaccessible si elle est désactivée. */
  feature?: TenantFeatureKey;
  /** Rendu du contenu de l'onglet. */
  render: (ctx: AdminTabContext) => ReactNode;
}

/** Section Notifications : sous-onglets Monitoring / Templates. */
function NotificationsSection() {
  const [notifView, setNotifView] = useState<'monitor' | 'templates'>('monitor');

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center gap-4 border-b border-edge pb-2 shrink-0">
        <span className="text-sm text-content-muted font-medium">Vue :</span>
        <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
          <button
            onClick={() => setNotifView('monitor')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              notifView === 'monitor'
                ? 'bg-surface text-content-primary'
                : 'text-content-muted hover:text-content-primary'
            }`}
          >
            <Activity size={14} />
            Monitoring
          </button>
          <button
            onClick={() => setNotifView('templates')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              notifView === 'templates'
                ? 'bg-surface text-content-primary'
                : 'text-content-muted hover:text-content-primary'
            }`}
          >
            <MessageSquare size={14} />
            Templates
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {notifView === 'monitor' && <AdminNotificationsMonitor />}
        {notifView === 'templates' && <NotificationTemplatesAdmin />}
      </div>
    </div>
  );
}

export const ADMIN_TABS: AdminTab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', path: '/administration/dashboard', permission: 'dashboard.view', render: () => <AdminDashboard /> },
  { id: 'profils', label: 'Personnel', icon: 'Award', path: '/administration/personnel', permission: 'rh.view', feature: 'enableRH', render: () => <AdminGestionProfils /> },
  { id: 'logs', label: 'Logs', icon: 'Activity', path: '/administration/logs', permission: 'admin.logs', render: () => <AdminActivityLogs /> },
  { id: 'sessions', label: 'Sessions', icon: 'Monitor', path: '/administration/sessions', permission: 'admin.settings', render: () => <AdminSessionsManager /> },
  { id: 'roles', label: 'Gestion des Accès', icon: 'Shield', path: '/administration/acces', permission: 'admin.roles', render: () => <AccessManagement /> },
  { id: 'maintenance', label: 'Maintenance', icon: 'Power', path: '/administration/maintenance', permission: 'admin.settings', render: () => <AdminMaintenanceMode /> },
  { id: 'caisses', label: 'Caisses', icon: 'Wallet', path: '/administration/caisses', permission: 'caisse.manage', feature: 'enableCaisse', render: () => <AdminGestionCaisses /> },
  { id: 'credits', label: 'Crédits', icon: 'CreditCard', path: '/administration/credits', permission: 'credits.view', feature: 'enableCredits', render: () => <AdminCreditsGestion /> },
  { id: 'tontines', label: 'Tontines', icon: 'Users', path: '/administration/tontines', permission: 'tontines.manage', feature: 'enableTontine', render: () => <AdminTontinesGestion /> },
  { id: 'agences', label: 'Agences', icon: 'Building2', path: '/administration/agences', permission: 'admin.settings', render: () => <AdminGestionAgences /> },
  { id: 'zones', label: 'Zones', icon: 'MapPin', path: '/administration/zones', permission: 'admin.settings', render: () => <AdminGestionZones /> },
  { id: 'notifications', label: 'Notifications', icon: 'MessageSquare', path: '/administration/notifications', permission: 'admin.settings', render: () => <NotificationsSection /> },
  { id: 'updates', label: 'Version', icon: 'Package', path: '/administration/version', permission: 'admin.settings', render: () => <AdminVersionInfo /> },
  { id: 'codes', label: 'Codes Caisse', icon: 'KeyRound', path: '/administration/codes-caisse', permission: 'caisse.manage', feature: 'enableCaisse', render: (ctx) => <AdminCaisseAccessCodes onClose={ctx.goToDashboard} /> },
  { id: 'regularisation', label: 'Régularisation', icon: 'AlertTriangle', path: '/administration/regularisation', permission: 'admin.manage', render: () => <RegularizationDashboard /> },
  { id: 'client-credentials', label: 'Accès Clients', icon: 'Key', path: '/administration/acces-clients', permission: 'admin.manage', render: () => <AdminClientCredentials /> },
  { id: 'product-rates', label: 'Taux Produits', icon: 'Percent', path: '/administration/taux-produits', permission: 'admin.manage', feature: 'enableCredits', render: () => <AdminProductRates /> },
  { id: 'zones-commerciales', label: 'Arrondissements & Marchés', icon: 'MapPin', path: '/administration/zones-commerciales', permission: 'zones.view', render: () => <ZoneManagement /> },
  { id: 'payment-methods', label: 'Paiements', icon: 'CreditCard', path: '/administration/paiements', permission: 'admin.settings', render: () => <AdminPaymentMethodToggles /> },
  { id: 'currency', label: 'Devise', icon: 'Coins', path: '/administration/devise', permission: 'admin.settings', render: () => <AdminCurrencySettings /> },
  { id: 'company-info', label: 'Société', icon: 'Building2', path: '/administration/societe', permission: 'admin.settings', render: () => <AdminCompanyInfoSettings /> },
  { id: 'tenant', label: 'Tenant & Modules', icon: 'Settings', path: '/administration/tenant', permission: 'admin.settings', render: () => <AdminTenantSettings /> },
  { id: 'reset-agence', label: 'Reset Agence', icon: 'RotateCcw', path: '/administration/reset-agence', permission: 'admin.manage', render: () => <AdminAgencyReset /> },
  { id: 'scoring', label: 'Scoring', icon: 'BarChart3', path: '/administration/scoring', permission: 'loyalty.view', feature: 'enableCredits', render: () => <AdminScoring /> },
  { id: 'sync', label: 'Synchronisation', icon: 'CloudUpload', path: '/administration/sync', permission: 'admin.settings', render: () => <AdminSyncPanel /> },
];


/**
 * Map id → feature tenant, dérivée de `ADMIN_TABS` (aucune liste séparée).
 * Sert aux gardes d'accès (nav + routage).
 */
export const ADMIN_TAB_TENANT_FEATURE: Record<string, TenantFeatureKey> = Object.fromEntries(
  ADMIN_TABS.filter((t) => t.feature).map((t) => [t.id, t.feature as TenantFeatureKey]),
);

/**
 * Sous-routes d'administration dérivées de `ADMIN_TABS` (données pures :
 * chemin/sous-module/libellé), consommées par la configuration de routage.
 */
export const ADMIN_SUBROUTES = ADMIN_TABS.map((t) => ({
  path: t.path,
  subModule: t.id,
  label: t.label,
}));

/** Retrouve un onglet par son identifiant. */
export function getAdminTab(id: string): AdminTab | undefined {
  return ADMIN_TABS.find((t) => t.id === id);
}
