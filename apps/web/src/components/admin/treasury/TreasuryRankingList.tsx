import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { formatMoney } from '@shared/config/currency';
import { cn } from '@/lib/utils';
import type { RankingEntry } from './treasury-helpers';

interface Props {
  ranking: RankingEntry[];
  onToggleAgency: (id: string) => void;
  selectedAgencies: string[];
}

export default function TreasuryRankingList({ ranking, onToggleAgency, selectedAgencies }: Props) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="divide-y divide-edge dark:divide-slate-800">
        {ranking.map((agency, index) => {
          const isSelected = selectedAgencies.includes(agency.agenceId);
          const isCritical = agency.solde < 100000; // Example threshold for critical state

          return (
            <div 
              key={agency.agenceId}
              onClick={() => onToggleAgency(agency.agenceId)}
              className={cn(
                "group flex items-center justify-between p-3 transition-all cursor-pointer hover:bg-surface-subtle dark:hover:bg-slate-800/60",
                isSelected && "bg-emerald-50/50 dark:bg-emerald-500/5 border-r-2 border-emerald-500"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold text-content-muted/40 dark:text-slate-600 w-4 tabular-nums">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-content-primary dark:text-slate-200 truncate">
                      {agency.agenceNom}
                    </p>
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-tighter shrink-0">
                      Actif
                    </span>
                    {isCritical && (
                      <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-content-muted/60 dark:text-slate-500 font-medium truncate tabular-nums">
                    {agency.ville} • {agency.share.toFixed(1)}% du total
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 ml-4">
                <div className="flex items-baseline justify-end gap-1">
                  <p className="text-sm font-bold text-content-primary dark:text-slate-100 tabular-nums">
                    {formatMoney(agency.solde)}
                  </p>
                </div>
                
                <div className="flex items-center justify-end gap-2 mt-1">
                   {/* Mini Trend */}
                   <div className={cn(
                     "flex items-center gap-0.5 text-[10px] font-bold tabular-nums",
                     agency.deltaPercent >= 0 ? "text-emerald-500" : "text-rose-500"
                   )}>
                     {agency.deltaPercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                     {Math.abs(agency.deltaPercent).toFixed(0)}%
                   </div>

                   {/* Progress Bar */}
                   <div className="w-16 h-1 bg-surface-subtle dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full transition-all duration-500", agency.deltaPercent >= 0 ? "bg-emerald-500" : "bg-rose-500")}
                        style={{ width: `${Math.min(100, agency.share * 2)}%` }} // Scaled for visibility
                      />
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
