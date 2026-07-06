import React from 'react';
import { Clock, CheckCircle, XCircle, Users, UserCheck, AlertTriangle } from 'lucide-react';
import { StatutReevaluation } from '@shared/enum/status-constants';

interface StatusAlertProps {
  status: string;
  canAct: boolean;
}

interface StatusConfig {
  title: string;
  description: string;
  actionIfCan: string;
  actionIfCannot: string;
  whoActs: string;
  icon: typeof Clock;
  bg: string;
  border: string;
  iconBg: string;
  text: string;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  [StatutReevaluation.REQUESTED]: {
    title: 'Dossier reçu',
    description: 'La demande a été créée mais n\'a pas encore été vérifiée.',
    actionIfCan: 'Cliquez sur "Vérifier l\'éligibilité" ci-dessous.',
    actionIfCannot: 'Un Chef d\'agence ou Gestionnaire crédit doit valider l\'éligibilité.',
    whoActs: 'Chef d\'agence ou Gestionnaire crédit',
    icon: Clock,
    bg: 'bg-status-info-bg', border: 'border-status-info/30', iconBg: 'bg-status-info/20 text-status-info', text: 'text-status-info',
  },
  [StatutReevaluation.ELIGIBILITY_CHECK]: {
    title: 'Vérification en cours',
    description: 'La demande a été créée mais n\'a pas encore été vérifiée.',
    actionIfCan: 'Cliquez sur "Vérifier l\'éligibilité" ci-dessous.',
    actionIfCannot: 'Un Chef d\'agence ou Gestionnaire crédit doit valider l\'éligibilité.',
    whoActs: 'Chef d\'agence ou Gestionnaire crédit',
    icon: Clock,
    bg: 'bg-status-info-bg', border: 'border-status-info/30', iconBg: 'bg-status-info/20 text-status-info', text: 'text-status-info',
  },
  [StatutReevaluation.AUTHORIZED]: {
    title: 'Éligibilité validée',
    description: 'Le dossier respecte les critères d\'éligibilité. Il est prêt pour passage en comité.',
    actionIfCan: 'Préparez le dossier et cliquez sur "Soumettre au comité".',
    actionIfCannot: 'Un responsable habilité doit soumettre le dossier au comité.',
    whoActs: 'Chef d\'agence ou Gestionnaire crédit',
    icon: CheckCircle,
    bg: 'bg-accent/10', border: 'border-accent/30', iconBg: 'bg-accent/20 text-accent', text: 'text-accent',
  },
  [StatutReevaluation.ADDITIONAL_INVESTIGATION]: {
    title: 'Enquête complémentaire',
    description: 'Une enquête complémentaire est en cours. Le dossier pourra être soumis au comité après son achèvement.',
    actionIfCan: 'Préparez le dossier et cliquez sur "Soumettre au comité" une fois l\'enquête terminée.',
    actionIfCannot: 'Un responsable habilité doit soumettre le dossier au comité après l\'enquête.',
    whoActs: 'Chef d\'agence ou Gestionnaire crédit',
    icon: CheckCircle,
    bg: 'bg-accent/10', border: 'border-accent/30', iconBg: 'bg-accent/20 text-accent', text: 'text-accent',
  },
  [StatutReevaluation.IN_COMMITTEE]: {
    title: 'Délibération en cours',
    description: 'Le dossier est entre les mains du comité de crédit. Les membres doivent examiner les nouvelles conditions apportées suite au premier refus.',
    actionIfCan: 'Après la séance, cliquez sur "Enregistrer la décision" pour saisir le verdict.',
    actionIfCannot: 'Un autre responsable habilité doit enregistrer la décision finale.',
    whoActs: 'Décideur comité (différent du validateur)',
    icon: Users,
    bg: 'bg-status-warning-bg', border: 'border-status-warning/30', iconBg: 'bg-status-warning/20 text-status-warning', text: 'text-status-warning',
  },
  [StatutReevaluation.APPROVED]: {
    title: 'Réévaluation validée',
    description: 'Le comité a donné son accord. Le crédit va être mis à jour avec les nouvelles conditions.',
    actionIfCan: 'Terminé', actionIfCannot: 'Terminé', whoActs: '',
    icon: CheckCircle,
    bg: 'bg-status-success-bg', border: 'border-status-success/30', iconBg: 'bg-status-success/20 text-status-success', text: 'text-status-success',
  },
  [StatutReevaluation.REFUSED]: {
    title: 'Non éligible',
    description: 'Le dossier ne remplit pas les critères techniques (délai, nombre de tentatives, etc.).',
    actionIfCan: 'Clôturé', actionIfCannot: 'Clôturé', whoActs: '',
    icon: XCircle,
    bg: 'bg-status-danger-bg', border: 'border-status-danger/30', iconBg: 'bg-status-danger/20 text-status-danger', text: 'text-status-danger',
  },
  [StatutReevaluation.DEFINITIVELY_REJECTED]: {
    title: 'Rejetée définitivement',
    description: 'Le comité a rejeté la demande. Aucune autre action n\'est possible.',
    actionIfCan: 'Clôturé', actionIfCannot: 'Clôturé', whoActs: '',
    icon: XCircle,
    bg: 'bg-status-danger-bg', border: 'border-status-danger/30', iconBg: 'bg-status-danger/20 text-status-danger', text: 'text-status-danger',
  },
  [StatutReevaluation.CANCELLED]: {
    title: 'Annulée',
    description: 'La procédure de réévaluation a été annulée.',
    actionIfCan: 'Terminé', actionIfCannot: 'Terminé', whoActs: '',
    icon: XCircle,
    bg: 'bg-surface-subtle', border: 'border-edge', iconBg: 'bg-surface-elevated text-content-muted', text: 'text-content-muted',
  },
};

const TERMINAL_STATUSES = ['APPROVED', 'DEFINITIVELY_REJECTED', 'CANCELLED', 'REFUSED'];

export function StatusAlert({ status, canAct }: StatusAlertProps) {
  const c = STATUS_CONFIGS[status];
  if (!c) return null;

  const isTerminal = TERMINAL_STATUSES.includes(status);
  const Icon = c.icon;

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-4 flex items-start gap-3`} role="alert">
      <div className={`p-1.5 rounded-full ${c.iconBg} mt-0.5 shrink-0`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <h4 className={`font-bold ${c.text} text-sm mb-0.5`}>{c.title}</h4>
        <p className="text-content-secondary text-sm leading-relaxed">{c.description}</p>
        {c.whoActs && !isTerminal && (
          <div className="mt-2 flex items-center gap-1.5">
            <AlertTriangle size={12} className={c.text} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>
              {canAct ? c.actionIfCan : c.actionIfCannot}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
