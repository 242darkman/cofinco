/**
 * Quick Actions Search Provider
 *
 * Client-side provider for quick actions (create, open, etc.).
 * Each action has a CASL permission check.
 */

import {
  UserPlus, FilePlus, PlusCircle, Landmark,
  ArrowDownToLine, ArrowUpFromLine, FileText,
  Download, UserCog,
} from 'lucide-react';
import { Actions, Subjects } from '@shared/ability';
import { scoreResult } from '../engine';
import type { SearchProvider, SearchResult, SearchContext } from '../types';

const ACTION_ITEMS: SearchResult[] = [
  {
    id: 'action-nouveau-client',
    title: 'Nouveau client',
    keywords: ['créer client', 'ajouter client', 'inscription', 'new client'],
    group: 'Actions rapides',
    icon: UserPlus,
    iconBg: 'bg-status-info-bg text-status-info',
    type: 'action',
    moduleKey: 'clients',
    subModule: 'new',
    permission: { action: Actions.CREATE, subject: Subjects.CLIENT },
  },
  {
    id: 'action-nouveau-credit',
    title: 'Nouvelle demande de crédit',
    keywords: ['créer crédit', 'nouveau prêt', 'demande prêt', 'new loan'],
    group: 'Actions rapides',
    icon: FilePlus,
    iconBg: 'bg-status-success-bg text-status-success',
    type: 'action',
    moduleKey: 'credits',
    subModule: 'demandes',
    permission: { action: Actions.CREATE, subject: Subjects.DEMANDE_CREDIT },
  },
  {
    id: 'action-nouveau-compte',
    title: 'Nouveau compte',
    keywords: ['créer compte', 'ouvrir compte', 'nouveau compte épargne'],
    group: 'Actions rapides',
    icon: PlusCircle,
    iconBg: 'bg-status-info-bg text-status-info',
    type: 'action',
    moduleKey: 'epargnes',
    permission: { action: Actions.CREATE, subject: Subjects.COMPTE },
  },
  {
    id: 'action-nouvelle-tontine',
    title: 'Nouvelle tontine',
    keywords: ['créer tontine', 'nouveau groupe', 'ROSCA'],
    group: 'Actions rapides',
    icon: PlusCircle,
    iconBg: 'bg-status-warning-bg text-status-warning',
    type: 'action',
    moduleKey: 'tontines',
    permission: { action: Actions.CREATE, subject: Subjects.TONTINE },
  },
  {
    id: 'action-ouvrir-caisse',
    title: 'Ouvrir session caisse',
    keywords: ['ouvrir caisse', 'démarrer caisse', 'session caisse'],
    group: 'Actions rapides',
    icon: Landmark,
    iconBg: 'bg-accent/10 text-accent',
    type: 'action',
    moduleKey: 'caisse',
    permission: { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  },
  {
    id: 'action-versement',
    title: 'Effectuer un versement',
    keywords: ['déposer', 'encaisser', 'versement espèces', 'deposit'],
    group: 'Actions rapides',
    icon: ArrowDownToLine,
    iconBg: 'bg-status-success-bg text-status-success',
    type: 'action',
    moduleKey: 'caisse',
    subModule: 'operations',
    permission: { action: Actions.DEPOSIT, subject: Subjects.CAISSE_OPERATION },
  },
  {
    id: 'action-retrait',
    title: 'Effectuer un retrait',
    keywords: ['retirer', 'décaisser', 'retrait espèces', 'withdraw'],
    group: 'Actions rapides',
    icon: ArrowUpFromLine,
    iconBg: 'bg-status-danger-bg text-status-danger',
    type: 'action',
    moduleKey: 'caisse',
    subModule: 'operations',
    permission: { action: Actions.WITHDRAW, subject: Subjects.CAISSE_OPERATION },
  },
  {
    id: 'action-generer-rapport',
    title: 'Générer un rapport',
    keywords: ['rapport', 'reporting', 'export rapport', 'generate report'],
    group: 'Actions rapides',
    icon: FileText,
    iconBg: 'bg-accent/10 text-accent',
    type: 'action',
    moduleKey: 'rapports',
    permission: { action: Actions.VIEW, subject: Subjects.RAPPORTS },
  },
  {
    id: 'action-exporter-clients',
    title: 'Exporter les clients',
    keywords: ['export clients', 'télécharger', 'CSV', 'Excel'],
    group: 'Actions rapides',
    icon: Download,
    iconBg: 'bg-status-info-bg text-status-info',
    type: 'action',
    moduleKey: 'clients',
    permission: { action: Actions.EXPORT, subject: Subjects.CLIENT },
  },
  {
    id: 'action-ajouter-employe',
    title: 'Ajouter un employé',
    keywords: ['nouveau employé', 'embaucher', 'recruter'],
    group: 'Actions rapides',
    icon: UserCog,
    iconBg: 'bg-status-warning-bg text-status-warning',
    type: 'action',
    moduleKey: 'rh',
    subModule: 'list',
    permission: { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  },
];

export const actionsProvider: SearchProvider = {
  id: 'actions',
  label: 'Actions rapides',
  icon: FilePlus,
  iconBg: 'bg-status-success-bg text-status-success',
  priority: 2,
  mode: 'client',

  async search(query: string, ctx: SearchContext): Promise<SearchResult[]> {
    if (query.length < 1) return [];

    return ACTION_ITEMS
      .map((item) => ({ ...item, score: scoreResult(query, item) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  },
};
