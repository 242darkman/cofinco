/**
 * Types partagés du composant SmartDocumentUpload.
 */

import type { StorageFileType, StorageEntityType } from '@shared/config/storage-paths';

export type DocumentType = 'ID_CARD_FRONT' | 'ID_CARD_BACK' | 'PASSPORT' | 'DRIVING_LICENSE' | 'RESIDENT_CARD' | 'PROOF_OF_ADDRESS' | 'CONTRACT' | 'AVATAR' | 'OTHER';

export interface UploadedDocument {
  id: string;
  documentType: DocumentType;
  documentName: string;
  documentUrl: string; // Clé objet MinIO pour le privé, URL complète pour le public
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  isPrivate: boolean;
}

export type UploadVariant = 'default' | 'avatar' | 'card';
export type AspectRatioType = 'auto' | 'video' | 'square' | 'card';
export type WatermarkIconType = 'front' | 'back' | 'scan' | 'none';

export type UploadState = 'empty' | 'loading' | 'success' | 'error';

export interface SmartDocumentUploadProps {
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
  /** Variante d'UI : 'default', 'avatar' (circulaire) ou 'card' (format document) */
  variant?: UploadVariant;
  /** Ratio d'aspect de la zone d'upload */
  aspectRatio?: AspectRatioType;
  /** Icône en filigrane pour l'état vide */
  watermarkIcon?: WatermarkIconType;
  /** Texte d'appel à l'action personnalisé pour l'état vide */
  ctaText?: string;
  /** Paramètres d'upload liés à l'entité */
  fileType?: StorageFileType;
  entityType?: StorageEntityType;
  entityId?: string;
  /** Mode différé — conserve le fichier localement sans l'uploader (flux de création d'entité) */
  deferUpload?: boolean;
  /** Appelé avec le fichier (compressé) quand deferUpload est actif */
  onFileSelected?: (file: File) => void;
}
