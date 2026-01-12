import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-random-originalName
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Configure upload limits
const upload = multer({ 
  storage: storage,
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
uploadRouter.post("/upload", upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Return the filename as objectPath
    res.json({ 
      objectPath: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// GET /api/uploads/files/:filename - Serve uploaded files
uploadRouter.get("/files/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(UPLOADS_DIR, filename);

  // Prevent directory traversal
  if (!filepath.startsWith(UPLOADS_DIR)) {
     return res.status(403).json({ error: "Access denied" });
  }

  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Retro-compatibility: Request URL endpoint (mocked or redirected)
// Since we switched to direct upload, this might not be needed if frontend is updated.
// But keeping it for safety if other components use it, returning 501 Not Implemented
uploadRouter.post("/request-url", (req, res) => {
   res.status(400).json({ 
     error: "Please use POST /api/uploads/upload with multipart/form-data instead of presigned URLs." 
   });
});
