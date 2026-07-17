/**
 * SmartDocumentUpload — façade préservant le chemin d'import historique.
 *
 * Les responsabilités sont découpées dans `./smart-document-upload/` :
 * - `useSmartDocumentUpload.ts` : logique (validation, compression, upload) ;
 * - `AvatarUpload.tsx` / `CardUpload.tsx` : variantes d'affichage ;
 * - `upload-indicators.tsx` : progression circulaire et filigranes ;
 * - `DocumentUploadGrid.tsx` : grille multi-documents.
 */

import { SmartDocumentUpload } from './smart-document-upload/SmartDocumentUpload';

export { SmartDocumentUpload } from './smart-document-upload/SmartDocumentUpload';
export { DocumentUploadGrid } from './smart-document-upload/DocumentUploadGrid';
export type {
  DocumentType,
  UploadedDocument,
  UploadVariant,
  AspectRatioType,
} from './smart-document-upload/types';

export default SmartDocumentUpload;
