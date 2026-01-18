export function normalizeNom(nom?: string | null): string | null | undefined {
  if (typeof nom !== "string") return nom;
  const trimmed = nom.trim();
  if (!trimmed) return trimmed;
  return trimmed.toUpperCase();
}

export function normalizePrenom(prenom?: string | null): string | null | undefined {
  if (typeof prenom !== "string") return prenom;
  const trimmed = prenom.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/(\s+|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

export function normalizePersonFields<T extends { nom?: string | null; prenom?: string | null }>(
  data: T
): T {
  const normalized = { ...data };

  if (Object.prototype.hasOwnProperty.call(normalized, "nom")) {
    normalized.nom = normalizeNom(normalized.nom) as T["nom"];
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "prenom")) {
    normalized.prenom = normalizePrenom(normalized.prenom) as T["prenom"];
  }

  return normalized;
}
