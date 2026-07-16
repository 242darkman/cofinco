import type { LucideIcon } from 'lucide-react';
import {
  MessageSquare,
  Users,
  Smartphone,
  MapPin,
  CreditCard,
  PiggyBank,
  Wallet,
  Shield,
  Landmark,
  ArrowLeftRight,
  CalendarClock,
  BookOpen,
  FileText,
  LineChart,
  Briefcase,
  LayoutGrid,
} from 'lucide-react';
import type { TenantBrandingKey, TenantFeatureKey } from '@shared/tenant-config';

/**
 * Libellés/icônes des flags tenant et des clés de branding, pilotés par l'écran
 * « Tenant & Modules ». Séparés du composant pour rester maintenables :
 * ajouter un module = une entrée ici (exhaustivité garantie par le type Record).
 */
export const FEATURE_LABELS: Record<TenantFeatureKey, { label: string; description: string; icon: LucideIcon }> = {
  enableSms: { label: 'SMS', description: 'Notifications et validations par SMS', icon: MessageSquare },
  enableTontine: { label: 'Tontines', description: 'Module tontines et contributions', icon: Users },
  enableMobileMoney: { label: 'Mobile Money', description: 'Paiements MTN MoMo / Airtel (pawaPay)', icon: Smartphone },
  enableFieldAgents: { label: 'Agents terrain', description: 'Prospection, tracking et paiements terrain', icon: MapPin },
  enableCredits: { label: 'Crédits', description: 'Octroi, décaissement et remboursements de crédit', icon: CreditCard },
  enableComptes: { label: 'Comptes / Épargne', description: "Comptes clients et opérations d'épargne", icon: PiggyBank },
  enableCaisse: { label: 'Caisse', description: 'Opérations de caisse, espèces et sessions', icon: Wallet },
  enableCoffreFort: { label: 'Coffre-Fort', description: 'Coffre, transferts inter-coffres et évacuations', icon: Shield },
  enableTresorerie: { label: 'Trésorerie', description: 'Pilotage de trésorerie', icon: Landmark },
  enableTransfert: { label: 'Transferts', description: "Transferts d'argent", icon: ArrowLeftRight },
  enableVirementsProgrammes: { label: 'Virements programmés', description: 'Virements récurrents planifiés', icon: CalendarClock },
  enableComptabilite: { label: 'Comptabilité', description: 'Journal, grand livre, balance (OHADA)', icon: BookOpen },
  enableRapports: { label: 'Rapports', description: 'Génération de rapports', icon: FileText },
  enableKpi: { label: 'KPI & Pilotage', description: 'Indicateurs et tableaux de pilotage', icon: LineChart },
  enableRH: { label: 'Ressources humaines', description: 'Personnel, congés, présence, paie et Mon Espace', icon: Briefcase },
  enableCartesPointage: { label: 'Cartes de Pointage', description: 'Épargne libre par cartes à 31 cases', icon: LayoutGrid },
};

export const BRANDING_LABELS: Record<TenantBrandingKey, { label: string; placeholder: string }> = {
  name: { label: "Nom de l'application", placeholder: 'MicroFlex' },
  primaryColor: { label: 'Couleur principale', placeholder: 'hsl(210, 100%, 45%)' },
  secondaryColor: { label: 'Couleur secondaire', placeholder: 'hsl(30, 90%, 50%)' },
  logoUrl: { label: 'URL du logo', placeholder: '/brand/microflex/logo.png' },
  faviconUrl: { label: 'URL du favicon', placeholder: '/favicon.ico' },
};
