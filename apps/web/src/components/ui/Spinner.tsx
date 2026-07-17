import React from 'react';
import { ClearingRing, type SpinnerProps } from './ClearingRing';

/**
 * Spinner — alias applicatif du loader unique `ClearingRing`.
 *
 * Toute l'application importe `Spinner` ; l'implémentation vit désormais dans
 * `ClearingRing` (anneau financier « double anneau » premium). Ce fil mince
 * conserve simplement un libellé accessible neutre (« Chargement ») pour les
 * usages génériques, alors que `ClearingRing` employé directement garde son
 * libellé métier (« Vérification sécurisée en cours »).
 *
 * Il n'existe donc qu'UNE seule source de loader dans l'app.
 */
export type { SpinnerSize, SpinnerTone, SpinnerProps } from './ClearingRing';

export function Spinner({ label = 'Chargement', ...rest }: SpinnerProps) {
  return <ClearingRing label={label} {...rest} />;
}

export default Spinner;
