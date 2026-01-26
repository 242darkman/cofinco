/**
 * ============================================
 * Configuration centralisée des chemins de stockage
 * ============================================
 *
 * Source de vérité unique pour l'organisation des fichiers MinIO.
 * Utilisé côté client ET serveur pour garantir la cohérence.
 */

/**
 * Types de fichiers supportés
 */
export type StorageFileType =
  | 'profile'        // Photos de profil (avatars)
  | 'kyc'            // Documents KYC (pièces d'identité, justificatifs)
  | 'credit'         // Documents de crédit
  | 'employe'        // Documents employés (contrats, fiches de paie)
  | 'tontine'        // Documents tontine
  | 'investigation'  // Photos enquêtes crédit (activité, terrain)
  | 'prospection'    // Photos prospections terrain
  | 'misc';          // Fichiers divers

/**
 * Types d'entités qui peuvent avoir des fichiers
 */
export type StorageEntityType = 'client' | 'user' | 'employe' | 'credit' | 'tontine' | 'prospection';

/**
 * Configuration de bucket par type de fichier
 */
export const STORAGE_CONFIG: Record<StorageFileType, {
  bucket: 'public' | 'private';
  basePath: string;
}> = {
  profile: { bucket: 'public', basePath: 'profiles' },
  kyc: { bucket: 'private', basePath: 'kyc' },
  credit: { bucket: 'private', basePath: 'credits' },
  employe: { bucket: 'private', basePath: 'employes' },
  tontine: { bucket: 'private', basePath: 'tontines' },
  investigation: { bucket: 'public', basePath: 'investigations' },
  prospection: { bucket: 'private', basePath: 'prospections' },
  misc: { bucket: 'private', basePath: 'misc' },
};

/**
 * Génère le chemin de stockage pour un fichier
 * Format: {basePath}/{entityType}/{entityId}/{filename}
 *
 * Exemples:
 * - profiles/client/abc123/avatar.jpg
 * - kyc/client/abc123/cni-recto.pdf
 * - credits/credit/xyz789/contrat.pdf
 *
 * @param fileType - Type de fichier (profile, kyc, etc.)
 * @param entityType - Type d'entité (client, user, employe)
 * @param entityId - ID de l'entité
 * @returns Chemin de base pour le stockage (sans le nom de fichier)
 */
export function getStoragePath(
  fileType: StorageFileType,
  entityType: StorageEntityType,
  entityId: string
): string {
  const config = STORAGE_CONFIG[fileType];
  return `${config.basePath}/${entityType}/${entityId}`;
}

/**
 * Vérifie si un type de fichier est public
 */
export function isPublicFileType(fileType: StorageFileType): boolean {
  return STORAGE_CONFIG[fileType].bucket === 'public';
}

/**
 * Extrait les informations d'un chemin de stockage
 *
 * @param path - Chemin complet du fichier (ex: profiles/client/abc123/avatar.jpg)
 * @returns Informations extraites ou null si format invalide
 */
export function parseStoragePath(path: string): {
  fileType: StorageFileType;
  entityType: StorageEntityType;
  entityId: string;
  filename: string;
} | null {
  // Normaliser le chemin
  const cleanPath = path.replace(/^\//, '').replace(/\/+/g, '/');
  const parts = cleanPath.split('/');

  if (parts.length < 4) return null;

  const [basePath, entityType, entityId, ...filenameParts] = parts;
  const filename = filenameParts.join('/');

  // Trouver le fileType correspondant au basePath
  const fileTypeEntry = Object.entries(STORAGE_CONFIG).find(
    ([_, config]) => config.basePath === basePath
  );

  if (!fileTypeEntry) return null;

  const validEntityTypes: StorageEntityType[] = ['client', 'user', 'employe', 'credit', 'tontine', 'prospection'];
  if (!validEntityTypes.includes(entityType as StorageEntityType)) return null;

  return {
    fileType: fileTypeEntry[0] as StorageFileType,
    entityType: entityType as StorageEntityType,
    entityId,
    filename,
  };
}

/**
 * Génère le pattern glob pour lister tous les fichiers d'une entité
 * Utilisé pour la suppression en cascade
 *
 * @param entityType - Type d'entité
 * @param entityId - ID de l'entité
 * @returns Pattern pour lister les fichiers
 */
export function getEntityFilesPattern(
  entityType: StorageEntityType,
  entityId: string
): { publicPattern: string; privatePattern: string } {
  return {
    publicPattern: `*/${entityType}/${entityId}/*`,
    privatePattern: `*/${entityType}/${entityId}/*`,
  };
}

