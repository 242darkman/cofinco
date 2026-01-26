import React, { useState, useRef, useCallback } from 'react';
import { Camera, RefreshCw, Check, AlertCircle, X, Loader2, User, FileText } from 'lucide-react';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import type { StorageFileType, StorageEntityType } from '@shared/config/storage-paths';
import { useImageCompression } from '../../hooks/useImageCompression';
import { useSecureDocument } from '../../hooks/useSecureDocument';

export type DocumentType = 'ID_CARD_FRONT' | 'ID_CARD_BACK' | 'PROOF_OF_ADDRESS' | 'AVATAR' | 'OTHER';

export interface UploadedDocument {
  id: string;
  documentType: DocumentType;
  documentName: string;
  documentUrl: string; // MinIO object key for private, full URL for public
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  isPrivate: boolean;
}

export type UploadVariant = 'default' | 'avatar' | 'card';
export type AspectRatioType = 'auto' | 'video' | 'square' | 'card';

interface SmartDocumentUploadProps {
  label: string;
  documentType: DocumentType;
  onUploadComplete: (doc: UploadedDocument) => void;
  onRemove?: () => void;
  existingDocument?: UploadedDocument | null;
  isPrivate?: boolean;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
  disabled?: boolean;
  /** UI variant: 'default', 'avatar' (circular), or 'card' (document aspect) */
  variant?: UploadVariant;
  /** Aspect ratio for the upload zone */
  aspectRatio?: AspectRatioType;
  /** Watermark icon type for empty state */
  watermarkIcon?: 'front' | 'back' | 'scan' | 'none';
  /** Custom CTA text for empty state */
  ctaText?: string;
  /** Entity-based upload params */
  fileType?: StorageFileType;
  entityType?: StorageEntityType;
  entityId?: string;
  /** Deferred upload mode — stores file locally without uploading (for entity creation flows) */
  deferUpload?: boolean;
  /** Called with the (compressed) file when deferUpload is true */
  onFileSelected?: (file: File) => void;
}

type UploadState = 'empty' | 'loading' | 'success' | 'error';

// Circular Progress Ring component
function CircularProgress({ progress, size = 48 }: { progress: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-slate-700"
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="text-cyan-400 transition-all duration-300 ease-out"
      />
    </svg>
  );
}

