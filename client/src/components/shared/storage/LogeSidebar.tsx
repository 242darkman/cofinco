import React from 'react';
import { Home, Folder, FileText, Database, HardDrive, Archive, File } from 'lucide-react';
import { LogeStats } from '@/hooks/useLoge';

interface LogeSidebarProps {
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  stats: LogeStats | null;
}

export const categories = [
  { id: 'general', label: 'Général', icon: Folder, color: 'text-content-muted' },
  { id: 'credits', label: 'Crédits', icon: FileText, color: 'text-status-info' },
  { id: 'clients', label: 'Clients', icon: Database, color: 'text-status-success' },
  { id: 'epargnes', label: 'Épargnes', icon: HardDrive, color: 'text-status-info' },
  { id: 'tontines', label: 'Tontines', icon: Archive, color: 'text-status-warning' },
  { id: 'comptabilite', label: 'Comptabilité', icon: FileText, color: 'text-status-danger' },
  { id: 'rapports', label: 'Rapports', icon: File, color: 'text-accent' },
];

export default function LogeSidebar({ selectedCategory, onSelectCategory, stats }: LogeSidebarProps) {
  return (
    <div className="bg-surface rounded-xl shadow-lg border border-edge p-4">
      <h3 className="text-sm font-semibold text-content-muted mb-3 uppercase tracking-wide">Catégories</h3>
      <ul className="space-y-1">
        <li>
          <button
            onClick={() => onSelectCategory(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
              !selectedCategory ? 'bg-status-info-bg text-status-info' : 'hover:bg-surface-muted-elevated text-content-muted'
            }`}
          >
            <Home className="w-4 h-4" />
            Tous les fichiers
          </button>
        </li>
        {categories.map(cat => (
          <li key={cat.id}>
            <button
              onClick={() => onSelectCategory(cat.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                selectedCategory === cat.id ? 'bg-status-info-bg text-status-info' : 'hover:bg-surface-muted-elevated text-content-muted'
              }`}
            >
              <cat.icon className={`w-4 h-4 ${cat.color}`} />
              {cat.label}
              {stats?.byCategorie[cat.id] && (
                <span className="ml-auto text-xs bg-surface-subtle-subtle px-2 py-0.5 rounded-full">
                  {stats.byCategorie[cat.id]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
