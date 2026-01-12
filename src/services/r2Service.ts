import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

/**
 * Cloudflare R2 Upload Service
 * R2 is S3-compatible, so we use the AWS SDK with R2 endpoint
 */

// Initialize S3 client for R2
const getR2Client = () => {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) {
        throw new Error('R2_ACCOUNT_ID not configured');
    }

    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
    });
};

/**
 * Generate unique filename with timestamp
 */
const generateUniqueFilename = (originalName: string): string => {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `chat/${timestamp}-${randomStr}-${baseName}${ext}`;
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filename: string): string => {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Upload file buffer to Cloudflare R2
 * @param buffer - File buffer from multer
 * @param originalName - Original filename
 * @param mimeType - Optional MIME type (auto-detected if not provided)
 * @returns Public URL of the uploaded file
 */
export const uploadToR2 = async (
    buffer: Buffer,
    originalName: string,
    mimeType?: string
): Promise<string> => {
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrl) {
        throw new Error('R2_BUCKET_NAME or R2_PUBLIC_URL not configured');
    }

    const r2Client = getR2Client();
    const key = generateUniqueFilename(originalName);
    const contentType = mimeType || getMimeType(originalName);

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });

    await r2Client.send(command);

    // Return public URL
    const url = `${publicUrl.replace(/\/$/, '')}/${key}`;
    console.log('[R2Service] Uploaded file:', url);
    return url;
};

/**
 * Delete file from Cloudflare R2
 * @param key - The file key (path) to delete
 */
export const deleteFromR2 = async (key: string): Promise<void> => {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('R2_BUCKET_NAME not configured');
    }

    const r2Client = getR2Client();

    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    await r2Client.send(command);
    console.log('[R2Service] Deleted file:', key);
};

/**
 * Extract key from R2 public URL
 */
export const getKeyFromUrl = (url: string): string | null => {
    const publicUrl = process.env.R2_PUBLIC_URL;
    if (!publicUrl || !url.startsWith(publicUrl)) {
        return null;
    }
    return url.replace(publicUrl.replace(/\/$/, '') + '/', '');
};

export default {
    uploadToR2,
    deleteFromR2,
    getKeyFromUrl,
};
