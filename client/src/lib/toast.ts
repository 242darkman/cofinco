/**
 * Toast Notification System for COFIN Platform
 * Wrapper around Sonner for consistent API across the app
 */

import { toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  duration?: number;
  id?: string;
}

// Wrapper around sonner's toast for consistent API
export const toast = {
  success(message: string, options?: ToastOptions) {
    return sonnerToast.success(message, {
      duration: options?.duration ?? 4000,
      id: options?.id,
    });
  },

  error(message: string, options?: ToastOptions) {
    return sonnerToast.error(message, {
      duration: options?.duration ?? 6000,
      id: options?.id,
    });
  },

  warning(message: string, options?: ToastOptions) {
    return sonnerToast.warning(message, {
      duration: options?.duration ?? 5000,
      id: options?.id,
    });
  },

  info(message: string, options?: ToastOptions) {
    return sonnerToast.info(message, {
      duration: options?.duration ?? 4000,
      id: options?.id,
    });
  },

  loading(message: string, options?: ToastOptions) {
    return sonnerToast.loading(message, {
      id: options?.id,
    });
  },

  dismiss(id?: string | number) {
    sonnerToast.dismiss(id);
  },

  // Compatibility methods for ToastContainer
  remove(id: string | number) {
    sonnerToast.dismiss(id);
  },

  subscribe(callback: (toasts: any[]) => void) {
    // Sonner doesn't expose a subscribe method, so we return a no-op unsubscribe
    // The ToastContainer won't work with this implementation, but it prevents TypeScript errors
    // Consider using Sonner's <Toaster /> component instead
    return () => {};
  },
};

// Helper for API error handling
export function handleApiError(error: unknown, fallbackMessage = 'Une erreur est survenue'): string {
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('Session expirée')) {
      return 'Session expirée - veuillez vous reconnecter';
    }
    if (error.message.includes('Accès refusé')) {
      return 'Accès refusé - permissions insuffisantes';
    }
    if (error.message.includes('Network') || error.message.includes('fetch')) {
      return 'Erreur de connexion - vérifiez votre réseau';
    }
    if (error.message.includes('401')) {
      return 'Non autorisé - veuillez vous reconnecter';
    }
    if (error.message.includes('403')) {
      return 'Accès interdit';
    }
    if (error.message.includes('404')) {
      return 'Ressource non trouvée';
    }
    if (error.message.includes('500')) {
      return 'Erreur serveur - veuillez réessayer';
    }
    return error.message;
  }
  return fallbackMessage;
}

// Wrapper for async operations with automatic toast notifications
export async function withToast<T>(
  operation: () => Promise<T>,
  options: {
    loading?: string;
    success?: string;
    error?: string;
  } = {}
): Promise<T> {
  let loadingId: string | number | undefined;

  if (options.loading) {
    loadingId = toast.loading(options.loading);
  }

  try {
    const result = await operation();

    if (loadingId) {
      toast.dismiss(loadingId);
    }

    if (options.success) {
      toast.success(options.success);
    }

    return result;
  } catch (error) {
    if (loadingId) {
      toast.dismiss(loadingId);
    }

    const errorMessage = handleApiError(error, options.error);
    toast.error(errorMessage);
    throw error;
  }
}
