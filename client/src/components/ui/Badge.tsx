import React from 'react';
import { getStatusLabel, ALL_STATUS_LABELS } from '@/lib/status-labels';

/**
 * Badge Component - COFIN Platform
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

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  value: string | React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  icon?: React.ReactNode;
  /** Si true, affiche la valeur brute sans traduction */
  rawValue?: boolean;
}

const Badge: React.FC<BadgeProps> = ({
  value,
  variant,
  size = 'md',
  className = '',
  icon,
  rawValue = false,
}) => {
  // Traduire la valeur EN -> FR si c'est une string
  const displayValue = React.useMemo(() => {
    if (rawValue || typeof value !== 'string') return value;
    return getStatusLabel(value, ALL_STATUS_LABELS, value);
  }, [value, rawValue]);

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
      'PENDING', 'PENDING_FEES', 'PENDING_ACTIVATION', 'SUSPENDED', 'IN_TRANSIT', 'SUBMITTED', 'DRAFT',
      'REEVALUATION_IN_PROGRESS', 'READY_FOR_INVESTIGATION', 'UNDER_INVESTIGATION', 'INVESTIGATION_COMPLETE',
      'EN ATTENTE', 'SUSPENDU', 'EN COURS', "EN COURS D'ANALYSE", 'BROUILLON', 'SOUMIS', 'EN TRANSIT',
      'RÉÉVALUATION EN COURS', 'A ENQUÊTER', 'EN ENQUÊTE', 'ENQUÊTE TERMINÉE'
    ];
    if (warningStates.includes(str)) return 'warning';

    // Danger states (EN + FR)
    const dangerStates = [
      'REJECTED', 'CANCELLED', 'LATE', 'DEFINITIVELY_REJECTED', 'REVERSED', 'DISCREPANCY_DETECTED',
      'RECEIVED_WITH_DISCREPANCY', 'DELETED', 'INACTIVE', 'FAILED',
      'REJETÉ', 'REJETÉE', 'INACTIF', 'INACTIVE', 'ANNULÉ', 'EN RETARD', 'CONTENTIEUX', 'BLOQUÉ',
      'REJETÉE DÉFINITIVEMENT', 'REVERSÉ', 'ÉCART DÉTECTÉ', 'REÇU AVEC ÉCART', 'SUPPRIMÉ'
    ];
    if (dangerStates.includes(str)) return 'danger';

    // Info states (EN + FR)
    const infoStates = [
      'APPROVED_L1', 'APPROVED_L2', 'APPROVED_AFTER_REEVALUATION', 'CLOSED',
      'APPROUVÉ N1', 'APPROUVÉ N2', 'APPROUVÉE APRÈS RÉÉVALUATION', 'CLÔTURÉ', 'CLÔTURÉE',
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

  const detectedVariant = getVariantFromValue(value);

  // Variant color classes (mobile-first)
  const variantClasses = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    danger: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    primary: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    outline: 'bg-transparent text-slate-600 border-slate-300',
  };

  // Size classes (mobile-first)
  const sizeClasses = {
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
