/**
 * Variante « avatar » de SmartDocumentUpload : zone circulaire avec
 * bouton caméra et suppression optionnelle.
 */

import { Camera, AlertCircle, X, User } from 'lucide-react';
import { CircularProgress } from './upload-indicators';
import type { SmartDocumentUploadController } from './useSmartDocumentUpload';

interface AvatarUploadProps {
  label: string;
  accept: string;
  disabled: boolean;
  className: string;
  onRemove?: () => void;
  controller: SmartDocumentUploadController;
}

export function AvatarUpload({ label, accept, disabled, className, onRemove, controller }: AvatarUploadProps) {
  const {
    fileInputRef,
    uploadState,
    progress,
    errorMessage,
    localPreview,
    displayUrl,
    isUploading,
    isCompressing,
    handleInputChange,
    handleCardClick,
    handleRemove,
  } = controller;

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

      {/* Cercle avatar */}
      <div
        onClick={handleCardClick}
        className={`
          relative w-32 h-32 rounded-full overflow-hidden
          border-4 border-edge bg-surface
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          transition-all duration-200 hover:border-accent
        `}
      >
        {/* État vide — icône utilisateur */}
        {uploadState === 'empty' && (
          <div className="flex items-center justify-center w-full h-full">
            <User className="w-16 h-16 text-content-muted" />
          </div>
        )}

        {/* État chargement */}
        {uploadState === 'loading' && (
          <div className="relative w-full h-full">
            {localPreview && (
              <img
                src={localPreview}
                alt="Uploading..."
                className="w-full h-full object-cover blur-sm opacity-40"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-surface-base/60">
              <CircularProgress progress={progress} size={56} />
            </div>
          </div>
        )}

        {/* État succès */}
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

        {/* État erreur */}
        {uploadState === 'error' && (
          <div className="flex flex-col items-center justify-center w-full h-full bg-status-danger-bg">
            <AlertCircle className="w-10 h-10 text-status-danger mb-1" />
            <span className="text-xs text-status-danger text-center px-2">{errorMessage || 'Erreur'}</span>
          </div>
        )}
      </div>

      {/* Bouton caméra */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleCardClick();
        }}
        disabled={disabled || isUploading || isCompressing}
        className={`
          absolute bottom-0 right-0 p-3 rounded-full
          bg-accent hover:bg-accent text-white shadow-lg
          transition-all duration-200 hover:scale-110
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <Camera className="w-5 h-5" />
      </button>

      {/* Bouton de suppression (si contenu) */}
      {uploadState === 'success' && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-0 right-0 p-1.5 rounded-full bg-status-danger hover:bg-status-danger text-white shadow-lg transition-all duration-200 hover:scale-110"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
