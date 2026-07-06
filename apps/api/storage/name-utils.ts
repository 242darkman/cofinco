/**
 * Utilitaires de normalisation des noms pour le stockage
 *
 * Convention:
 * - Nom: toujours en MAJUSCULES
 * - Prénom: première lettre de chaque mot en majuscule (capitalisation)
 */

/**
 * Normalise le nom en majuscules
 * Ex: "dupont" -> "DUPONT", "jean-pierre" -> "JEAN-PIERRE"
 */
export function normalizeNom(nom: string): string {
  return nom.trim().toUpperCase();
}

/**
 * Capitalise chaque prénom (première lettre majuscule, reste en minuscules)
 * Gère les prénoms composés avec espaces ou tirets
 * Ex: "jean-pierre" -> "Jean-Pierre", "marie anne" -> "Marie Anne"
 */
export function normalizePrenom(prenom: string | null | undefined): string | null {
  if (!prenom) return null;

  return prenom
    .trim()
    .toLowerCase()
    .split(/(\s+|-)/) // Split on spaces or hyphens, keeping the delimiter
    .map(part => {
      if (part === ' ' || part === '-' || part.match(/^\s+$/)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

/**
 * Normalise un objet contenant nom et prénom
 * Retourne un nouvel objet avec les champs normalisés
 */
export function normalizeNameFields<T extends { nom?: string; prenom?: string | null }>(
  data: T
): T {
  const result = { ...data };

  if (data.nom !== undefined) {
    (result as any).nom = normalizeNom(data.nom);
  }
  if (data.prenom !== undefined) {
    (result as any).prenom = normalizePrenom(data.prenom);
  }

  return result;
}
