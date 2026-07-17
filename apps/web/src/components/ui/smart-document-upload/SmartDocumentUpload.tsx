/**
 * SmartDocumentUpload — orchestration : branche le hook d'upload sur la
 * variante d'affichage (« avatar » ou « default »/« card »).
 */

import { useSmartDocumentUpload } from './useSmartDocumentUpload';
import { AvatarUpload } from './AvatarUpload';
import { CardUpload } from './CardUpload';
import type { SmartDocumentUploadProps } from './types';

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
  const controller = useSmartDocumentUpload({
    documentType,
    onUploadComplete,
    onRemove,
    existingDocument,
    isPrivate,
    accept,
    maxSizeMB,
    disabled,
    fileType,
    entityType,
    entityId,
    deferUpload,
    onFileSelected,
  });

  if (variant === 'avatar') {
    return (
      <AvatarUpload
        label={label}
        accept={accept}
        disabled={disabled}
        className={className}
        onRemove={onRemove}
        controller={controller}
      />
    );
  }

  return (
    <CardUpload
      label={label}
      accept={accept}
      disabled={disabled}
      className={className}
      aspectRatio={aspectRatio}
      watermarkIcon={watermarkIcon}
      ctaText={ctaText}
      onRemove={onRemove}
      controller={controller}
    />
  );
}
