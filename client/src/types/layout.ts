import { LucideIcon } from 'lucide-react';

export interface MenuItem {
  labelKey: string;
  icon: LucideIcon;
  key: string;
  section: 'principal' | 'gestion' | 'admin';
}

export interface User {
  nom?: string;
  email?: string;
  role?: string;
}

export interface Breadcrumb {
  label: string;
  path?: string;
}
