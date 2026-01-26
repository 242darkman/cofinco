/**
 * Service centralisé pour sauvegarder les documents dans la Loge Cloud
 * Utilisé par tous les modules pour archiver automatiquement les fichiers générés
 */

export interface SaveToLogeOptions {
  nom: string;
  description?: string;
  categorie: 'credits' | 'clients' | 'epargnes' | 'tontines' | 'comptabilite' | 'rapports' | 'general' | 'rh';
  referenceType?: string;
  referenceId?: string;
  tags?: string[];
  visibilite?: 'prive' | 'interne' | 'public';
}

export interface LogeDocument {
  id: string;
  nom: string;
  description?: string;
  type: 'fichier' | 'dossier';
  mimeType?: string;
  taille?: number;
  chemin: string;
  objectPath?: string;
  categorie: string;
  referenceType?: string;
  referenceId?: string;
  visibilite: string;
  tags?: string[];
  createdAt: string;
}

function getLogeToken(): string | null {
  return sessionStorage.getItem('logeToken');
}

export async function saveToLoge(
  file: File | Blob,
  options: SaveToLogeOptions
): Promise<LogeDocument | null> {
  try {
    // Étape 1: Demander une URL de téléchargement signée
    const fileName = options.nom.includes('.') ? options.nom : `${options.nom}.${getExtensionFromMimeType(file.type)}`;

    // Map referenceType to valid entity types for structured storage
    const entityTypeMap: Record<string, string> = {
      credit: 'credit', client: 'client', tontine: 'tontine',
      employe: 'employe', user: 'user', prospection: 'prospection',
    };
    const entityType = entityTypeMap[options.referenceType || ''] || 'client';
    const entityId = options.referenceId || 'general';

    const urlResponse = await fetch('/api/storage/entity/presigned-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filename: fileName,
        contentType: file.type || 'application/octet-stream',
        fileType: 'misc',
        entityType,
        entityId,
      })
    });

    if (!urlResponse.ok) {
      throw new Error('Impossible d\'obtenir l\'URL de téléchargement');
    }

    const { uploadUrl: uploadURL, key: objectPath } = await urlResponse.json();

    // Étape 2: Télécharger le fichier vers le stockage cloud
    const uploadResponse = await fetch(uploadURL, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });

    if (!uploadResponse.ok) {
      throw new Error('Échec du téléchargement vers le stockage');
    }

    // Étape 3: Créer l'enregistrement du document dans la base de données (route d'archivage automatique)
    const docResponse = await fetch('/api/loge/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nom: fileName,
        description: options.description || `Document ${options.categorie} généré automatiquement`,
        type: 'fichier',
        mimeType: file.type,
        taille: file.size,
        chemin: `/${options.categorie}/${fileName}`,
        objectPath,
        categorie: options.categorie,
        referenceType: options.referenceType,
        referenceId: options.referenceId,
        visibilite: options.visibilite || 'interne',
        tags: options.tags || []
      })
    });

    if (!docResponse.ok) {
      console.warn('Document téléchargé mais pas enregistré dans la Loge:', await docResponse.text());
      return null;
    }

    return await docResponse.json();
  } catch (error) {
    console.error('Erreur sauvegarde Loge:', error);
    return null;
  }
}

export async function savePDFToLoge(
  pdfBlob: Blob,
  options: SaveToLogeOptions
): Promise<LogeDocument | null> {
  const fileName = options.nom.endsWith('.pdf') ? options.nom : `${options.nom}.pdf`;
  return saveToLoge(pdfBlob, { ...options, nom: fileName });
}

export async function saveExcelToLoge(
  excelBlob: Blob,
  options: SaveToLogeOptions
): Promise<LogeDocument | null> {
  const fileName = options.nom.endsWith('.xlsx') ? options.nom : `${options.nom}.xlsx`;
  return saveToLoge(excelBlob, { ...options, nom: fileName });
}

export async function saveCSVToLoge(
  csvContent: string,
  options: SaveToLogeOptions
): Promise<LogeDocument | null> {
  const fileName = options.nom.endsWith('.csv') ? options.nom : `${options.nom}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return saveToLoge(blob, { ...options, nom: fileName });
}

export async function saveJSONToLoge(
  data: any,
  options: SaveToLogeOptions
): Promise<LogeDocument | null> {
  const fileName = options.nom.endsWith('.json') ? options.nom : `${options.nom}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return saveToLoge(blob, { ...options, nom: fileName });
}

export async function getDocumentsByReference(
  referenceType: string,
  referenceId: string
): Promise<LogeDocument[]> {
  const logeToken = getLogeToken();
  
  try {
    const headers: Record<string, string> = {};
    if (logeToken) {
      headers['X-Loge-Token'] = logeToken;
    }
    
    const response = await fetch(`/api/loge/documents?referenceType=${referenceType}&referenceId=${referenceId}`, {
      headers
    });
    
    if (!response.ok) {
      return [];
    }
    
    return await response.json();
  } catch {
    return [];
  }
}

export async function getDocumentsByCategorie(categorie: string): Promise<LogeDocument[]> {
  const logeToken = getLogeToken();
  
  try {
    const headers: Record<string, string> = {};
    if (logeToken) {
      headers['X-Loge-Token'] = logeToken;
    }
    
    const response = await fetch(`/api/loge/documents?categorie=${categorie}`, {
      headers
    });
    
    if (!response.ok) {
      return [];
    }
    
    return await response.json();
  } catch {
    return [];
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/csv': 'csv',
    'application/json': 'json',
    'text/plain': 'txt',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'application/zip': 'zip'
  };
  return mimeToExt[mimeType] || 'dat';
}
