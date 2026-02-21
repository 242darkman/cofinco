import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button } from '../ui';
import { FileText, Download } from 'lucide-react';

interface Bulletin {
  id: number;
  mois: number;
  annee: number;
  netAPayer: number | string;
  statut: string;
  pdfUrl?: string;
}

const MOIS_LABELS: Record<number, string> = {
  1: 'Janvier', 2: 'Fevrier', 3: 'Mars', 4: 'Avril',
  5: 'Mai', 6: 'Juin', 7: 'Juillet', 8: 'Aout',
  9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Decembre',
};

function formatFCFA(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 FCFA';
  return num.toLocaleString('fr-FR') + ' FCFA';
}

export default function MesBulletinsTab() {
  const { data: rawBulletins, isLoading } = useQuery<Bulletin[]>({
    queryKey: ['/api/hr/paie/my'],
    queryFn: () =>
      fetch('/api/hr/paie/bulletins?mine=true', { credentials: 'include' }).then((r) =>
        r.json()
      ),
  });
  const bulletins = rawBulletins ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (bulletins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-12 w-12 text-content-muted mb-4" />
        <p className="text-content-secondary font-medium">Aucun bulletin de paie</p>
        <p className="text-sm text-content-muted mt-1">
          Vos bulletins de paie apparaitront ici une fois generes
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bulletins.map((bulletin) => (
        <Card key={bulletin.id} padding="sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex shrink-0 items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content-primary">
                  {MOIS_LABELS[bulletin.mois] || `Mois ${bulletin.mois}`} {bulletin.annee}
                </p>
                <p className="text-xs text-content-muted mt-0.5">
                  Net a payer: <span className="font-semibold text-content-primary">{formatFCFA(bulletin.netAPayer)}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge value={bulletin.statut} size="sm" />
              {bulletin.pdfUrl && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Download}
                  onClick={() => window.open(bulletin.pdfUrl, '_blank')}
                >
                  <span className="hidden sm:inline">Telecharger</span>
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
