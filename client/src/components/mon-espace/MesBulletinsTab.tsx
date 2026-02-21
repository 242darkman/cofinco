import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button } from '../ui';
import { FileText, Download, Calendar } from 'lucide-react';

interface Bulletin {
  id: number;
  mois: string;           // 'YYYY-MM'
  salaireNet: string;     // numeric string
  statut: string;
  pdfUrl?: string;
}

const MOIS_LABELS: Record<number, string> = {
  1: 'Janvier', 2: 'Février', 3: 'Mars', 4: 'Avril',
  5: 'Mai', 6: 'Juin', 7: 'Juillet', 8: 'Août',
  9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Décembre',
};

const MOIS_SHORT: Record<number, string> = {
  1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr',
  5: 'Mai', 6: 'Juin', 7: 'Juil', 8: 'Août',
  9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Déc',
};

function formatFCFA(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 FCFA';
  return num.toLocaleString('fr-FR') + ' FCFA';
}

const STATUT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PAID: { bg: 'bg-status-success-bg', text: 'text-status-success', label: 'Payé' },
  VALIDATED: { bg: 'bg-status-info-bg', text: 'text-status-info', label: 'Validé' },
};

export default function MesBulletinsTab() {
  const { data: rawBulletins, isLoading } = useQuery<Bulletin[]>({
    queryKey: ['/api/hr/paie/my'],
    queryFn: () =>
      fetch('/api/hr/paie/my', { credentials: 'include' }).then((r) =>
        r.json()
      ),
  });
  const bulletins = rawBulletins ?? [];

  // Group bulletins by year, keyed by 'YYYY-MM'
  const yearGroups = useMemo(() => {
    const map = new Map<string, Map<number, Bulletin>>();
    for (const b of bulletins) {
      const match = b.mois.match(/^(\d{4})-(\d{2})$/);
      if (!match) continue;
      const year = match[1];
      const month = parseInt(match[2], 10);
      if (!map.has(year)) map.set(year, new Map());
      map.get(year)!.set(month, b);
    }
    // Sort years descending
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [bulletins]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (bulletins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <FileText className="h-10 w-10 text-content-muted mb-3" />
        <p className="text-content-secondary font-medium">Aucun bulletin de paie</p>
        <p className="text-sm text-content-muted mt-1">
          Vos bulletins de paie apparaîtront ici une fois générés
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {yearGroups.map(([year, monthMap]) => (
        <Card key={year} padding="sm">
          {/* Year header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-edge-subtle">
            <Calendar size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-content-primary">{year}</h3>
            <span className="text-xs text-content-muted">
              ({monthMap.size} bulletin{monthMap.size > 1 ? 's' : ''})
            </span>
          </div>

          {/* 2-column x 6-row grid: Jan-Jun | Jul-Dec */}
          <div className="grid grid-cols-2 gap-2">
            {[...Array(12)].map((_, i) => {
              const month = i + 1;
              const bulletin = monthMap.get(month);
              const style = bulletin ? STATUT_STYLES[bulletin.statut] : null;

              if (!bulletin) {
                return (
                  <div
                    key={month}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-dashed border-edge-subtle/50 opacity-40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-subtle flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-content-muted uppercase">
                        {MOIS_SHORT[month]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-content-muted">{MOIS_LABELS[month]}</p>
                      <p className="text-[10px] text-content-muted">—</p>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={month}
                  className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-edge-subtle bg-surface-subtle hover:bg-surface-elevated hover:border-accent/30 transition-all duration-150"
                >
                  {/* Month badge */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${style?.bg || 'bg-accent/10'}`}>
                    <span className={`text-[10px] font-bold uppercase ${style?.text || 'text-accent'}`}>
                      {MOIS_SHORT[month]}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-content-primary truncate">{MOIS_LABELS[month]}</p>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${style?.bg || 'bg-surface-muted'} ${style?.text || 'text-content-muted'}`}>
                        {style?.label || bulletin.statut}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-content-secondary mt-0.5">
                      {formatFCFA(bulletin.salaireNet)}
                    </p>
                  </div>

                  {/* Download */}
                  {bulletin.pdfUrl && (
                    <button
                      onClick={() => window.open(bulletin.pdfUrl, '_blank')}
                      className="p-1.5 rounded-md text-content-muted opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent/10 transition-all shrink-0"
                      title="Télécharger"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
