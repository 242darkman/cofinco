/**
 * Variantes « default » et « card » de SmartDocumentUpload : zone
 * rectangulaire avec états vide, chargement, succès (image/PDF) et erreur.
 */

import { Spinner } from '@/components/ui/Spinner';
import { Camera, RefreshCw, Check, AlertCircle, X, FileText } from 'lucide-react';
import { CircularProgress, WatermarkIcon } from './upload-indicators';
import type { AspectRatioType, WatermarkIconType } from './types';
import type { SmartDocumentUploadController } from './useSmartDocumentUpload';

interface CardUploadProps {
  label: string;
  accept: string;
  disabled: boolean;
  className: string;
  aspectRatio: AspectRatioType;
  watermarkIcon: WatermarkIconType;
  ctaText?: string;
  onRemove?: () => void;
  controller: SmartDocumentUploadController;
}

export function CardUpload({
  label,
  accept,
  disabled,
  className,
  aspectRatio,
  watermarkIcon,
  ctaText,
  onRemove,
  controller,
}: CardUploadProps) {
  const {
    fileInputRef,
    uploadState,
    progress,
    errorMessage,
    localPreview,
    currentDocument,
    isPdfFile,
    displayUrl,
    isLoadingDisplay,
    isCompressing,
    handleInputChange,
    handleCardClick,
    handleRemove,
    handleRetry,
  } = controller;

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case 'video': return 'aspect-video';
      case 'square': return 'aspect-square';
      case 'card': return 'aspect-[16/10]'; // Ratio carte de crédit
      default: return '';
    }
  };

  const getCtaText = () => {
    if (ctaText) return ctaText;
    if (watermarkIcon === 'front') return 'Scanner le Recto';
    if (watermarkIcon === 'back') return 'Scanner le Verso';
    return 'Appuyer pour ajouter';
  };

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

      {/* Carte principale */}
      <div
        onClick={handleCardClick}
        className={`
          relative overflow-hidden rounded-xl border-2 transition-all duration-200
          ${getAspectRatioClass()}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${uploadState === 'empty' ? 'border-dashed border-edge-strong hover:border-accent hover:bg-surface/30' : ''}
          ${uploadState === 'loading' ? 'border-accent/50 bg-accent/5' : ''}
          ${uploadState === 'success' ? 'border-edge bg-surface/50' : ''}
          ${uploadState === 'error' ? 'border-status-danger/50 bg-status-danger/5' : ''}
        `}
        style={{ minHeight: aspectRatio === 'auto' ? '100px' : undefined }}
      >
        {/* État vide */}
        {uploadState === 'empty' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[100px] p-4 relative">
            {/* Icône en filigrane */}
            {watermarkIcon !== 'none' && (
              <WatermarkIcon
                icon={watermarkIcon}
                className="absolute inset-0 w-full h-full p-6 text-content-secondary opacity-20 pointer-events-none"
              />
            )}
            {/* Contenu au premier plan */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="p-3 bg-surface-elevated/50 rounded-full mb-2 group-hover:bg-accent/10 transition-colors">
                <Camera className="w-6 h-6 text-content-muted" />
              </div>
              <span className="text-sm font-medium text-content-secondary">{label}</span>
              <span className="text-xs text-content-muted mt-1">{getCtaText()}</span>
            </div>
          </div>
        )}

        {/* État chargement — progression circulaire */}
        {uploadState === 'loading' && (
          <div className="relative h-full min-h-[100px]">
            {/* Aperçu flouté */}
            {localPreview && (
              <img
                src={localPreview}
                alt="Uploading..."
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-40"
              />
            )}

            {/* Superposition de progression */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base/60">
              <div className="relative">
                <CircularProgress progress={progress} size={56} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-accent">{progress}%</span>
                </div>
              </div>
              <span className="text-xs text-accent font-medium mt-2">
                {isCompressing ? 'Compression...' : 'Upload...'}
              </span>
            </div>
          </div>
        )}

        {/* État succès — image pleine ou substitut PDF */}
        {uploadState === 'success' && (displayUrl || isPdfFile) && (
          <div className="relative group h-full min-h-[100px]">
            {/* Vignette — image en couverture, icône pour les PDF */}
            {isLoadingDisplay && !isPdfFile ? (
              <div className="flex items-center justify-center h-full min-h-[100px] bg-surface">
                <Spinner size="sm" tone="current" className="text-content-muted" />
              </div>
            ) : isPdfFile ? (
              // Substitut PDF — icône et nom du fichier
              <div className="flex flex-col items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-status-danger/10 to-status-danger/20 p-4">
                <div className="p-3 bg-status-danger-bg rounded-xl mb-2">
                  <FileText className="w-8 h-8 text-status-danger" />
                </div>
                <span className="text-xs font-medium text-content-secondary text-center truncate max-w-full">
                  {currentDocument?.documentName || 'Document.pdf'}
                </span>
                <span className="text-[10px] text-status-danger/80 mt-1">PDF</span>
              </div>
            ) : (
              <img
                src={displayUrl || ''}
                alt={label}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Repli vers un substitut
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                      <rect fill="#1e293b" width="100" height="100"/>
                      <text x="50" y="55" text-anchor="middle" fill="#64748b" font-size="12">Document</text>
                    </svg>
                  `);
                }}
              />
            )}

            {/* Indicateur de succès */}
            <div className="absolute top-2 left-2 p-1.5 bg-status-success rounded-full shadow-lg">
              <Check className="w-3 h-3 text-white" />
            </div>

            {/* Superposition au survol */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleCardClick}
                className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary text-xs font-medium rounded-lg transition-colors"
              >
                Changer
              </button>
            </div>

            {/* Bouton de suppression — semi-transparent, visible au survol */}
            {onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-status-danger text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* État erreur */}
        {uploadState === 'error' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[100px] p-4">
            <div className="p-3 bg-status-danger-bg rounded-full mb-2">
              <AlertCircle className="w-6 h-6 text-status-danger" />
            </div>
            <span className="text-sm font-medium text-status-danger">{label}</span>
            <span className="text-xs text-status-danger/70 mt-1 text-center">{errorMessage || 'Erreur'}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 px-3 py-1 bg-status-danger-bg hover:bg-status-danger/30 text-status-danger text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Libellé du document en dessous */}
      {uploadState === 'success' && (
        <p className="text-xs text-content-muted mt-1 truncate text-center">{label}</p>
      )}
    </div>
  );
}
