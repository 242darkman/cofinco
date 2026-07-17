import React from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { CloudOff, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';

interface NetworkOverlayProps {
  isOpen: boolean;
  isChecking?: boolean;
  onRetry: () => void;
}

export default function NetworkOverlay({ isOpen, isChecking = false, onRetry }: NetworkOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-surface-base/70 backdrop-blur-md" />
      <div className="absolute -top-20 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-status-success-bg blur-3xl" />

      <div className="relative z-10 flex min-h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface-base/80 p-8 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-base/80 text-accent ring-1 ring-accent/20">
              <CloudOff className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent/70">Reconnexion</p>
              <h2 className="mt-2 text-2xl font-semibold text-content-primary">Connexion au serveur perdue</h2>
              <p className="mt-2 text-sm text-content-secondary">Tentative de reconnexion...</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 text-content-secondary">
            <Spinner size="sm" />
            <span className="text-sm">
              {isChecking ? 'Verification en cours...' : 'En attente du serveur.'}
            </span>
          </div>

          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full w-1/3 rounded-full bg-linear-to-r from-accent via-blue-400 to-status-success"
              style={{ animation: 'network-bar 1.6s ease-in-out infinite' }}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" icon={RefreshCw} onClick={onRetry} disabled={isChecking}>
              Reessayer maintenant
            </Button>
            <p className="text-xs text-content-muted">
              Les requetes sont mises en pause pour eviter les erreurs.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes network-bar {
          0% { transform: translateX(-120%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}
