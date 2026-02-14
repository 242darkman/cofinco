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
      <div className="bg-surface rounded-xl p-4 shadow-lg border border-edge">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-info-bg rounded-lg">
            <Database className="w-5 h-5 text-status-info" />
          </div>
          <div>
            <p className="text-sm text-content-muted">Total Documents</p>
            <p className="text-xl font-bold text-content-primary">{stats.totalDocuments}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-surface rounded-xl p-4 shadow-lg border border-edge">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-success-bg rounded-lg">
            <HardDrive className="w-5 h-5 text-status-success" />
          </div>
          <div>
            <p className="text-sm text-content-muted">Espace utilisé</p>
            <p className="text-xl font-bold text-content-primary">{formatFileSize(stats.quotaUtilise)}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-surface rounded-xl p-4 shadow-lg border border-edge">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-info-bg rounded-lg">
            <Cloud className="w-5 h-5 text-status-info" />
          </div>
          <div>
            <p className="text-sm text-content-muted">Quota total</p>
            <p className="text-xl font-bold text-content-primary">{formatFileSize(stats.quotaTotal)}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-surface rounded-xl p-4 shadow-lg border border-edge">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-warning-bg rounded-lg">
            <AlertCircle className="w-5 h-5 text-status-warning" />
          </div>
          <div>
            <p className="text-sm text-content-muted">Utilisation</p>
            <p className="text-xl font-bold text-content-primary">{stats.pourcentageUtilise}%</p>
          </div>
        </div>
        <div className="mt-2 h-2 bg-surface-subtle-elevated rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-status-info to-accent rounded-full transition-all"
            style={{ width: `${Math.min(parseFloat(stats.pourcentageUtilise), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
