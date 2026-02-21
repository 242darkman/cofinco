import React from 'react';
import { useMyDashboard } from '../../hooks/hr/useMonEspace';
import { Card, Badge, StatCard } from '../ui';
import { Calendar, CheckCircle, Clock, FileText, Star, Briefcase } from 'lucide-react';

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
  1: 'Janvier', 2: 'Fevrier', 3: 'Mars', 4: 'Avril',
  5: 'Mai', 6: 'Juin', 7: 'Juillet', 8: 'Aout',
  9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Decembre',
};

export default function MonEspaceDashboard() {
  const { dashboard, isLoading } = useMyDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Briefcase className="h-12 w-12 text-content-muted mb-4" />
        <p className="text-content-secondary font-medium">Espace personnel indisponible</p>
        <p className="text-sm text-content-muted mt-1">
          Impossible de charger vos donnees. Veuillez reessayer.
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
    <div className="space-y-6">
      {/* Welcome Card */}
      <Card variant="glass">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-content-primary">
              Bienvenue dans votre espace personnel
            </h2>
            <p className="text-sm text-content-muted mt-1 capitalize">{today}</p>
          </div>
          <div className="shrink-0 p-2.5 rounded-xl bg-accent/10">
            <Briefcase className="h-6 w-6 text-accent" />
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Derniers bulletins de paie */}
        <Card>
          <Card.Header as="h3">Derniers bulletins de paie</Card.Header>
          <Card.Content>
            {!dashboard.derniersBulletins || dashboard.derniersBulletins.length === 0 ? (
              <p className="text-sm text-content-muted py-4 text-center">
                Aucun bulletin disponible
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.derniersBulletins.map((bulletin: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-subtle border border-edge-subtle"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-primary">
                        {MOIS_LABELS[bulletin.mois] || `Mois ${bulletin.mois}`} {bulletin.annee}
                      </p>
                      <p className="text-xs text-content-muted mt-0.5">
                        Net a payer: {formatFCFA(bulletin.netAPayer)}
                      </p>
                    </div>
                    <Badge value={bulletin.statut} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </Card.Content>
        </Card>

        {/* Presences du mois */}
        <Card>
          <Card.Header as="h3">Presences du mois</Card.Header>
          <Card.Content>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-status-success-bg/50 border border-status-success/20">
                <p className="text-xs font-medium text-status-success uppercase tracking-wide">Presents</p>
                <p className="text-xl font-bold text-status-success mt-1">
                  {dashboard.presenceMois.presents}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-status-warning-bg/50 border border-status-warning/20">
                <p className="text-xs font-medium text-status-warning uppercase tracking-wide">Retards</p>
                <p className="text-xl font-bold text-status-warning mt-1">
                  {dashboard.presenceMois.retards}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-status-danger-bg/50 border border-status-danger/20">
                <p className="text-xs font-medium text-status-danger uppercase tracking-wide">Absents</p>
                <p className="text-xl font-bold text-status-danger mt-1">
                  {dashboard.presenceMois.absents}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-xs font-medium text-accent uppercase tracking-wide">Heures</p>
                <p className="text-xl font-bold text-accent mt-1">
                  {formatMinutesToHours(dashboard.presenceMois.heuresTravaillees)}
                </p>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Evaluations recentes */}
      <Card>
        <Card.Header as="h3">Evaluations recentes</Card.Header>
        <Card.Content>
          {!dashboard.evaluationsRecentes || dashboard.evaluationsRecentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Star className="h-10 w-10 text-content-muted mb-3" />
              <p className="text-sm text-content-muted">Aucune evaluation recente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboard.evaluationsRecentes.map((evaluation: any, index: number) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-surface-subtle border border-edge-subtle"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                      <Star className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-primary">
                        {formatDate(evaluation.createdAt || evaluation.date)}
                      </p>
                      {evaluation.evaluatorNom && (
                        <p className="text-xs text-content-muted mt-0.5">
                          Evaluateur: {evaluation.evaluatorNom}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {evaluation.overallScore != null && (
                      <span className={`text-lg font-bold ${getScoreColor(evaluation.overallScore)}`}>
                        {evaluation.overallScore}/10
                      </span>
                    )}
                    <Badge value={evaluation.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
