import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './';

/**
 * Modal Component - COFIN Platform
 * Mobile-first, theme-aware modal dialog
 *
 * @example
 * <Modal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="Nouvel Utilisateur"
 *   size="lg"
 *   variant="default"
 *   footer={<Button onClick={handleSave}>Enregistrer</Button>}
 * >
 *   <form>...</form>
 * </Modal>
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
export type ModalVariant = 'default' | 'danger' | 'success' | 'warning';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  variant?: ModalVariant;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  variant = 'default',
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = '',
}) => {
  // ESC key handler
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, closeOnEsc, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Size classes (mobile-first)
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md sm:max-w-lg',
    lg: 'max-w-lg sm:max-w-xl lg:max-w-2xl',
    xl: 'max-w-xl sm:max-w-2xl lg:max-w-4xl',
    '2xl': 'max-w-2xl sm:max-w-4xl lg:max-w-6xl',
    full: 'max-w-full mx-4',
  };

  // Variant classes for header - Theme-aware
  const variantClasses = {
    default: 'bg-accent/10 border-accent/30',
    danger: 'bg-status-danger/10 border-status-danger/30',
    success: 'bg-status-success/10 border-status-success/30',
    warning: 'bg-status-warning/10 border-status-warning/30',
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`
          bg-surface-base sm:rounded-2xl border-x-0 sm:border border-edge
          w-full ${sizeClasses[size]}
          h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden shadow-theme-lg
          animate-in fade-in zoom-in-95 duration-200
          flex flex-col
          ${className}
        `}
      >
        {/* Header */}
        <div
          className={`
            ${variantClasses[variant]}
            p-4 sm:p-6 border-b border-edge
            flex items-start justify-between gap-4
          `}
        >
          <div className="flex-1 min-w-0">
            <h2
              id="modal-title"
              className="text-lg sm:text-xl lg:text-2xl font-bold text-content-primary truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-content-muted mt-1">{subtitle}</p>
            )}
          </div>
          {showCloseButton && (
            <IconButton
              icon={X}
              variant="ghost"
              size="md"
              onClick={onClose}
              aria-label="Fermer"
              className="shrink-0"
            />
          )}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-180px)] text-content-secondary">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:p-6 border-t border-edge flex flex-col-reverse sm:flex-row justify-end gap-3 bg-surface-muted">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