// Watermark SVG icons
function WatermarkIcon({ icon, className = '' }: { icon: 'front' | 'back' | 'scan'; className?: string }) {
  if (icon === 'front') {
    return (
      <svg viewBox="0 0 64 40" className={className} fill="currentColor">
        <rect x="2" y="2" width="60" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="16" r="8" />
        <rect x="30" y="10" width="24" height="3" rx="1.5" />
        <rect x="30" y="17" width="18" height="3" rx="1.5" />
        <rect x="30" y="24" width="20" height="3" rx="1.5" />
      </svg>
    );
  }
  if (icon === 'back') {
    return (
      <svg viewBox="0 0 64 40" className={className} fill="currentColor">
        <rect x="2" y="2" width="60" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="2" y="8" width="60" height="8" />
        <rect x="8" y="22" width="30" height="3" rx="1.5" />
        <rect x="8" y="28" width="24" height="3" rx="1.5" />
        <rect x="44" y="20" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  // scan
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor">
      <path d="M4 12V8a4 4 0 014-4h4M36 4h4a4 4 0 014 4v4M44 36v4a4 4 0 01-4 4h-4M12 44H8a4 4 0 01-4-4v-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="12" y="12" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2" className="animate-pulse" />
    </svg>
  );
}

export function SmartDocumentUpload({
  label,
  documentType,
  onUploadComplete,
  onRemove,
  existingDocument,
  isPrivate = true,
  accept = 'image/*',
  maxSizeMB = 5,
  className = '',
  disabled = false,
  variant = 'default',
  aspectRatio = 'auto',
  watermarkIcon = 'scan',
  ctaText,
  fileType,
  entityType,
  entityId,
  deferUpload = false,
  onFileSelected,
}: SmartDocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>(existingDocument ? 'success' : 'empty');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [currentDocument, setCurrentDocument] = useState<UploadedDocument | null>(existingDocument || null);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [isNewlyUploaded, setIsNewlyUploaded] = useState(false);

  // Hooks — entity-based upload
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
    maxSizeMB: 2, // Compress if larger than 2MB
    maxWidthOrHeight: 1920,
  });

  // For private documents, get signed URL - only for existing documents, not newly uploaded ones
  const { url: signedUrl, isLoading: isLoadingSignedUrl } = useSecureDocument(
    isPrivate && currentDocument?.documentUrl && !currentDocument.documentUrl.startsWith('http') && !isNewlyUploaded
      ? currentDocument.id
      : null
  );

  // Haptic feedback helper
  const triggerHaptic = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  // Get display URL for the document
  const getDisplayUrl = useCallback((): string | null => {
    if (localPreview) return localPreview;
    if (!currentDocument) return null;

    const docUrl = currentDocument.documentUrl;
    if (!docUrl) return null;

    // Already a full URL
    if (docUrl.startsWith('http') || docUrl.startsWith('data:')) {
      return docUrl;
    }

    // For private docs, use signed URL
    if (isPrivate && signedUrl) {
      return signedUrl;
    }

    // For public docs or as fallback, route through API
    return `/api/storage/files/${docUrl}`;
  }, [currentDocument, isPrivate, signedUrl, localPreview]);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    const maxBytes = maxSizeMB * 1024 * 1024;

    // Check type - handle comma-separated MIME types
    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const isTypeValid = acceptedTypes.some(acceptedType => {
        // Handle wildcards like 'image/*'
        if (acceptedType.endsWith('/*')) {
          const baseType = acceptedType.replace('/*', '');
          return file.type.startsWith(baseType + '/');
        }
        // Exact match
        return file.type === acceptedType;
      });
      
      if (!isTypeValid) {
        return `Type non autorisé. Accepté: PNG, JPG, PDF`;
      }
    }

    // Check size (before compression)
    if (file.size > maxBytes * 2) { // Allow 2x since we'll compress
      return `Fichier trop volumineux (max ${maxSizeMB * 2}MB)`;
    }

    return null;
  }, [accept, maxSizeMB]);

  // Create local preview
  const createPreview = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    // Validate
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
      // Create preview immediately for better UX
      const preview = await createPreview(file);
      if (preview) setLocalPreview(preview);
      setProgress(20);

      // Compress if needed
      let fileToUpload = file;
      if (shouldCompress(file)) {
        setProgress(30);
        const result = await compressImage(file);
        fileToUpload = result.file;
        setProgress(50);
      } else {
        setProgress(50);
      }

      // Track if this is a PDF (can't preview as image)
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      // Defer mode: store file locally without uploading (entity not yet created)
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

      // Create document object
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

      // Keep local preview for images, clear for PDFs
      if (isPdf) {
        setLocalPreview(null);
      }

      // Haptic feedback on success
      triggerHaptic();

      // Notify parent
      onUploadComplete(newDocument);

    } catch (err) {
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
      setLocalPreview(null);
      setIsPdfFile(false);
    }
  }, [validateFile, createPreview, shouldCompress, compressImage, uploadFile, documentType, isPrivate, onUploadComplete, triggerHaptic, deferUpload, onFileSelected]);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input value to allow re-selecting same file
    e.target.value = '';
  }, [handleFileSelect]);

  // Handle click on card
  const handleCardClick = useCallback(() => {
    if (disabled || isUploading || isCompressing) return;
    fileInputRef.current?.click();
  }, [disabled, isUploading, isCompressing]);

  // Handle remove
  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDocument(null);
    setUploadState('empty');
    setLocalPreview(null);
    setErrorMessage(null);
    setIsPdfFile(false);
    setIsNewlyUploaded(false);
    onRemove?.();
  }, [onRemove]);

  // Handle retry
  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadState('empty');
    setErrorMessage(null);
    fileInputRef.current?.click();
  }, []);

  // Determine display URL
  const displayUrl = getDisplayUrl();
  const isLoadingDisplay = uploadState === 'loading' || isLoadingSignedUrl;

  // Get aspect ratio class
  const getAspectRatioClass = () => {
    if (variant === 'avatar') return '';
    switch (aspectRatio) {
      case 'video': return 'aspect-video';
      case 'square': return 'aspect-square';
      case 'card': return 'aspect-[16/10]'; // Credit card ratio
      default: return '';
    }
  };

  // Get CTA text
  const getCtaText = () => {
    if (ctaText) return ctaText;
    if (watermarkIcon === 'front') return 'Scanner le Recto';
    if (watermarkIcon === 'back') return 'Scanner le Verso';
    return 'Appuyer pour ajouter';
  };

  // Avatar Variant
  if (variant === 'avatar') {
    return (
      <div className={`relative ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {/* Avatar Circle */}
        <div
          onClick={handleCardClick}
          className={`
            relative w-32 h-32 rounded-full overflow-hidden
            border-4 border-slate-700 bg-slate-800
            ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            transition-all duration-200 hover:border-cyan-500
          `}
        >
          {/* Empty State - User Icon */}
          {uploadState === 'empty' && (
            <div className="flex items-center justify-center w-full h-full">
              <User className="w-16 h-16 text-slate-600" />
            </div>
          )}

          {/* Loading State */}
          {uploadState === 'loading' && (
            <div className="relative w-full h-full">
              {localPreview && (
                <img
                  src={localPreview}
                  alt="Uploading..."
                  className="w-full h-full object-cover blur-sm opacity-40"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                <CircularProgress progress={progress} size={56} />
              </div>
            </div>
          )}

          {/* Success State */}
          {uploadState === 'success' && displayUrl && (
            <img
              src={displayUrl}
              alt={label}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,' + encodeURIComponent(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
                    <rect fill="#1e293b" width="128" height="128"/>
                    <circle cx="64" cy="48" r="24" fill="#475569"/>
                    <ellipse cx="64" cy="100" rx="36" ry="24" fill="#475569"/>
                  </svg>
                `);
              }}
            />
          )}

          {/* Error State */}
          {uploadState === 'error' && (
            <div className="flex flex-col items-center justify-center w-full h-full bg-red-900/20">
              <AlertCircle className="w-10 h-10 text-red-400 mb-1" />
              <span className="text-xs text-red-400 text-center px-2">{errorMessage || 'Erreur'}</span>
            </div>
          )}
        </div>

        {/* Camera Edit Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCardClick();
          }}
          disabled={disabled || isUploading || isCompressing}
          className={`
            absolute bottom-0 right-0 p-3 rounded-full
            bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg
            transition-all duration-200 hover:scale-110
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Remove Button (if has content) */}
        {uploadState === 'success' && onRemove && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-0 right-0 p-1.5 rounded-full bg-red-500 hover:bg-red-400 text-white shadow-lg transition-all duration-200 hover:scale-110"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  // Default / Card Variant
  return (
    <div className={`relative ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Main Card */}
      <div
        onClick={handleCardClick}
        className={`
          relative overflow-hidden rounded-xl border-2 transition-all duration-200
          ${getAspectRatioClass()}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${uploadState === 'empty' ? 'border-dashed border-slate-600 hover:border-cyan-500 hover:bg-slate-800/30' : ''}
          ${uploadState === 'loading' ? 'border-cyan-500/50 bg-cyan-500/5' : ''}
          ${uploadState === 'success' ? 'border-slate-700 bg-slate-800/50' : ''}
          ${uploadState === 'error' ? 'border-red-500/50 bg-red-500/5' : ''}
        `}
        style={{ minHeight: aspectRatio === 'auto' ? '100px' : undefined }}
      >
        {/* Empty State */}
        {uploadState === 'empty' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[100px] p-4 relative">
            {/* Watermark Icon */}
            {watermarkIcon !== 'none' && (
              <WatermarkIcon
                icon={watermarkIcon}
                className="absolute inset-0 w-full h-full p-6 text-slate-700 opacity-20 pointer-events-none"
              />
            )}
            {/* Content on top */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="p-3 bg-slate-700/50 rounded-full mb-2 group-hover:bg-cyan-900/30 transition-colors">
                <Camera className="w-6 h-6 text-slate-400" />
              </div>
              <span className="text-sm font-medium text-slate-300">{label}</span>
              <span className="text-xs text-slate-500 mt-1">{getCtaText()}</span>
            </div>
          </div>
        )}

        {/* Loading State - Enhanced with Circular Progress */}
        {uploadState === 'loading' && (
          <div className="relative h-full min-h-[100px]">
            {/* Blurred preview */}
            {localPreview && (
              <img
                src={localPreview}
                alt="Uploading..."
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-40"
              />
            )}

            {/* Progress overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60">
              <div className="relative">
                <CircularProgress progress={progress} size={56} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-cyan-300">{progress}%</span>
                </div>
              </div>
              <span className="text-xs text-cyan-300 font-medium mt-2">
                {isCompressing ? 'Compression...' : 'Upload...'}
              </span>
            </div>
          </div>
        )}

        {/* Success State - Full Cover Image or PDF placeholder */}
        {uploadState === 'success' && (displayUrl || isPdfFile) && (
          <div className="relative group h-full min-h-[100px]">
            {/* Document thumbnail - Full cover for images, icon for PDFs */}
            {isLoadingDisplay && !isPdfFile ? (
              <div className="flex items-center justify-center h-full min-h-[100px] bg-slate-800">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : isPdfFile ? (
              // PDF placeholder - show icon and filename
              <div className="flex flex-col items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-red-900/30 to-red-950/50 p-4">
                <div className="p-3 bg-red-500/20 rounded-xl mb-2">
                  <FileText className="w-8 h-8 text-red-400" />
                </div>
                <span className="text-xs font-medium text-slate-300 text-center truncate max-w-full">
                  {currentDocument?.documentName || 'Document.pdf'}
                </span>
                <span className="text-[10px] text-red-400/80 mt-1">PDF</span>
              </div>
            ) : (
              <img
                src={displayUrl || ''}
                alt={label}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to placeholder
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                      <rect fill="#1e293b" width="100" height="100"/>
                      <text x="50" y="55" text-anchor="middle" fill="#64748b" font-size="12">Document</text>
                    </svg>
                  `);
                }}
              />
            )}

            {/* Success indicator */}
            <div className="absolute top-2 left-2 p-1.5 bg-green-500 rounded-full shadow-lg">
              <Check className="w-3 h-3 text-white" />
            </div>

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleCardClick}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Changer
              </button>
            </div>

            {/* Remove button - Semi-transparent, visible on hover */}
            {onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Error State */}
        {uploadState === 'error' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[100px] p-4">
            <div className="p-3 bg-red-500/20 rounded-full mb-2">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-sm font-medium text-red-400">{label}</span>
            <span className="text-xs text-red-400/70 mt-1 text-center">{errorMessage || 'Erreur'}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Document label below */}
      {uploadState === 'success' && (
        <p className="text-xs text-slate-400 mt-1 truncate text-center">{label}</p>
      )}
    </div>
  );
}

