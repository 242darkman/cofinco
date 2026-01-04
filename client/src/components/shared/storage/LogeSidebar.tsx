import React from 'react';
import { Home, Folder, FileText, Database, HardDrive, Archive, File } from 'lucide-react';
import { LogeStats } from '@/hooks/useLoge';

interface LogeSidebarProps {
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  stats: LogeStats | null;
}

export const categories = [
  { id: 'general', label: 'Général', icon: Folder, color: 'text-gray-500' },
  { id: 'credits', label: 'Crédits', icon: FileText, color: 'text-blue-500' },
  { id: 'clients', label: 'Clients', icon: Database, color: 'text-green-500' },
  { id: 'epargnes', label: 'Épargnes', icon: HardDrive, color: 'text-purple-500' },
  { id: 'tontines', label: 'Tontines', icon: Archive, color: 'text-orange-500' },
  { id: 'comptabilite', label: 'Comptabilité', icon: FileText, color: 'text-red-500' },
  { id: 'rapports', label: 'Rapports', icon: File, color: 'text-cyan-500' },
];

export default function LogeSidebar({ selectedCategory, onSelectCategory, stats }: LogeSidebarProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Catégories</h3>
      <ul className="space-y-1">
        <li>
          <button
            onClick={() => onSelectCategory(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
              !selectedCategory ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
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
                selectedCategory === cat.id ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <cat.icon className={`w-4 h-4 ${cat.color}`} />
              {cat.label}
              {stats?.byCategorie[cat.id] && (
                <span className="ml-auto text-xs bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">
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
