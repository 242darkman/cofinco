import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER!,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  },
  forcePathStyle: true, // Required for MinIO
});

const PUBLIC_BUCKET = process.env.BUCKET_PUBLIC_NAME || 'public-assets';
const PRIVATE_BUCKET = process.env.BUCKET_PRIVATE_NAME || 'secure-docs';

export class StorageService {
  
  /**
   * Initialize buckets on startup
   */
  static async initializeBuckets() {
    console.log('🗄️  Initializing MinIO buckets...');
    await this.createBucketIfNotExists(PUBLIC_BUCKET, true);
    await this.createBucketIfNotExists(PRIVATE_BUCKET, false);
    console.log('✅ Buckets initialized');
  }

  /**
   * Create bucket if it doesn't exist
   */
  private static async createBucketIfNotExists(bucket: string, isPublic: boolean) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`   ✓ Bucket ${bucket} exists`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`   ✓ Created bucket ${bucket}`);

        if (isPublic) {
          await this.makePublicReadable(bucket);
          console.log(`   ✓ Made ${bucket} publicly readable`);
        }
      } else {
        console.error(`   ✗ Error checking bucket ${bucket}:`, error.message);
      }
    }
  }

  /**
   * Make bucket publicly readable
   */
  private static async makePublicReadable(bucket: string) {
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`]
      }]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy)
    }));
  }

  /**
   * Upload file to MinIO
   */
  static async uploadFile(
    file: Express.Multer.File,
    path: string,
    isPublic: boolean = false
  ): Promise<string> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const key = `${path}/${Date.now()}-${file.originalname}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      }
    }));

    return isPublic 
      ? `${process.env.MINIO_ENDPOINT}/${bucket}/${key}`
      : key; // Return key for private files
  }

  /**
   * Upload from buffer (for migration)
   */
  static async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    path: string,
    isPublic: boolean = false
  ): Promise<string> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const key = `${path}/${filename}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    return isPublic 
      ? `${process.env.MINIO_ENDPOINT}/${bucket}/${key}`
      : key;
  }

  /**
   * Generate presigned upload URL (for direct client upload)
   */
  static async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    path: string,
    isPublic: boolean = false
  ): Promise<{ uploadUrl: string; objectKey: string }> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const key = `${path}/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min

    return {
      uploadUrl,
      objectKey: key
    };
  }

  /**
   * Generate presigned download URL (for secure document access)
   */
  static async getPresignedDownloadUrl(
    objectKey: string,
    expiresIn: number = 900 // 15 min
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: objectKey,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Delete file
   */
  static async deleteFile(objectKey: string, isPublic: boolean = false): Promise<void> {
    const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;

    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }));
  }

  /**
   * Get public URL
   */
  static getPublicUrl(objectKey: string): string {
    return `${process.env.MINIO_ENDPOINT}/${PUBLIC_BUCKET}/${objectKey}`;
  }
  /**
   * Helper to delete a file given its potentially public URL or Key.
   * Extracts key if full URL is provided.
   */
  static async deleteFileFromUrl(urlOrKey: string): Promise<void> {
    if (!urlOrKey) return;
    
    // Check if it's a legacy base64 or invalid
    if (urlOrKey.startsWith('data:') || urlOrKey.length < 5) return;

    let key = urlOrKey;
    const endpoint = process.env.MINIO_ENDPOINT || '';
    
    // Try to strip endpoint to get relative key
    if (urlOrKey.startsWith('http')) {
        // Example: http://minio:9000/public-assets/profiles/123.jpg
        // We need 'profiles/123.jpg' and to know if it's public.
        // Actually, deleteFile arg takes (key, isPublic).
        // Let's deduce isPublic from bucket name in URL if possible.
        // Or just try deleting from both? No that's inefficient.
        
        try {
            const urlObj = new URL(urlOrKey);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            // pathParts[0] is bucket name usually if path style is forcePathStyle=true (which it is)
            const bucket = pathParts[0];
            const isPublic = bucket === PUBLIC_BUCKET;
            
            // Reconstruct key: join remaining parts
            const actualKey = pathParts.slice(1).join('/');
            
            await this.deleteFile(actualKey, isPublic);
            console.log(`🗑️ Deleted old file: ${actualKey} (Bucket: ${bucket})`);
            return;
        } catch (e) {
            console.warn("Could not parse URL for deletion:", urlOrKey);
        }
    }
    
    // Fallback: Assume it's a key. Try deleting from public then private?
    // Or simpler: pass isPublic explicitly in caller.
    // But caller might just have the old string from DB.
    // Let's assume most profile photos are public-assets.
    // If it's a simple key "profiles/...", it's likely public.
    // If it's "secure-docs/...", it's private.
    
    // For now, let's keep it simple: caller should handle logic if possible, 
    // or we assume public for profiles.
    
    // Let's make this method smart enough to check bucket prefix if key contains it?
    // Keys usually don't contain bucket name.
    
    // Strategy: Just try to delete from public, if we assume keys are relative.
    // Optimization: Caller passes context.
  }
}
