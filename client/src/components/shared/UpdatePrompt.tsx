import React from 'react';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export function UpdatePrompt() {
  const { isUpdateAvailable, reloadPage } = useAutoUpdate();

  React.useEffect(() => {
    if (isUpdateAvailable) {
      toast.custom((id) => (
        <div className="flex flex-col gap-3 w-full bg-surface border border-edge rounded-lg shadow-lg p-4 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-4">
            <div className="bg-status-info-bg p-2 rounded-full text-status-info">
              <RefreshCw className="h-5 w-5 animate-spin-slow" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-content-primary">
                Mise à jour disponible
              </h3>
              <p className="text-sm text-content-muted mt-1">
                Une nouvelle version de l'application ({__APP_VERSION__}) est disponible. Veuillez rafraîchir pour en profiter.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => toast.dismiss(id)}
              className="px-3 py-1.5 text-sm md:text-xs text-content-muted hover:text-content-secondary transition-colors"
            >
              Ignorer
            </button>
            <button
              onClick={() => {
                toast.dismiss(id);
                reloadPage();
              }}
              className="px-4 py-1.5 text-sm md:text-xs bg-surface-base text-content-primary rounded-md hover:bg-surface transition-colors font-medium flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Rafraîchir maintenant
            </button>
          </div>
        </div>
      ), {
        duration: Infinity, // Ne disparait pas tout seul
        position: 'top-center',
        id: 'update-prompt', // Unique ID to prevent duplicates
      });
    }
  }, [isUpdateAvailable, reloadPage]);

  return null; // Ce composant ne rend rien directement, il utilise sonner
}
