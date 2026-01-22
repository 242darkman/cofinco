import { useState } from 'react';

/**
 * Résultat d'un upload
 * - key: l'object key à stocker en base de données
 * - url: l'URL complète pour affichage (null si fichier privé)
 */
interface UploadResult {
  key: string;
  url: string | null;
}

interface UseMinIOUploadOptions {
  path?: string;
  isPublic?: boolean;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook pour uploader des fichiers vers MinIO via l'API /api/storage
 *
 * IMPORTANT: Ce hook retourne TOUJOURS l'object key (pas l'URL).
 * Stockez le `key` en base de données, pas l'URL.
 */
export function useMinIOUpload(options: UseMinIOUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Upload un fichier via le backend
   * @returns L'object key (à stocker en DB) ou null en cas d'erreur
   */
  const uploadFile = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', options.path || 'misc');
      formData.append('isPublic', String(options.isPublic ?? false));

      setProgress(30);

      const response = await fetch('/api/storage/upload', {
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

      // Retourner l'object key (JAMAIS l'URL pour stockage)
      const result: UploadResult = {
        key: data.key,
        url: data.url,
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
  };

  /**
   * Upload via URL présignée (direct vers MinIO, plus rapide pour gros fichiers)
   * @returns L'object key (à stocker en DB) ou null en cas d'erreur
   */
  const uploadWithPresignedUrl = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Étape 1: Obtenir l'URL présignée
      setProgress(10);
      const presignedResponse = await fetch('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          path: options.path || 'misc',
          isPublic: options.isPublic ?? false,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, key } = await presignedResponse.json();

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
        url: options.isPublic ? `/api/storage/files/${key}` : null,
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
  };

  /**
   * Supprime un fichier par sa clé
   */
  const deleteFile = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  return {
    uploadFile,
    uploadWithPresignedUrl,
    deleteFile,
    isUploading,
    progress,
    error,
  };
}
