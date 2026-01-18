import { Router } from "express";
import multer from "multer";
import { StorageService } from "../services/storage-service";

// Configure upload limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

export const uploadRouter = Router();

// POST /api/upload - Direct upload using multipart/form-data
uploadRouter.post("/upload", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const path = typeof req.body?.path === "string" ? req.body.path : "profiles";
    const isPublic = req.body?.isPublic !== "false";
    const uploadResult = await StorageService.uploadFile(req.file, path, isPublic);

    const objectPath = isPublic ? extractObjectKey(uploadResult) : uploadResult;

    res.json({
      objectPath,
      url: isPublic ? StorageService.getPublicUrl(objectPath) : null,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// GET /api/uploads/files/:filename - Serve uploaded files
uploadRouter.get("/files/:key(*)", (req, res) => {
  const key = req.params.key;
  if (!key) {
    return res.status(400).json({ error: "File key is required" });
  }

  const publicBucket = process.env.BUCKET_PUBLIC_NAME || "public-assets";
  let normalizedKey = key;
  if (normalizedKey.startsWith("http")) {
    normalizedKey = extractObjectKey(normalizedKey);
  }
  if (normalizedKey.startsWith(`${publicBucket}/`)) {
    normalizedKey = normalizedKey.slice(publicBucket.length + 1);
  }

  return StorageService.getPublicObject(normalizedKey)
    .then((result: any) => {
      if (!result?.Body) {
        return res.status(404).json({ error: "File not found" });
      }

      if (result.ContentType) {
        res.setHeader("Content-Type", result.ContentType);
      }
      if (result.ContentLength) {
        res.setHeader("Content-Length", String(result.ContentLength));
      }
      res.setHeader("Cache-Control", "public, max-age=3600");

      const body = result.Body as any;
      if (body && typeof body.pipe === "function") {
        body.pipe(res);
        return;
      }

      return res.status(500).json({ error: "Invalid file stream" });
    })
    .catch((error: any) => {
      if (error?.name === "NoSuchKey") {
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Public file fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch file" });
    });
});

// Retro-compatibility: Request URL endpoint (mocked or redirected)
// Since we switched to direct upload, this might not be needed if frontend is updated.
// But keeping it for safety if other components use it, returning 501 Not Implemented
uploadRouter.post("/request-url", (req, res) => {
   res.status(400).json({ 
     error: "Please use POST /api/uploads/upload with multipart/form-data instead of presigned URLs." 
   });
});

const extractObjectKey = (urlOrKey: string): string => {
  if (!urlOrKey.startsWith("http")) {
    return urlOrKey;
  }

  try {
    const url = new URL(urlOrKey);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      return urlOrKey;
    }
    return pathParts.slice(1).join("/");
  } catch {
    return urlOrKey;
  }
};
