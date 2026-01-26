import { useState, useCallback } from 'react';
import type {
  StorageFileType,
  StorageEntityType,
} from '@shared/config/storage-paths';

/**
 * ============================================
 * Hook unifié pour l'upload de fichiers organisés par entité
 * ============================================
 *
 * Utilise la nouvelle API V2 qui organise automatiquement les fichiers
 * par entité dans MinIO: {basePath}/{entityType}/{entityId}/{filename}
 *
 * Avantages:
 * - Organisation claire des fichiers
 * - Suppression cascade automatique quand l'entité est supprimée
 * - API simplifiée pour tous les types de fichiers
 *
 * @example
 * ```tsx
 * // Upload photo de profil client
 * const { uploadFile, isUploading } = useEntityUpload({
 *   fileType: 'profile',
 *   entityType: 'client',
 *   entityId: clientId,
 *   onSuccess: (result) => {
 *     // result.key contient l'object key à stocker en DB
 *     updateClientPhoto(result.key);
 *   }
 * });
 *
 * // Upload document KYC
 * const { uploadFile: uploadKyc } = useEntityUpload({
 *   fileType: 'kyc',
 *   entityType: 'client',
 *   entityId: clientId,
 * });
 * ```
 */

interface UploadResult {
  key: string;          // Object key (à stocker en DB)
  url: string | null;   // URL complète (null si fichier privé)
  fileType: StorageFileType;
  entityType: StorageEntityType;
  entityId: string;
}

interface UseEntityUploadOptions {
  fileType: StorageFileType;
  entityType: StorageEntityType;
  entityId: string;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

export function useEntityUpload(options: UseEntityUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Upload un fichier via le backend avec organisation par entité
   * @returns L'object key (à stocker en DB) ou null en cas d'erreur
   */
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', options.fileType);
      formData.append('entityType', options.entityType);
      formData.append('entityId', options.entityId);

      setProgress(30);

      const response = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setProgress(100);

      const result: UploadResult = {
        key: data.key,
        url: data.url,
        fileType: data.fileType,
        entityType: data.entityType,
        entityId: data.entityId,
      };

      options.onSuccess?.(result);
      return result.key;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Upload failed');
      setError(error);
      options.onError?.(error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [options]);

  /**
   * Upload via URL présignée (plus rapide pour gros fichiers)
   */
  const uploadWithPresignedUrl = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Étape 1: Obtenir l'URL présignée
      setProgress(10);
      const presignedResponse = await fetch('/api/storage/entity/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileType: options.fileType,
          entityType: options.entityType,
          entityId: options.entityId,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, key, isPublic } = await presignedResponse.json();

      // Étape 2: Upload direct vers MinIO
      setProgress(30);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setProgress(100);

      const result: UploadResult = {
        key,
        url: isPublic ? `/api/storage/files/${key}` : null,
        fileType: options.fileType,
        entityType: options.entityType,
        entityId: options.entityId,
      };

      options.onSuccess?.(result);
      return result.key;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Upload failed');
      setError(error);
      options.onError?.(error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [options]);

  /**
   * Supprime un fichier par sa clé
   */
  const deleteFile = useCallback(async (key: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    uploadFile,
    uploadWithPresignedUrl,
    deleteFile,
    isUploading,
    progress,
    error,
  };
}

/**
 * Hook simplifié pour upload de photo de profil
 */
export function useProfileUpload(
  entityType: 'client' | 'user' | 'employe',
  entityId: string,
  onSuccess?: (key: string) => void
) {
  return useEntityUpload({
    fileType: 'profile',
    entityType,
    entityId,
    onSuccess: onSuccess ? (result) => onSuccess(result.key) : undefined,
  });
}

/**
 * Hook simplifié pour upload de documents KYC
 */
export function useKycUpload(
  clientId: string,
  onSuccess?: (key: string) => void
) {
  return useEntityUpload({
    fileType: 'kyc',
    entityType: 'client',
    entityId: clientId,
    onSuccess: onSuccess ? (result) => onSuccess(result.key) : undefined,
  });
}

/**
 * Hook simplifié pour upload de documents crédit
 */
export function useCreditDocUpload(
  creditId: string,
  onSuccess?: (key: string) => void
) {
  return useEntityUpload({
    fileType: 'credit',
    entityType: 'credit',
    entityId: creditId,
    onSuccess: onSuccess ? (result) => onSuccess(result.key) : undefined,
  });
}

/**
 * Hook simplifié pour upload de photos d'enquête crédit
 */
export function useInvestigationUpload(
  creditId: string,
  onSuccess?: (key: string) => void
) {
  return useEntityUpload({
    fileType: 'investigation',
    entityType: 'credit',
    entityId: creditId,
    onSuccess: onSuccess ? (result) => onSuccess(result.key) : undefined,
  });
}

/**
 * Hook simplifié pour upload de photos de prospection
 */
export function useProspectionUpload(
  prospectionId: string,
  onSuccess?: (key: string) => void
) {
  return useEntityUpload({
    fileType: 'prospection',
    entityType: 'prospection',
    entityId: prospectionId,
    onSuccess: onSuccess ? (result) => onSuccess(result.key) : undefined,
  });
}
