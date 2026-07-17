import React from 'react';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { ClearingRing } from '@/components/ui/ClearingRing';

/**
 * LoadingScreen — écran de chargement plein écran, premium et multi-tenant.
 *
 * Unifié sur le loader financier `ClearingRing` (le triple-ring `ModernSpinner`
 * est déprécié). Contrast-aware : fond neutre lumineux en clair
 * (`bg-white`), anthracite profond en sombre (`dark:bg-slate-950`), avec un
 * halo d'accent tenant discret. Toutes les teintes (anneau, rail, remplissage,
 * halo) dérivent des variables de marque `--accent-primary` /
 * `--accent-primary-rgb`, garantissant l'auto-adaptation instantanée au tenant.
 */

interface LoadingScreenProps {
  /** Message principal (défaut : « Chargement... »). */
  readonly message?: string;
  /** Plein écran (défaut) ou bloc inline centré. */
  readonly fullScreen?: boolean;
  /** Affiche le logo du tenant. */
  readonly showLogo?: boolean;
  /**
   * Durée de remplissage de la barre interne (ms). À caler sur la durée de
   * l'étape orchestrante pour une progression continue et sans saccade.
   */
  readonly progressDurationMs?: number;
}

/**
 * Barre de progression interne : rail translucide dérivé de l'accent tenant +
 * remplissage animé en `scaleX` (composé par le GPU → 60 FPS), synchronisé sur
 * la durée de l'étape pour une sensation d'accélération fluide.
 */
function StepProgressBar({ durationMs }: { readonly durationMs: number }) {
  return (
    <div
      className="mx-auto mt-8 h-1.5 w-48 overflow-hidden rounded-full"
      style={{ backgroundColor: 'rgba(var(--accent-primary-rgb), 0.1)' }}
    >
      <div
        className="h-full w-full origin-left rounded-full"
        style={{
          background: 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))',
          boxShadow: '0 0 8px rgba(var(--accent-primary-rgb), 0.5)',
          transform: 'scaleX(0)',
          animation: `loadingFillX ${durationMs}ms cubic-bezier(0.4, 0, 1, 1) forwards`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}

export default function LoadingScreen({
  message = 'Chargement...',
  fullScreen = true,
  showLogo = false,
  progressDurationMs = 800,
}: LoadingScreenProps) {
  if (!fullScreen) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-12">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <ClearingRing size="lg" tone="accent" />
          </div>
          <p className="text-content-secondary">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-white dark:bg-slate-950">
      {/* Halo d'accent tenant : discret en clair, plus présent en sombre. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(var(--accent-primary-rgb), 0.10), transparent 60%)',
        }}
      />

      <div className="relative text-center">
        {showLogo && (
          <div className="mb-8 inline-flex">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white dark:bg-slate-900"
              style={{
                boxShadow:
                  '0 20px 40px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(var(--accent-primary-rgb), 0.12)',
              }}
            >
              <TenantLogo className="h-16 w-16 object-contain" />
            </div>
          </div>
        )}

        <div className="mb-8 flex justify-center">
          <ClearingRing size="xl" tone="accent" />
        </div>

        <h3 className="text-xl font-bold text-content-primary">{message}</h3>
        <p className="mt-1 text-content-muted">Veuillez patienter…</p>

        <StepProgressBar durationMs={progressDurationMs} />
      </div>
    </div>
  );
}
