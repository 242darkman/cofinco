import React from 'react';

/**
 * SuccessCheckmark — coche de validation vectorielle, prolongement visuel du
 * `ClearingRing`.
 *
 * Mêmes dimensions que le `ClearingRing` en taille `xl` (48px, trait 4px) : le
 * cercle se dessine (`drawCircle`) puis la coche s'inscrit (`drawCheck`) avec un
 * léger décalage, donnant l'illusion que l'anneau de chargement s'est mué en
 * validation. Tracé animé via `stroke-dasharray` / `stroke-dashoffset`
 * (composé GPU → 60 FPS), état final conservé (`animation-fill-mode: both`).
 *
 * Contrast-aware : émeraude riche en clair (`emerald-600`), adouci + halo
 * diffus en sombre (`emerald-500` + `emerald-500/10`).
 *
 * Les longueurs sont normalisées par `pathLength` (132 pour le cercle, 30 pour
 * la coche) : les keyframes CSS restent exacts quelle que soit la géométrie.
 */
export interface SuccessCheckmarkProps {
  /** Libellé accessible (défaut : « Connexion validée »). */
  readonly label?: string;
  /** Classes utilitaires additionnelles (marges, centrage…). */
  readonly className?: string;
}

export function SuccessCheckmark({ label = 'Connexion validée', className = '' }: SuccessCheckmarkProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative inline-flex h-12 w-12 items-center justify-center ${className}`}
      // Ressort d'apparition : l'amorti vient de la courbe (overshoot), le
      // keyframe ne gère que l'opacité et l'échelle de base.
      style={{ animation: 'successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
    >
      {/* Halo diffus — uniquement en mode sombre. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden rounded-full bg-emerald-500/10 blur-lg dark:block"
      />

      <svg
        width={48}
        height={48}
        viewBox="0 0 48 48"
        fill="none"
        className="relative stroke-emerald-600 dark:stroke-emerald-500"
      >
        {/* Cercle : tracé depuis le haut, sens horaire. */}
        <circle
          cx="24"
          cy="24"
          r="21"
          pathLength={132}
          strokeWidth={4}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{
            strokeDasharray: 132,
            animation: 'drawCircle 0.5s cubic-bezier(0.65, 0, 0.35, 1) both',
          }}
        />
        {/* Coche : inscrite juste après la fermeture du cercle. */}
        <path
          d="M15 24.5 L21 30.5 L33 16.5"
          pathLength={30}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 30,
            animation: 'drawCheck 0.3s cubic-bezier(0.65, 0, 0.35, 1) 0.38s both',
          }}
        />
      </svg>
    </div>
  );
}

export default SuccessCheckmark;
