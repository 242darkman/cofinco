import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureHeaderProps {
  /** Unique key for localStorage (to remember dismissal) */
  featureKey: string;
  /** Main title */
  title: React.ReactNode;
  /** Short description (always visible) */
  subtitle?: string;
  /** Detailed help text (shown in tooltip or expandable) */
  helpText?: string;
  /** Icon component to display before title */
  icon?: React.ReactNode;
  /** Additional actions (buttons) to show on the right */
  actions?: React.ReactNode;
  /** Custom className for the container */
  className?: string;
  /** Variant: 'default' shows subtitle, 'compact' shows only tooltip */
  variant?: 'default' | 'compact';
}

/**
 * FeatureHeader - Reusable header component with contextual help
 *
 * Features:
 * - Title with optional icon
 * - Subtitle for quick context
 * - Info tooltip for detailed help
 * - Remembers user preferences via localStorage
 * - Actions slot for buttons
 */
export function FeatureHeader({
  featureKey,
  title,
  subtitle,
  helpText,
  icon,
  actions,
  className,
  variant = 'default'
}: FeatureHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = `help-tooltip-${featureKey}`;

  // Check localStorage for dismissal state
  useEffect(() => {
    const key = `feature_help_dismissed_${featureKey}`;
    const isDismissed = localStorage.getItem(key) === 'true';
    setDismissed(isDismissed);
  }, [featureKey]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (showTooltip && tooltipRef.current) {
      // Focus the close button when tooltip opens
      const closeBtn = tooltipRef.current.querySelector<HTMLButtonElement>('[data-close-btn]');
      closeBtn?.focus();
    }
  }, [showTooltip]);

  // Handle Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && showTooltip) {
      setShowTooltip(false);
      triggerRef.current?.focus();
    }
  }, [showTooltip]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDismiss = () => {
    const key = `feature_help_dismissed_${featureKey}`;
    localStorage.setItem(key, 'true');
    setDismissed(true);
    setShowTooltip(false);
    triggerRef.current?.focus();
  };

  const closeTooltip = () => {
    setShowTooltip(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2">
          {icon && (
            <div className="shrink-0 text-primary" aria-hidden="true">
              {icon}
            </div>
          )}
          <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>

          {/* Info button (only if helpText provided) - RGAA compliant */}
          {helpText && (
            <div className="relative">
              <button
                ref={triggerRef}
                onClick={() => setShowTooltip(!showTooltip)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  showTooltip
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
                aria-expanded={showTooltip}
                aria-controls={tooltipId}
                aria-label={showTooltip ? "Fermer l'aide" : "Afficher l'aide"}
                title="Aide contextuelle"
              >
                <HelpCircle size={18} aria-hidden="true" />
              </button>

              {/* Tooltip/Popover - RGAA accessible */}
              {showTooltip && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40 bg-black/20"
                    onClick={closeTooltip}
                    aria-hidden="true"
                  />
                  {/* Dialog */}
                  <div
                    ref={tooltipRef}
                    id={tooltipId}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${tooltipId}-title`}
                    className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/20 rounded-lg">
                          <HelpCircle size={16} className="text-primary" aria-hidden="true" />
                        </div>
                        <h2
                          id={`${tooltipId}-title`}
                          className="font-semibold text-base text-white"
                        >
                          Comment ça marche ?
                        </h2>
                      </div>
                      <button
                        data-close-btn
                        onClick={closeTooltip}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label="Fermer"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>

                    {/* Content - improved readability */}
                    <div className="p-4">
                      <p className="text-sm text-slate-200 leading-relaxed">
                        {helpText}
                      </p>

                      {/* Dismiss option */}
                      {!dismissed && (
                        <div className="mt-4 pt-3 border-t border-slate-700">
                          <button
                            onClick={handleDismiss}
                            className="text-xs text-slate-400 hover:text-primary transition-colors focus:outline-none focus-visible:underline"
                          >
                            Ne plus afficher cette aide
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Subtitle (only in default variant) */}
        {subtitle && variant === 'default' && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions slot */}
      {actions && (
        <div className="shrink-0 flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Preset descriptions for common admin features
 * Import this and use with FeatureHeader
 */
export const FEATURE_DESCRIPTIONS = {
  // Administration
  'admin.treasury': {
    title: 'Supervision Trésorerie',
    subtitle: 'Vue temps réel des soldes de toutes les agences',
    helpText: 'Suivez en temps réel les flux financiers de votre réseau. Cliquez sur une agence pour voir son historique détaillé. Sélectionnez jusqu\'à 2 agences pour les comparer sur le graphique. Exportez les données en CSV, Excel ou PDF.'
  },
  'admin.agencies': {
    title: 'Gestion des Agences',
    subtitle: 'Créez et configurez vos points de vente',
    helpText: 'Gérez l\'ensemble de votre réseau d\'agences. Définissez les coordonnées GPS pour la géolocalisation, attribuez des responsables, et configurez les paramètres spécifiques à chaque agence.'
  },
  'admin.zones': {
    title: 'Zones Géographiques',
    subtitle: 'Délimitez les zones de couverture des agents',
    helpText: 'Créez des zones géographiques pour organiser le travail de vos agents terrain. Le système détecte automatiquement les chevauchements entre zones pour éviter les conflits d\'attribution.'
  },
  'admin.users': {
    title: 'Gestion des Utilisateurs',
    subtitle: 'Administrez les comptes et les accès',
    helpText: 'Créez des comptes utilisateurs, attribuez des rôles et permissions, gérez les accès aux différentes fonctionnalités. Les modifications sont tracées dans le journal d\'audit.'
  },
  'admin.roles': {
    title: 'Rôles & Permissions',
    subtitle: 'Configurez les droits d\'accès par profil',
    helpText: 'Définissez des rôles avec des permissions granulaires. Chaque rôle peut avoir accès à des modules, des actions, et des données spécifiques selon votre organisation.'
  },
  'admin.sessions': {
    title: 'Sessions Actives',
    subtitle: 'Surveillez les connexions en cours',
    helpText: 'Visualisez toutes les sessions utilisateur actives. Vous pouvez forcer la déconnexion d\'un utilisateur en cas de besoin, ou configurer des règles de blocage par IP, appareil ou zone géographique.'
  },
  'admin.audit': {
    title: 'Journal d\'Audit',
    subtitle: 'Traçabilité complète des actions',
    helpText: 'Consultez l\'historique de toutes les actions effectuées dans le système. Filtrez par utilisateur, module, période ou type d\'action. Exportez les logs pour conformité réglementaire.'
  },
  'admin.import': {
    title: 'Import de Données',
    subtitle: 'Importez des clients ou employés en masse',
    helpText: 'Importez des données depuis un fichier CSV ou Excel. Le système valide automatiquement les données, détecte les doublons, et permet d\'annuler un import en cas d\'erreur.'
  },
  'admin.notifications': {
    title: 'Centre de Notifications',
    subtitle: 'Gérez les alertes SMS et Email',
    helpText: 'Configurez les templates de notifications, testez l\'envoi de SMS, et consultez la file d\'attente des messages. Gérez les erreurs d\'envoi depuis la Dead Letter Queue.'
  },
  'admin.credits': {
    title: 'Plans de Crédit',
    subtitle: 'Configurez vos produits de prêt',
    helpText: 'Définissez les paramètres des différents types de crédits : taux d\'intérêt, durées, frais de dossier, pénalités de retard. Chaque modification est versionnée pour traçabilité.'
  },
  'admin.tontines': {
    title: 'Plans de Tontine',
    subtitle: 'Configurez vos groupes d\'épargne collective',
    helpText: 'Créez et gérez les paramètres des tontines : montants de cotisation, fréquences, règles de distribution. Suivez l\'activité des groupes et les paiements manqués.'
  },
  'admin.maintenance': {
    title: 'Mode Maintenance',
    subtitle: 'Planifiez les interruptions de service',
    helpText: 'Activez le mode maintenance pour effectuer des mises à jour. Les utilisateurs verront un message d\'indisponibilité. Vous pouvez programmer des maintenances récurrentes.'
  },
  'admin.product-rates': {
    title: 'Taux Produits',
    subtitle: 'Configurez les taux d\'intérêt et frais',
    helpText: 'Modifiez les taux d\'intérêt et les frais associés aux différents produits d\'épargne. Les modifications sont appliquées immédiatement et tracées dans l\'audit.'
  },
  'admin.credentials': {
    title: 'Identifiants Portail',
    subtitle: 'Générez les accès client au portail',
    helpText: 'Créez des identifiants de connexion pour vos clients. Vous pouvez envoyer automatiquement les informations par email. Les clients devront changer leur mot de passe à la première connexion.'
  },
  'admin.blocking-rules': {
    title: 'Règles de Blocage',
    subtitle: 'Sécurisez l\'accès à la plateforme',
    helpText: 'Créez des règles pour bloquer automatiquement les connexions suspectes : par IP, appareil, zone géographique ou user-agent. Consultez les statistiques de blocage.'
  },
  'admin.activity': {
    title: 'Journal d\'Activité',
    subtitle: 'Historique des actions système',
    helpText: 'Visualisez toutes les opérations effectuées sur la plateforme. Chaque entrée contient l\'utilisateur, l\'action, le module concerné et les détails techniques.'
  },
  'admin.alerts': {
    title: 'Alertes Système',
    subtitle: 'Notifications importantes à traiter',
    helpText: 'Les alertes système vous signalent les situations nécessitant votre attention : anomalies, échéances, seuils dépassés. Traitez-les pour maintenir un fonctionnement optimal.'
  },
  'admin.validation-terrain': {
    title: 'Validations Terrain',
    subtitle: 'Validez les transactions collectées par les agents',
    helpText: 'Passez en revue et validez les opérations effectuées par les agents sur le terrain. Vérifiez les photos, les montants et les signatures. Approuvez ou rejetez les transactions en masse.'
  },

  // Finance (for future use)
  'finance.caisse': {
    title: 'Caisse',
    subtitle: 'Gérez les opérations de guichet',
    helpText: 'Effectuez les dépôts, retraits et transferts. Consultez le solde en temps réel et l\'historique des opérations. La caisse doit être ouverte chaque jour avec un fond de caisse.'
  },
  'finance.credits': {
    title: 'Crédits',
    subtitle: 'Gestion des prêts et remboursements',
    helpText: 'Consultez les demandes de crédit, validez les dossiers, décaissez les prêts et suivez les remboursements. Les échéances en retard sont signalées automatiquement.'
  },
  'finance.epargne': {
    title: 'Épargne',
    subtitle: 'Comptes d\'épargne et dépôts à terme',
    helpText: 'Gérez les comptes d\'épargne de vos clients : ouvertures, versements, retraits. Configurez les objectifs d\'épargne et suivez l\'évolution des soldes.'
  },
  'finance.tontines': {
    title: 'Tontines',
    subtitle: 'Groupes d\'épargne collective',
    helpText: 'Gérez les cotisations des membres, planifiez les distributions, et suivez l\'historique des paiements. Le calendrier affiche les échéances à venir.'
  },

  // Client (for future use)
  'client.list': {
    title: 'Clients',
    subtitle: 'Base de données clientèle',
    helpText: 'Consultez et gérez votre portefeuille clients. Filtrez par statut, segment ou agence. Accédez aux détails de chaque client et son historique financier complet.'
  },
  'client.analytics': {
    title: 'Analytiques Client',
    subtitle: 'Statistiques et tendances',
    helpText: 'Analysez le comportement financier de vos clients : évolution de l\'épargne, historique des crédits, taux de remboursement. Comparez les périodes pour identifier les tendances.'
  },

  // HR (for future use)
  'hr.employees': {
    title: 'Employés',
    subtitle: 'Gestion du personnel',
    helpText: 'Administrez les dossiers de vos employés : informations personnelles, contrats, affectations. Suivez les formations et évaluations.'
  },
  'hr.payroll': {
    title: 'Paie',
    subtitle: 'Gestion de la rémunération',
    helpText: 'Calculez les salaires, gérez les primes et retenues, générez les bulletins de paie. Les écritures comptables sont générées automatiquement.'
  },
  'hr.leaves': {
    title: 'Congés',
    subtitle: 'Gestion des absences',
    helpText: 'Traitez les demandes de congés, visualisez le planning d\'équipe, et suivez les soldes de congés. Le calendrier affiche les absences prévues.'
  },

  'hr.primes': {
    title: 'Config Primes',
    subtitle: 'Configurez les primes de prospection et de performance',
    helpText: 'Définissez les règles de calcul des primes pour vos agents : montant fixe ou pourcentage du brut annuel. Activez des conditions comme le premier crédit obtenu ou un revenu minimum. Les primes actives sont automatiquement appliquées lors du calcul de la paie.'
  },

  // Agent (for future use)
  'agent.dashboard': {
    title: 'Tableau de Bord Agent',
    subtitle: 'Suivi de performance terrain',
    helpText: 'Visualisez vos KPIs en temps réel : taux de présence, collectes, recouvrement et clients actifs. Changez de période pour analyser vos tendances. Actualisez pour obtenir les dernières données.'
  },
  'agent.terrain': {
    title: 'Agent Terrain',
    subtitle: 'Gestion des opérations de proximité',
    helpText: 'Gérez vos visites clients, planifiez vos tournées et suivez vos objectifs quotidiens. Accédez aux informations clients et historiques de paiements directement sur le terrain.'
  }
} as const;

export type FeatureKey = keyof typeof FEATURE_DESCRIPTIONS;

/**
 * Helper to get description for a feature key
 */
export function getFeatureDescription(key: FeatureKey) {
  return FEATURE_DESCRIPTIONS[key];
}

export default FeatureHeader;
