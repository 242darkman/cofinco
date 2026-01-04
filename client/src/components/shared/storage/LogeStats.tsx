import React from 'react';
import { Database, HardDrive, Cloud, AlertCircle } from 'lucide-react';
import { LogeStats as LogeStatsType, formatFileSize } from '@/hooks/useLoge';

interface LogeStatsProps {
  stats: LogeStatsType | null;
}

export default function LogeStats({ stats }: LogeStatsProps) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Database className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Documents</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.totalDocuments}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <HardDrive className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Espace utilisé</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">{formatFileSize(stats.quotaUtilise)}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Cloud className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Quota total</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">{formatFileSize(stats.quotaTotal)}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Utilisation</p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.pourcentageUtilise}%</p>
          </div>
        </div>
        <div className="mt-2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all"
            style={{ width: `${Math.min(parseFloat(stats.pourcentageUtilise), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
