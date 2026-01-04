import { useState } from 'react';

export interface ConfirmState {
  isOpen: boolean;
  title?: string;
  message?: string;
  variant?: 'danger' | 'warning' | 'success' | 'info';
  confirmText?: string;
  onConfirm?: () => void | Promise<void>;
}

/**
 * Hook pour gérer un dialogue de confirmation réutilisable
 * Remplace les `confirm()` natifs pour une UX cohérente
 */
export function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false
  });

  const openConfirm = (config: Omit<ConfirmState, 'isOpen'>) => {
    setConfirmState({
      isOpen: true,
      ...config
    });
  };

  const closeConfirm = () => {
    setConfirmState({ isOpen: false });
  };

  const handleConfirm = async () => {
    if (confirmState.onConfirm) {
      await confirmState.onConfirm();
    }
    closeConfirm();
  };

  return {
    confirmState,
    openConfirm,
    closeConfirm,
    handleConfirm
  };
}
