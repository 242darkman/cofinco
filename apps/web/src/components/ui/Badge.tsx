import React from 'react';
import { getStatusLabel, ALL_STATUS_LABELS } from '@/lib/status-labels';

/**
 * Badge Component - MicroFlex Platform
 * Mobile-first badge for status indicators with auto color detection
 *
 * Supporte les codes ANGLAIS (ACTIVE, PENDING, etc.) et les labels FR legacy
 * Traduit automatiquement les codes EN en labels FR pour l'affichage
 *
 * @example
 * <Badge value="ACTIVE" />           // Affiche "Actif"
 * <Badge value="PENDING" />          // Affiche "En attente"
 * <Badge value="Actif" />            // Affiche "Actif" (legacy)
 * <Badge value="En attente" variant="warning" />
 * <Badge value="Rejeté" size="lg" />
 * <Badge value="REJECTED" rawValue />  // Affiche "REJECTED" sans traduction
 */

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'error' | 'info' | 'neutral' | 'primary' | 'outline' | 'default';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export interface BadgeProps {
  value?: string | React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  icon?: React.ReactNode;
  /** Si true, affiche la valeur brute sans traduction */
  rawValue?: boolean;
  /** Alternative to value - supports children content */
  children?: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({
  value,
  variant,
  size = 'md',
  className = '',
  icon,
  rawValue = false,
  children,
}) => {
  // Use children as fallback for value
  const content = value ?? children;

  // Traduire la valeur EN -> FR si c'est une string
  const displayValue = React.useMemo(() => {
    if (rawValue || typeof content !== 'string') return content;
    return getStatusLabel(content, ALL_STATUS_LABELS, content);
  }, [content, rawValue]);

  // Auto-detect variant from value if not provided
  const getVariantFromValue = (val: string | React.ReactNode): BadgeVariant => {
    if (variant) return variant;

    const str = String(val).toUpperCase();

    // Success states (EN + FR)
    const successStates = [
      'ACTIVE', 'VALIDATED', 'APPROVED', 'PAID', 'POSTED', 'RECEIVED', 'EXECUTED', 'DISBURSED', 'RECONCILED', 'RESOLVED',
      'ACTIF', 'VALIDÉ', 'APPROUVÉ', 'APPROUVÉE', 'SOLDÉ', 'DÉBOURSÉ', 'VALIDÉE', 'POSTÉ', 'REÇU', 'EXÉCUTÉ'
    ];
    if (successStates.includes(str)) return 'success';

    // Warning states (EN + FR)
    const warningStates = [
      'PENDING', 'PENDING_FEES', 'PENDING_ACTIVATION', 'PENDING_VALIDATION', 'PENDING_PAYMENT',
      'PENDING_APPROVAL', 'PENDING_PAYMENT_AND_APPROVAL',
      'PENDING_CAISSE', 'PAYOUT_PENDING',
      'SUSPENDED', 'IN_TRANSIT', 'SUBMITTED', 'DRAFT',
      'REEVALUATION_IN_PROGRESS', 'READY_FOR_INVESTIGATION', 'UNDER_INVESTIGATION', 'INVESTIGATION_COMPLETE',
      'EN ATTENTE', 'EN ATTENTE DE PAIEMENT', 'EN ATTENTE DE VALIDATION', 'EN ATTENTE PAIEMENT & VALIDATION',
      'EN ATTENTE CAISSE', 'PAIEMENT EN ATTENTE',
      'SUSPENDU', 'EN COURS', "EN COURS D'ANALYSE", "EN COURS D'APPROBATION", 'BROUILLON', 'SOUMIS', 'EN TRANSIT',
      'RÉÉVALUATION EN COURS', 'A ENQUÊTER', 'EN ENQUÊTE', 'ENQUÊTE TERMINÉE'
    ];
    if (warningStates.includes(str)) return 'warning';

    // Danger states (EN + FR)
    const dangerStates = [
      'REJECTED', 'CANCELLED', 'LATE', 'DEFINITIVELY_REJECTED', 'REVERSED', 'DISCREPANCY_DETECTED',
      'RECEIVED_WITH_DISCREPANCY', 'DELETED', 'INACTIVE', 'FAILED', 'PAYMENT_FAILED',
      'REJETÉ', 'REJETÉE', 'INACTIF', 'INACTIVE', 'ANNULÉ', 'EN RETARD', 'CONTENTIEUX', 'BLOQUÉ',
      'REJETÉE DÉFINITIVEMENT', 'REVERSÉ', 'ÉCART DÉTECTÉ', 'REÇU AVEC ÉCART', 'SUPPRIMÉ', 'ÉCHEC PAIEMENT'
    ];
    if (dangerStates.includes(str)) return 'danger';

    // Info states (EN + FR)
    const infoStates = [
      'APPROVED_L1', 'APPROVED_L2', 'APPROVED_AFTER_REEVALUATION', 'CLOSED',
      'SCHEDULED', 'PAYOUT_PROCESSING',
      'APPROUVÉ N1', 'APPROUVÉ N2', 'APPROUVÉE APRÈS RÉÉVALUATION', 'CLÔTURÉ', 'CLÔTURÉE',
      'PROGRAMMÉ', 'PAIEMENT EN COURS',
      'RÉDUITE', 'RESTRUCTURÉ', 'EN RÉVISION'
    ];
    if (infoStates.includes(str)) return 'info';

    // Primary states (Premium, special)
    const primaryStates = ['PREMIUM', 'GOLD', 'PRO'];
    if (primaryStates.includes(str)) return 'primary';

    // Warning states (VIP uses warning for Gold color)
    const vipStates = ['VIP', 'PLATINUM'];
    if (vipStates.includes(str)) return 'warning';

    return 'neutral';
  };

  const detectedVariant = getVariantFromValue(content);

  // Variant color classes (mobile-first)
  const variantClasses = {
    success: 'bg-status-success-bg text-status-success border-status-success/30',
    warning: 'bg-status-warning-bg text-status-warning border-status-warning/30',
    danger: 'bg-status-danger-bg text-status-danger border-status-danger/30',
    error: 'bg-status-danger-bg text-status-danger border-status-danger/30',
    info: 'bg-status-info-bg text-status-info border-status-info/30',
    neutral: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
    default: 'bg-surface-subtle/40 text-content-muted border-edge-strong/30',
    primary: 'bg-accent/20 text-accent border-accent/30',
    outline: 'bg-transparent text-content-muted border-edge',
  };

  // Size classes (mobile-first)
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[9px] sm:text-[10px]',
    sm: 'px-2 py-0.5 text-[10px] sm:text-xs',
    md: 'px-2 py-1 text-[11px] sm:text-xs',
    lg: 'px-3 py-1.5 text-xs sm:text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded border font-semibold
        transition-colors duration-200
        ${variantClasses[detectedVariant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{displayValue}</span>
    </span>
  );
};

export default Badge;
