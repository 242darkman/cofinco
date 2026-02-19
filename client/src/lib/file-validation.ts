import { toast } from './toast';
import { MAX_UPLOAD_SIZE_MB } from '@shared/config/storage-paths';

export { MAX_UPLOAD_SIZE_MB };

/**
 * Vérifie la taille d'un fichier avant tout préchargement.
 * Affiche un toast d'erreur et retourne `false` si le fichier est trop volumineux.
 */
export function validateFileSize(file: File, maxMB: number = MAX_UPLOAD_SIZE_MB): boolean {
  if (file.size > maxMB * 1024 * 1024) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    toast.error(`Fichier trop volumineux (${sizeMB} Mo). Taille max : ${maxMB} Mo`);
    return false;
  }
  return true;
}
