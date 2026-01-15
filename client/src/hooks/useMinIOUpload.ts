import { useState } from 'react';

interface UseMinIOUploadOptions {
  path?: string;
  isPublic?: boolean;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
}

export function useMinIOUpload(options: UseMinIOUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Create FormData (NO base64 conversion!)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', options.path || 'misc');
      formData.append('isPublic', String(options.isPublic || false));

      setProgress(30);

      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setProgress(100);
      
      const url = data.url || data.objectKey;
      options.onSuccess?.(url);
      return url;

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
   * Upload using presigned URL (direct to MinIO)
   */
  const uploadWithPresignedUrl = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Step 1: Get presigned URL
      setProgress(10);
      const presignedResponse = await fetch('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          path: options.path || 'misc',
          isPublic: options.isPublic || false,
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, objectKey } = await presignedResponse.json();

      // Step 2: Upload directly to MinIO
      setProgress(30);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setProgress(100);
      options.onSuccess?.(objectKey);
      return objectKey;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Upload failed');
      setError(error);
      options.onError?.(error);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    uploadWithPresignedUrl,
    isUploading,
    progress,
    error,
  };
}
