import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * ConfirmDialog Component - COFIN Platform
 * Mobile-first confirmation dialog for critical actions
 *
 * @example
 * <ConfirmDialog
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onConfirm={handleDelete}
 *   title="Confirmer la suppression"
 *   message="Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible."
 *   variant="danger"
 *   confirmText="Supprimer"
 *   cancelText="Annuler"
 * />
 */

export type ConfirmDialogVariant = 'danger' | 'warning' | 'success' | 'info';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  variant?: ConfirmDialogVariant;
  size?: 'sm' | 'md' | 'lg';
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  variant = 'danger',
  size = 'sm',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  isLoading = false,
  disabled = false,
  children,
}) => {
  // Variant configuration
  const variantConfig = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-status-danger',
      iconBg: 'bg-status-danger-bg',
      buttonVariant: 'danger' as const,
      modalVariant: 'danger' as const,
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-status-warning',
      iconBg: 'bg-status-warning-bg',
      buttonVariant: 'secondary' as const,
      modalVariant: 'warning' as const,
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-status-success',
      iconBg: 'bg-status-success-bg',
      buttonVariant: 'success' as const,
      modalVariant: 'success' as const,
    },
    info: {
      icon: Info,
      iconColor: 'text-status-info',
      iconBg: 'bg-status-info-bg',
      buttonVariant: 'primary' as const,
      modalVariant: 'default' as const,
    },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = () => {
    onConfirm();
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      variant={config.modalVariant}
      closeOnBackdrop={!isLoading}
      closeOnEsc={!isLoading}
      showCloseButton={!isLoading}
      footer={
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 min-h-[44px] text-sm leading-tight whitespace-normal"
          >
            {cancelText}
          </Button>
          <Button
            variant={config.buttonVariant}
            size="md"
            onClick={handleConfirm}
            disabled={isLoading || disabled}
            isLoading={isLoading}
            className="flex-1 min-h-[44px] text-sm leading-tight whitespace-normal"
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div
            className={`
              shrink-0 w-12 h-12 sm:w-14 sm:h-14
              rounded-full flex items-center justify-center
              ${config.iconBg}
            `}
          >
            <Icon className={config.iconColor} size={24} />
          </div>

          <div className="flex-1 text-center sm:text-left max-w-full overflow-hidden">
            <div className="text-sm sm:text-base text-content-secondary leading-relaxed break-words">
              {message}
            </div>
          </div>
        </div>
        
        {children && (
          <div className="w-full">
            {children}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
