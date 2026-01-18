import { useState, useCallback } from 'react';

interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
}

interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export function useImageCompression(options: CompressionOptions = {}) {
  const {
    maxSizeMB = 2,
    maxWidthOrHeight = 1920,
    useWebWorker = true
  } = options;

  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const compressImage = useCallback(async (file: File): Promise<CompressionResult> => {
    setIsCompressing(true);
    setError(null);

    const originalSize = file.size;

    // Skip compression for non-image files or small files
    if (!file.type.startsWith('image/') || file.size <= maxSizeMB * 1024 * 1024) {
      setIsCompressing(false);
      return {
        file,
        originalSize,
        compressedSize: file.size,
        compressionRatio: 1,
      };
    }

    try {
      // Dynamic import for browser-image-compression
      const imageCompression = (await import('browser-image-compression')).default;

      const compressedFile = await imageCompression(file, {
        maxSizeMB,
        maxWidthOrHeight,
        useWebWorker,
        fileType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        initialQuality: 0.85,
      });

      // Preserve original filename
      const resultFile = new File([compressedFile], file.name, {
        type: compressedFile.type,
        lastModified: Date.now(),
      });

      const compressedSize = resultFile.size;

      return {
        file: resultFile,
        originalSize,
        compressedSize,
        compressionRatio: originalSize / compressedSize,
      };
    } catch (err) {
      const compressionError = err instanceof Error ? err : new Error('Compression failed');
      setError(compressionError);
      // Return original file on error
      return {
        file,
        originalSize,
        compressedSize: file.size,
        compressionRatio: 1,
      };
    } finally {
      setIsCompressing(false);
    }
  }, [maxSizeMB, maxWidthOrHeight, useWebWorker]);

  const shouldCompress = useCallback((file: File): boolean => {
    return file.type.startsWith('image/') && file.size > maxSizeMB * 1024 * 1024;
  }, [maxSizeMB]);

  return {
    compressImage,
    shouldCompress,
    isCompressing,
    error,
  };
}
