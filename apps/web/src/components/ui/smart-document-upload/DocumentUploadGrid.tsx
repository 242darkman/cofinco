/**
 * Grille d'upload pour plusieurs documents (KYC recto/verso, etc.).
 */

import type { StorageFileType, StorageEntityType } from '@shared/config/storage-paths';
import { SmartDocumentUpload } from './SmartDocumentUpload';
import type { DocumentType, UploadedDocument } from './types';

interface DocumentUploadGridProps {
  documents: {
    type: DocumentType;
    label: string;
    existing?: UploadedDocument | null;
  }[];
  onDocumentChange: (type: DocumentType, doc: UploadedDocument | null) => void;
  isPrivate?: boolean;
  className?: string;
  /** Paramètres d'upload liés à l'entité */
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
