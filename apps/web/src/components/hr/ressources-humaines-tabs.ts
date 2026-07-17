/**
 * Configuration des onglets du module Ressources Humaines.
 */

import { Users, Calendar, UserPlus, AlertTriangle, Gift, GraduationCap, ClipboardCheck, Building2, FileText, BarChart3, Star, Briefcase, FileBarChart, FolderOpen, Clock, Crown } from 'lucide-react';

export const TABS = [
  { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { key: 'list', label: 'Liste', icon: Users },
  { key: 'presence', label: 'Présence', icon: ClipboardCheck },
  { key: 'conges', label: 'Congés', icon: Calendar },
  { key: 'formations', label: 'Formations', icon: GraduationCap },
  { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle },
  { key: 'avantages', label: 'Avantages & Primes', icon: Gift },
  { key: 'paie', label: 'Paie & Docs', icon: FileText },
  { key: 'evaluations', label: 'Évaluations', icon: Star },
  { key: 'postes', label: 'Postes', icon: Briefcase },
  { key: 'recrutement', label: 'Recrutement', icon: UserPlus },
  { key: 'rapports', label: 'Rapports', icon: FileBarChart },
  { key: 'temps-projet', label: 'Temps Projet', icon: Clock },
  { key: 'mes-documents', label: 'Documents', icon: FolderOpen },
  { key: 'organigramme', label: 'Organigramme', icon: Building2 },
  { key: 'direction-generale', label: 'Direction', icon: Crown }
];

export type TabKey = typeof TABS[number]['key'];
