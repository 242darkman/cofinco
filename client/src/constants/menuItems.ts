import {
  Home,
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  Settings,
  RefreshCw,
  HandCoins,
  Briefcase,
  Calculator,
  FileDown,
  Send,
  MessageCircle,
  UserCircle,
  PiggyBank,
  MapPin
} from 'lucide-react';
import { MenuItem } from '../types/layout';

export const PLATFORM_MENU_ITEMS: MenuItem[] = [
  { labelKey: 'menuDashboard', icon: Home, key: 'dashboard', section: 'principal' },
  { labelKey: 'menuClients', icon: Users, key: 'clients', section: 'principal' },
  { labelKey: 'menuTontines', icon: RefreshCw, key: 'tontines', section: 'principal' },
  { labelKey: 'menuCredits', icon: HandCoins, key: 'credits', section: 'principal' },
  { labelKey: 'menuEpargnes', icon: PiggyBank, key: 'epargnes', section: 'principal' },
  { labelKey: 'menuAgentTerrain', icon: MapPin, key: 'agentTerrain', section: 'principal' },
  { labelKey: 'menuCaisse', icon: DollarSign, key: 'caisse', section: 'principal' },
  { labelKey: 'menuTransfert', icon: Send, key: 'transfert', section: 'principal' },
  { labelKey: 'menuBourse', icon: TrendingUp, key: 'bourse', section: 'principal' },
  { labelKey: 'menuRH', icon: Briefcase, key: 'rh', section: 'gestion' },
  { labelKey: 'menuComptabilite', icon: Calculator, key: 'comptabilite', section: 'gestion' },
  { labelKey: 'menuExcel', icon: FileDown, key: 'excel', section: 'gestion' },
  { labelKey: 'menuRapports', icon: FileText, key: 'rapports', section: 'principal' },
  { labelKey: 'menuMessages', icon: MessageCircle, key: 'messages', section: 'principal' },
  { labelKey: 'menuProfil', icon: UserCircle, key: 'profil', section: 'principal' },
  { labelKey: 'menuParametres', icon: Settings, key: 'parametres', section: 'admin' },
  { labelKey: 'menuAdministrateur', icon: Users, key: 'administrateur', section: 'admin' },
];

export const RESTRICTED_AGENT_MODULES = new Set([
  'administrateur',
  'comptabilite',
  'rh',
  'bourse',
  'parametres'
]);
