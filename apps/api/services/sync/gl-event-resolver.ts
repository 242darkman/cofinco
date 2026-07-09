/**
 * Résolution des événements GL de la synchronisation offline.
 *
 * Module pur (sans accès base) pour rester importable par les tests de
 * contrat de cohérence seeds ↔ sync.
 */

/**
 * Résout l'événement GL final : DEPOSIT/WITHDRAWAL sont suffixés selon le
 * type de compte (règles seedées DEPOSIT_CURRENT, WITHDRAWAL_SAVINGS, ...).
 * Les autres événements sont retournés tels quels.
 */
export function resolveGlEventType(
  baseEventType: string,
  typeCompte: string | null | undefined,
): string {
  if (baseEventType !== 'DEPOSIT' && baseEventType !== 'WITHDRAWAL') {
    return baseEventType;
  }
  switch (typeCompte) {
    case 'SAVINGS': return `${baseEventType}_SAVINGS`;
    case 'BLOCKED': return `${baseEventType}_BLOCKED`;
    case 'CURRENT':
    default:
      return `${baseEventType}_CURRENT`;
  }
}