// Grid wrapper for multiple document uploads
interface DocumentUploadGridProps {
  documents: {
    type: DocumentType;
    label: string;
    existing?: UploadedDocument | null;
  }[];
  onDocumentChange: (type: DocumentType, doc: UploadedDocument | null) => void;
  isPrivate?: boolean;
  className?: string;
  /** Entity-based upload params */
  fileType?: StorageFileType;
  entityType?: StorageEntityType;
  entityId?: string;
  deferUpload?: boolean;
  onFileSelected?: (file: File, docType: DocumentType) => void;
}

export function DocumentUploadGrid({
  documents,
  onDocumentChange,
  isPrivate = true,
  className = '',
  fileType,
  entityType,
  entityId,
  deferUpload,
  onFileSelected,
}: DocumentUploadGridProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {documents.map((doc) => (
        <SmartDocumentUpload
          key={doc.type}
          label={doc.label}
          documentType={doc.type}
          existingDocument={doc.existing}
          isPrivate={isPrivate}
          fileType={fileType}
          entityType={entityType}
          entityId={entityId}
          deferUpload={deferUpload}
          onFileSelected={onFileSelected ? (file) => onFileSelected(file, doc.type) : undefined}
          onUploadComplete={(uploaded) => onDocumentChange(doc.type, uploaded)}
          onRemove={() => onDocumentChange(doc.type, null)}
        />
      ))}
    </div>
  );
}

export default SmartDocumentUpload;
