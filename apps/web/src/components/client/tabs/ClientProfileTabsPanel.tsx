/**
 * Panneau des onglets de la fiche client (extrait de ClientModule pour
 * respecter le cliquet de taille — AGENTS.md §7).
 *
 * Regroupe la barre d'onglets et le rendu du contenu actif, dont l'onglet
 * « Cartes de Pointage » (visible selon la permission CASL du module).
 */

import React from 'react';
import {
  LayoutDashboard, User, Phone, Scale, Network, CreditCard, Shield,
  Edit2, DollarSign, FileSearch, AlertCircle, TrendingUp, LayoutGrid,
} from 'lucide-react';
import { TabGroup } from '../../ui';
import { useCan } from '@/contexts/AbilityContext';
import { Actions, Subjects } from '@shared/ability';
import ClientOverviewTab from './ClientOverviewTab';
import ClientProfileTab from './ClientProfileTab';
import ClientContactTab from './ClientContactTab';
import ClientKycLegalTab from './ClientKycLegalTab';
import ClientReferencesTab from './ClientReferencesTab';
import ClientScoreTab from './ClientScoreTab';
import ClientEnquetesTab from './ClientEnquetesTab';
import ClientAccounts from '../ClientAccounts';
import ClientKYC from '../ClientKYC';
import ClientNotes from '../ClientNotes';
import ClientGlobalHistory from '../ClientGlobalHistory';
import ClientAlerts from '../ClientAlerts';
import CartesPointage from '../../finance/carte-pointage/CartesPointage';

/** Identifiants d'onglets valides de la fiche client (source de vérité). */
export const CLIENT_TAB_IDS = [
  'overview', 'profil', 'coordonnees', 'kyc-legal', 'references', 'comptes',
  'kyc', 'notes', 'transactions', 'enquetes', 'alertes', 'score', 'cartes-pointage',
] as const;

interface ClientProfileTabsPanelProps {
  client: any;
  activeTab: string;
  alertCount: number;
  onNavigateToTab: (tab: string) => void;
  onClientsReload: () => void;
}

export default function ClientProfileTabsPanel({
  client,
  activeTab,
  alertCount,
  onNavigateToTab,
  onClientsReload,
}: ClientProfileTabsPanelProps) {
  const canViewCartes = useCan(Actions.VIEW, Subjects.CARTE_POINTAGE);

  return (
    <>
      {/* Barre d'onglets */}
      <TabGroup
        activeTab={activeTab}
        onTabChange={onNavigateToTab}
        variant="underline"
        size="sm"
        tabs={[
          { key: 'overview', label: 'Vue d\'ensemble', icon: LayoutDashboard },
          { key: 'profil', label: 'Profil', icon: User },
          { key: 'coordonnees', label: 'Coordonnées', icon: Phone },
          { key: 'kyc-legal', label: 'Dossier KYC', icon: Scale },
          { key: 'references', label: 'Références', icon: Network },
          { key: 'comptes', label: 'Comptes', icon: CreditCard },
          ...(canViewCartes ? [{ key: 'cartes-pointage', label: 'Cartes de Pointage', icon: LayoutGrid }] : []),
          { key: 'kyc', label: 'Documents KYC', icon: Shield },
          { key: 'notes', label: 'Notes', icon: Edit2 },
          { key: 'transactions', label: 'Transactions', icon: DollarSign },
          { key: 'enquetes', label: 'Enquêtes', icon: FileSearch },
          { key: 'alertes', label: 'Alertes', icon: AlertCircle, badge: alertCount > 0 ? alertCount : undefined, badgeClassName: alertCount > 0 ? 'bg-status-danger text-white' : undefined },
          { key: 'score', label: 'Score', icon: TrendingUp },
        ]}
      />

      {/* Contenu de l'onglet actif */}
      <div className="min-h-[400px] mt-4">
        {activeTab === 'overview' && <ClientOverviewTab client={client} onNavigateToTab={onNavigateToTab} />}
        {activeTab === 'profil' && <ClientProfileTab client={client} />}
        {activeTab === 'coordonnees' && <ClientContactTab client={client} />}
        {activeTab === 'kyc-legal' && <ClientKycLegalTab client={client} />}
        {activeTab === 'references' && <ClientReferencesTab client={client} />}
        {activeTab === 'comptes' && <ClientAccounts clientId={client.id} />}
        {activeTab === 'cartes-pointage' && canViewCartes && <CartesPointage clientId={client.id} embedded />}
        {activeTab === 'kyc' && <ClientKYC clientId={client.id} onUpdate={onClientsReload} />}
        {activeTab === 'notes' && <ClientNotes clientId={client.id} />}
        {activeTab === 'transactions' && <ClientGlobalHistory clientId={client.id} />}
        {activeTab === 'enquetes' && <ClientEnquetesTab client={client} />}
        {activeTab === 'alertes' && <ClientAlerts client={client} onUpdate={onClientsReload} onNavigateToTab={onNavigateToTab} />}
        {activeTab === 'score' && <ClientScoreTab client={client} />}
      </div>
    </>
  );
}
