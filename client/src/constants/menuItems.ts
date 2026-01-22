import {
  CalendarClock,
  LayoutDashboard,
  Users,
  Wallet,
  PiggyBank,
  CircleDollarSign,
  Banknote,
  MapPinned,
  ArrowLeftRight,
  BookOpen,
  FileBarChart,
  FileSpreadsheet,
  UsersRound,
  TrendingUp,
  Shield,
  MessageSquare,
  UserCircle,
  Undo2,
  BarChart3,
  CheckCircle,
} from 'lucide-react';
import { MenuItem } from '../types/layout';

export const PLATFORM_MENU_ITEMS: MenuItem[] = [
  // Principal
  { labelKey: 'menuDashboard', icon: LayoutDashboard, key: 'dashboard', section: 'principal' },

  // Services Clients
  { labelKey: 'menuClients', icon: Users, key: 'clients', section: 'services' },
  { labelKey: 'menuCredits', icon: Banknote, key: 'credits', section: 'services' },
  { labelKey: 'menuRemboursements', icon: Undo2, key: 'remboursements', section: 'services' },
  { labelKey: 'menuCompte', icon: PiggyBank, key: 'epargnes', section: 'services' },
  { labelKey: 'menuTontines', icon: CircleDollarSign, key: 'tontines', section: 'services' },

  // Opérations
  { labelKey: 'menuCaisse', icon: Wallet, key: 'caisse', section: 'operations' },
  { labelKey: 'menuAgentTerrain', icon: MapPinned, key: 'agentTerrain', section: 'operations' },
  { labelKey: 'menuValidations', icon: CheckCircle, key: 'agentValidations', section: 'operations' },
  { labelKey: 'menuTransfert', icon: ArrowLeftRight, key: 'transfert', section: 'operations' },
  { labelKey: 'menuCoffre', icon: Shield, key: 'coffre', section: 'operations' },
  { labelKey: 'menuVirementsProgrammes', icon: CalendarClock, key: 'virements_programmes', section: 'operations' },

  // Gestion
  { labelKey: 'menuComptabilite', icon: BookOpen, key: 'comptabilite', section: 'gestion' },
  { labelKey: 'menuRapports', icon: FileBarChart, key: 'rapports', section: 'gestion' },
  { labelKey: 'menuExcel', icon: FileSpreadsheet, key: 'excel', section: 'gestion' },
  { labelKey: 'menuRH', icon: UsersRound, key: 'rh', section: 'gestion' },
  { labelKey: 'menuBourse', icon: TrendingUp, key: 'bourse', section: 'gestion' },

  // Système
  { labelKey: 'menuAdministrateur', icon: Shield, key: 'administrateur', section: 'admin' },
  { labelKey: 'menuTresorerieSupervision', icon: BarChart3, key: 'tresorerie', section: 'admin' },
  { labelKey: 'menuMessages', icon: MessageSquare, key: 'messages', section: 'admin' },
  { labelKey: 'menuProfil', icon: UserCircle, key: 'profil', section: 'admin' },
];

export const RESTRICTED_AGENT_MODULES = new Set([
  'administrateur',
  'comptabilite',
  'rh',
  'bourse'
]);
