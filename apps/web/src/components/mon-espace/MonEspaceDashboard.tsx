import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useMyDashboard } from '../../hooks/hr/useMonEspace';
import { Card, Badge, StatCard } from '../ui';
import { Calendar, CheckCircle, Clock, FileText, Star, Briefcase, Download, Eye } from 'lucide-react';
import { PayslipViewer } from '../hr/PayslipViewer';

function formatFCFA(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 FCFA';
  return num.toLocaleString('fr-FR') + ' FCFA';
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getScoreColor(score: number): string {
  if (score >= 7) return 'text-status-success';
  if (score >= 5) return 'text-status-warning';
  return 'text-status-danger';
}

const MOIS_LABELS: Record<number, string> = {
  1: 'Janvier', 2: 'Février', 3: 'Mars', 4: 'Avril',
  5: 'Mai', 6: 'Juin', 7: 'Juillet', 8: 'Août',
  9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Décembre',
};

/** Parse 'YYYY-MM' → { moisNum, annee } */
function parseMoisStr(mois: string | number): { label: string; annee: string } {
  const s = String(mois);
  const match = s.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const moisNum = parseInt(match[2], 10);
    return { label: MOIS_LABELS[moisNum] || `Mois ${moisNum}`, annee: match[1] };
  }
  // fallback: mois is a number
  const num = typeof mois === 'number' ? mois : parseInt(s, 10);
  return { label: MOIS_LABELS[num] || `Mois ${num}`, annee: '' };
}

export default function MonEspaceDashboard() {
  const { dashboard, isLoading } = useMyDashboard();
  const [viewerBulletinId, setViewerBulletinId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Briefcase className="h-10 w-10 text-content-muted mb-3" />
        <p className="text-content-secondary font-medium">Espace personnel indisponible</p>
        <p className="text-sm text-content-muted mt-1">
          Impossible de charger vos données. Veuillez réessayer.
        </p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-3">
      {/* Welcome Card */}
      <Card variant="glass" padding="sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-content-primary">
              Bienvenue dans votre espace
            </h2>
            <p className="text-xs text-content-muted mt-0.5 capitalize">{today}</p>
          </div>
          <div className="shrink-0 p-2 rounded-lg bg-accent/10">
            <Briefcase className="h-5 w-5 text-accent" />
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          title="Conges en attente"
          value={dashboard.conges.enAttente}
          icon={Calendar}
          color="warning"
        />
        <StatCard
          title="Conges approuves"
          value={dashboard.conges.approuve}
          icon={CheckCircle}
          color="success"
        />
        <StatCard
          title="Presences ce mois"
          value={dashboard.presenceMois.presents}
          icon={Clock}
          color="primary"
        />
        <StatCard
          title="Documents en cours"
          value={dashboard.documentsEnCours}
          icon={FileText}
          color="neutral"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Derniers bulletins de paie */}
        <Card padding="sm">
          <h3 className="text-sm font-bold text-content-primary mb-2">Derniers bulletins de paie</h3>
          {!dashboard.derniersBulletins || dashboard.derniersBulletins.length === 0 ? (
            <p className="text-sm text-content-muted py-3 text-center">Aucun bulletin disponible</p>
          ) : (
            <div className="space-y-2">
              {dashboard.derniersBulletins.map((bulletin: any, index: number) => {
                const { label, annee } = parseMoisStr(bulletin.mois);
                return (
                  <div
                    key={index}
                    onClick={() => bulletin.id && setViewerBulletinId(bulletin.id)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-subtle border border-edge-subtle hover:bg-surface-elevated hover:border-accent/30 transition-all cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-primary">
                        {label} {annee}
                      </p>
                      <p className="text-xs text-content-muted mt-0.5">
                        Net : {formatFCFA(bulletin.salaireNet)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge value={bulletin.statut} size="sm" />
                      <button
                        onClick={(e) => { e.stopPropagation(); bulletin.id && setViewerBulletinId(bulletin.id); }}
                        className="p-1.5 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Voir le bulletin"
                      >
                        <Eye size={14} />
                      </button>
                      {bulletin.pdfUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(bulletin.pdfUrl, '_blank'); }}
                          className="p-1.5 rounded-md text-content-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Télécharger le bulletin"
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Presences du mois */}
        <Card padding="sm">
          <h3 className="text-sm font-bold text-content-primary mb-2">Présences du mois</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-status-success-bg/50 border border-status-success/20">
              <p className="text-[10px] font-medium text-status-success uppercase tracking-wide">Présents</p>
              <p className="text-lg font-bold text-status-success mt-0.5">{dashboard.presenceMois.presents}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-status-warning-bg/50 border border-status-warning/20">
              <p className="text-[10px] font-medium text-status-warning uppercase tracking-wide">Retards</p>
              <p className="text-lg font-bold text-status-warning mt-0.5">{dashboard.presenceMois.retards}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-status-danger-bg/50 border border-status-danger/20">
              <p className="text-[10px] font-medium text-status-danger uppercase tracking-wide">Absents</p>
              <p className="text-lg font-bold text-status-danger mt-0.5">{dashboard.presenceMois.absents}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-[10px] font-medium text-accent uppercase tracking-wide">Heures</p>
              <p className="text-lg font-bold text-accent mt-0.5">{formatMinutesToHours(dashboard.presenceMois.heuresTravaillees)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Evaluations recentes */}
      <Card padding="sm">
        <h3 className="text-sm font-bold text-content-primary mb-2">Évaluations récentes</h3>
        {!dashboard.evaluationsRecentes || dashboard.evaluationsRecentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Star className="h-8 w-8 text-content-muted mb-2" />
            <p className="text-sm text-content-muted">Aucune évaluation récente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dashboard.evaluationsRecentes.map((evaluation: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-subtle border border-edge-subtle"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
                    <Star className="h-4 w-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-content-primary">
                      {formatDate(evaluation.createdAt || evaluation.date)}
                    </p>
                    {evaluation.evaluatorNom && (
                      <p className="text-xs text-content-muted">{evaluation.evaluatorNom}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {evaluation.overallScore != null && (
                    <span className={`text-sm font-bold ${getScoreColor(evaluation.overallScore)}`}>
                      {evaluation.overallScore}/10
                    </span>
                  )}
                  <Badge value={evaluation.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
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
