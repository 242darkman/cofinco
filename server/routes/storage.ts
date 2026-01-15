import { Router } from 'express';
import multer from 'multer';
import { StorageService } from '../services/storage-service';
import { requireAuth } from '../auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

/**
 * POST /api/storage/upload
 * Direct upload via backend
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { path = 'misc', isPublic = 'false' } = req.body;
    const isPublicBool = isPublic === 'true';

    const objectKey = await StorageService.uploadFile(
      req.file,
      path,
      isPublicBool
    );

    res.json({
      success: true,
      objectKey,
      url: isPublicBool ? StorageService.getPublicUrl(objectKey) : null
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/storage/presigned-url
 * Get presigned URL for direct client upload
 */
router.post('/presigned-url', requireAuth, async (req, res) => {
  try {
    const { filename, contentType, path = 'misc', isPublic = false } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename et contentType requis' });
    }

    const result = await StorageService.getPresignedUploadUrl(
      filename,
      contentType,
      path,
      isPublic
    );

    res.json(result);
  } catch (error: any) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/storage/documents/:id/view
 * Get secure download URL for private documents
 */
router.get('/documents/:id/view', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Fetch document from DB and verify user permissions
    // const document = await db.select().from(documents).where(eq(documents.id, id));
    // if (!document || !canUserAccessDocument(req.user, document)) {
    //   return res.status(403).json({ error: 'Accès refusé' });
    // }

    const objectKey = `secure-docs/${id}`; // Example
    const url = await StorageService.getPresignedDownloadUrl(objectKey, 900);

    res.json({ url });
  } catch (error: any) {
    console.error('Download URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/storage/:key
 * Delete file
 */
router.delete('/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { isPublic = 'false' } = req.query;

    await StorageService.deleteFile(key, isPublic === 'true');

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
