/**
 * Hook d'orchestration de SmartDocumentUpload : validation, aperçu local,
 * compression, upload (ou mode différé) et transitions d'état.
 */

import { useState, useRef, useCallback, type ChangeEvent, type MouseEvent } from 'react';
import { useEntityUpload } from '../../../hooks/useEntityUpload';
import { useImageCompression } from '../../../hooks/useImageCompression';
import { useSecureDocument } from '../../../hooks/useSecureDocument';
import { validateFileSize } from '../../../lib/file-validation';
import type { SmartDocumentUploadProps, UploadedDocument, UploadState } from './types';

type HookProps = Pick<
  SmartDocumentUploadProps,
  | 'documentType' | 'onUploadComplete' | 'onRemove' | 'existingDocument'
  | 'isPrivate' | 'accept' | 'maxSizeMB' | 'disabled'
  | 'fileType' | 'entityType' | 'entityId' | 'deferUpload' | 'onFileSelected'
>;

export function useSmartDocumentUpload({
  documentType,
  onUploadComplete,
  onRemove,
  existingDocument,
  isPrivate = true,
  accept = 'image/*',
  maxSizeMB = 5,
  disabled = false,
  fileType,
  entityType,
  entityId,
  deferUpload = false,
  onFileSelected,
}: HookProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>(existingDocument ? 'success' : 'empty');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [currentDocument, setCurrentDocument] = useState<UploadedDocument | null>(existingDocument || null);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [isNewlyUploaded, setIsNewlyUploaded] = useState(false);

  // Upload lié à l'entité
  const { uploadFile, isUploading } = useEntityUpload({
    fileType: fileType || (isPrivate ? 'kyc' : 'profile'),
    entityType: entityType || 'client',
    entityId: entityId || '',
    onError: (err) => {
      setUploadState('error');
      setErrorMessage(err.message || 'Upload failed');
    },
  });

  const { compressImage, isCompressing, shouldCompress } = useImageCompression({
    maxSizeMB: 2, // Compresser au-delà de 2 Mo
    maxWidthOrHeight: 1920,
  });

  // Documents privés : URL signée — uniquement pour les documents existants, pas ceux fraîchement uploadés
  const { url: signedUrl, isLoading: isLoadingSignedUrl } = useSecureDocument(
    isPrivate && currentDocument?.documentUrl && !currentDocument.documentUrl.startsWith('http') && !isNewlyUploaded
      ? currentDocument.id
      : null
  );

  // Retour haptique
  const triggerHaptic = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  // URL d'affichage du document
  const getDisplayUrl = useCallback((): string | null => {
    if (localPreview) return localPreview;
    if (!currentDocument) return null;

    const docUrl = currentDocument.documentUrl;
    if (!docUrl) return null;

    // Déjà une URL complète
    if (docUrl.startsWith('http') || docUrl.startsWith('data:')) {
      return docUrl;
    }

    // Documents privés : URL signée
    if (isPrivate && signedUrl) {
      return signedUrl;
    }

    // Documents publics ou repli : passer par l'API
    return `/api/storage/files/${docUrl}`;
  }, [currentDocument, isPrivate, signedUrl, localPreview]);

  // Validation du fichier
  const validateFile = useCallback((file: File): string | null => {
    const maxBytes = maxSizeMB * 1024 * 1024;

    // Vérifier le type — gère les types MIME séparés par des virgules
    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const isTypeValid = acceptedTypes.some(acceptedType => {
        // Gérer les jokers comme 'image/*'
        if (acceptedType.endsWith('/*')) {
          const baseType = acceptedType.replace('/*', '');
          return file.type.startsWith(baseType + '/');
        }
        // Correspondance exacte
        return file.type === acceptedType;
      });

      if (!isTypeValid) {
        return `Type non autorisé. Accepté: PNG, JPG, PDF`;
      }
    }

    // Vérifier la taille (avant compression)
    if (file.size > maxBytes * 2) { // Tolère 2x puisqu'on compresse ensuite
      return `Fichier trop volumineux (max ${maxSizeMB * 2}MB)`;
    }

    return null;
  }, [accept, maxSizeMB]);

  // Aperçu local
  const createPreview = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  // Sélection d'un fichier
  const handleFileSelect = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadState('error');
      setErrorMessage(validationError);
      return;
    }

    setUploadState('loading');
    setErrorMessage(null);
    setProgress(10);

    try {
      // Aperçu immédiat pour une meilleure UX
      const preview = await createPreview(file);
      if (preview) setLocalPreview(preview);
      setProgress(20);

      // Compression si nécessaire
      let fileToUpload = file;
      if (shouldCompress(file)) {
        setProgress(30);
        const result = await compressImage(file);
        fileToUpload = result.file;
        setProgress(50);
      } else {
        setProgress(50);
      }

      // Un PDF ne peut pas être prévisualisé comme image
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      // Mode différé : conserver le fichier localement sans uploader (entité pas encore créée)
      if (deferUpload) {
        setProgress(80);
        onFileSelected?.(fileToUpload);

        const tempDocument: UploadedDocument = {
          id: crypto.randomUUID(),
          documentType,
          documentName: file.name,
          documentUrl: preview || '',
          status: 'pending',
          createdAt: new Date().toISOString(),
          isPrivate,
        };

        setIsPdfFile(isPdf);
        setIsNewlyUploaded(true);
        setCurrentDocument(tempDocument);
        setUploadState('success');
        setProgress(100);
        if (isPdf) setLocalPreview(null);
        triggerHaptic();
        onUploadComplete(tempDocument);
        return;
      }

      // Upload
      setProgress(60);
      const objectKeyOrUrl = await uploadFile(fileToUpload);

      if (!objectKeyOrUrl) {
        throw new Error('Upload returned empty result');
      }

      setProgress(90);

      const newDocument: UploadedDocument = {
        id: crypto.randomUUID(),
        documentType,
        documentName: file.name,
        documentUrl: objectKeyOrUrl,
        status: 'pending',
        createdAt: new Date().toISOString(),
        isPrivate,
      };

      setIsPdfFile(isPdf);
      setIsNewlyUploaded(true);

      setCurrentDocument(newDocument);
      setUploadState('success');
      setProgress(100);

      // Conserver l'aperçu local pour les images, l'effacer pour les PDF
      if (isPdf) {
        setLocalPreview(null);
      }

      triggerHaptic();
      onUploadComplete(newDocument);

    } catch (err) {
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
      setLocalPreview(null);
      setIsPdfFile(false);
    }
  }, [validateFile, createPreview, shouldCompress, compressImage, uploadFile, documentType, isPrivate, onUploadComplete, triggerHaptic, deferUpload, onFileSelected]);

  // Changement de l'input fichier
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!validateFileSize(file, maxSizeMB)) {
        e.target.value = '';
        return;
      }
      handleFileSelect(file);
    }
    // Réinitialiser pour permettre de resélectionner le même fichier
    e.target.value = '';
  }, [handleFileSelect, maxSizeMB]);

  // Clic sur la zone d'upload
  const handleCardClick = useCallback(() => {
    if (disabled || isUploading || isCompressing) return;
    fileInputRef.current?.click();
  }, [disabled, isUploading, isCompressing]);

  // Suppression
  const handleRemove = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setCurrentDocument(null);
    setUploadState('empty');
    setLocalPreview(null);
    setErrorMessage(null);
    setIsPdfFile(false);
    setIsNewlyUploaded(false);
    onRemove?.();
  }, [onRemove]);

  // Nouvelle tentative
  const handleRetry = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setUploadState('empty');
    setErrorMessage(null);
    fileInputRef.current?.click();
  }, []);

  const displayUrl = getDisplayUrl();
  const isLoadingDisplay = uploadState === 'loading' || isLoadingSignedUrl;

  return {
    fileInputRef,
    uploadState,
    progress,
    errorMessage,
    localPreview,
    currentDocument,
    isPdfFile,
    displayUrl,
    isLoadingDisplay,
    isUploading,
    isCompressing,
    handleInputChange,
    handleCardClick,
    handleRemove,
    handleRetry,
  };
}

export type SmartDocumentUploadController = ReturnType<typeof useSmartDocumentUpload>;
