import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../ui';
import { FileText, Download, Calendar, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { PayslipViewer } from '../hr/PayslipViewer';

interface Bulletin {
  id: number;
  mois: string;           // 'YYYY-MM'
  salaireNet: string;     // numeric string
  statut: string;
  pdfUrl?: string;
  viewedAt?: string | null;
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
  SCHEDULED: { bg: 'bg-status-info-bg', text: 'text-status-info', label: 'Programmé' },
  PENDING_CAISSE: { bg: 'bg-status-warning-bg', text: 'text-status-warning', label: 'En attente caisse' },
  PAYOUT_PENDING: { bg: 'bg-status-warning-bg', text: 'text-status-warning', label: 'Paiement en attente' },
  PAYOUT_PROCESSING: { bg: 'bg-status-info-bg', text: 'text-status-info', label: 'Paiement en cours' },
  PAYMENT_FAILED: { bg: 'bg-status-danger-bg', text: 'text-status-danger', label: 'Échec paiement' },
};

export default function MesBulletinsTab() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [viewerBulletinId, setViewerBulletinId] = useState<number | null>(null);

  const { data: rawBulletins, isLoading } = useQuery<Bulletin[]>({
    queryKey: ['/api/hr/paie/my'],
    queryFn: () =>
      fetch('/api/hr/paie/my', { credentials: 'include' }).then((r) =>
        r.json()
      ),
  });
  const bulletins = rawBulletins ?? [];

  // Compute available years from bulletins
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    for (const b of bulletins) {
      const y = parseInt(b.mois?.split('-')[0]);
      if (!isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [bulletins, currentYear]);

  // Build month map for the selected year
  const monthMap = useMemo(() => {
    const map = new Map<number, Bulletin>();
    for (const b of bulletins) {
      const match = b.mois.match(/^(\d{4})-(\d{2})$/);
      if (!match) continue;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (year === selectedYear) {
        map.set(month, b);
      }
    }
    return map;
  }, [bulletins, selectedYear]);

  const bulletinCount = monthMap.size;

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

  const yearIdx = availableYears.indexOf(selectedYear);
  const canPrev = yearIdx < availableYears.length - 1;
  const canNext = yearIdx > 0;

  return (
    <div className="space-y-3">
      {/* Year selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent/10 rounded-lg">
            <Calendar size={15} className="text-accent" />
          </div>
          <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
            Bulletins de paie
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => canPrev && setSelectedYear(availableYears[yearIdx + 1])}
            disabled={!canPrev}
            className="p-1 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-surface-base border border-edge rounded-lg text-sm font-semibold text-content-primary px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => canNext && setSelectedYear(availableYears[yearIdx - 1])}
            disabled={!canNext}
            className="p-1 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <Card padding="sm">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-edge-subtle">
          <h3 className="text-sm font-bold text-content-primary">{selectedYear}</h3>
          <span className="text-xs text-content-muted">
            ({bulletinCount} bulletin{bulletinCount > 1 ? 's' : ''})
          </span>
        </div>

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
                onClick={() => setViewerBulletinId(bulletin.id)}
                className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-edge-subtle bg-surface-subtle hover:bg-surface-elevated hover:border-accent/30 transition-all duration-150 cursor-pointer"
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
                    {!bulletin.viewedAt && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-white animate-in zoom-in duration-300">
                        Nouveau
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-content-secondary mt-0.5">
                    {formatFCFA(bulletin.salaireNet)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setViewerBulletinId(bulletin.id); }}
                    className="p-1.5 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 transition-colors"
                    title="Voir le bulletin"
                  >
                    <Eye size={14} />
                  </button>
                  {bulletin.pdfUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(bulletin.pdfUrl, '_blank');
                        // Mark as read (fire-and-forget)
                        fetch(`/api/hr/bulletins/${bulletin.id}/mark-read`, { method: 'POST', credentials: 'include' }).catch(() => {});
                      }}
                      className="p-1.5 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      title="Télécharger"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Bulletin preview modal */}
      <PayslipViewer
        isOpen={viewerBulletinId !== null}
        onClose={() => setViewerBulletinId(null)}
        bulletinId={viewerBulletinId}
      />
    </div>
  );
}
