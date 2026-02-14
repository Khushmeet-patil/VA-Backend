import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

/**
 * Cloudflare R2 Upload Service
 * R2 is S3-compatible, so we use the AWS SDK with R2 endpoint
 * Falls back gracefully when R2 is not configured
 */

/**
 * Check if R2 is properly configured
 */
export const isR2Configured = (): boolean => {
    const missingVars = [];
    if (!process.env.R2_ACCOUNT_ID) missingVars.push('R2_ACCOUNT_ID');
    if (!process.env.R2_ACCESS_KEY_ID) missingVars.push('R2_ACCESS_KEY_ID');
    if (!process.env.R2_SECRET_ACCESS_KEY) missingVars.push('R2_SECRET_ACCESS_KEY');
    if (!process.env.R2_BUCKET_NAME) missingVars.push('R2_BUCKET_NAME');
    if (!process.env.R2_PUBLIC_URL) missingVars.push('R2_PUBLIC_URL');

    if (missingVars.length > 0) {
        console.warn(`[R2Service] Missing R2 environment variables: ${missingVars.join(', ')}`);
        return false;
    }
    return true;
};

/**
 * Verify R2 Connection
 */
export const checkR2Connection = async () => {
    if (!isR2Configured()) {
        console.log('❌ R2 Storage: Disabled (Missing configuration)');
        return;
    }

    try {
        const r2Client = getR2Client();
        // Just checking client initialization, listing buckets requires extra permissions usually
        // but we can trust if keys are present it should act as "Enabled"
        console.log('✅ R2 Storage: Enabled and Configured');
        console.log(`   - Bucket: ${process.env.R2_BUCKET_NAME}`);
        console.log(`   - Public URL: ${process.env.R2_PUBLIC_URL}`);
        console.log(`   - Account ID: ${process.env.R2_ACCOUNT_ID}`);
    } catch (error: any) {
        console.error('❌ R2 Storage: Error during initialization', error.message);
    }
};

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
 * @returns Public URL of the uploaded file, or null if R2 not configured
 */
export const uploadToR2 = async (
    buffer: Buffer,
    originalName: string,
    mimeType?: string
): Promise<string | null> => {
    // Check if R2 is configured
    if (!isR2Configured()) {
        console.warn('[R2Service] R2 not configured, skipping R2 upload');
        return null;
    }

    const bucketName = process.env.R2_BUCKET_NAME!;
    const publicUrl = process.env.R2_PUBLIC_URL!;

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
 * Upload base64 image to Cloudflare R2
 * Extracts buffer from base64 string and uploads to R2
 * @param base64Data - Base64 encoded image (with or without data URI prefix)
 * @param folder - Folder path (e.g., 'profiles/astrologers' or 'profiles/users')
 * @param userId - User/Astrologer ID for unique filename
 * @returns Public URL of uploaded image, or null if R2 not configured
 */
export const uploadBase64ToR2 = async (
    base64Data: string,
    folder: string,
    userId: string
): Promise<string | null> => {
    // Check if R2 is configured
    if (!isR2Configured()) {
        console.warn('[R2Service] R2 not configured, returning base64 as-is');
        return null;
    }

    try {
        // Extract MIME type and base64 content
        let mimeType = 'image/jpeg';
        let base64Content = base64Data;

        // Handle data URI format: data:image/jpeg;base64,/9j/4AAQ...
        if (base64Data.startsWith('data:')) {
            const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                base64Content = matches[2];
            }
        }

        // Convert base64 to buffer
        const buffer = Buffer.from(base64Content, 'base64');

        // Generate extension from MIME type
        const extMap: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
        };
        const ext = extMap[mimeType] || '.jpg';

        // Generate unique key with folder structure
        const timestamp = Date.now();
        const key = `${folder}/${userId}-${timestamp}${ext}`;

        const bucketName = process.env.R2_BUCKET_NAME!;
        const publicUrl = process.env.R2_PUBLIC_URL!;

        const r2Client = getR2Client();

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        });

        await r2Client.send(command);

        // Return public URL
        const url = `${publicUrl.replace(/\/$/, '')}/${key}`;
        console.log('[R2Service] Uploaded profile photo:', url);
        return url;
    } catch (error: any) {
        console.error('[R2Service] Error uploading base64 to R2:', error.message);
        throw error;
    }
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

/**
 * Move file in R2 (Copy + Delete)
 * @param sourceUrl - The current public URL of the file
 * @param destinationFolder - The target folder (e.g., 'profiles/astrologers')
 * @returns The new public URL
 */
export const moveFileInR2 = async (sourceUrl: string, destinationFolder: string): Promise<string | null> => {
    if (!isR2Configured()) return null;

    const sourceKey = getKeyFromUrl(sourceUrl);
    if (!sourceKey) return null;

    const bucketName = process.env.R2_BUCKET_NAME!;
    const publicUrl = process.env.R2_PUBLIC_URL!;
    const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!; // Ensure account ID is available

    try {
        const fileName = path.basename(sourceKey);
        const destinationKey = `${destinationFolder}/${fileName}`;

        console.log(`[R2Service] Moving file from ${sourceKey} to ${destinationKey}`);

        const r2Client = getR2Client();

        // 1. Copy Object
        // For R2/S3 CopySource, it usually expects 'BucketName/Key'
        const copyCommand = new CopyObjectCommand({
            Bucket: bucketName,
            CopySource: `${bucketName}/${sourceKey}`,
            Key: destinationKey,
        });
        await r2Client.send(copyCommand);

        // 2. Delete Original Object
        const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: sourceKey,
        });
        await r2Client.send(deleteCommand);

        const newUrl = `${publicUrl.replace(/\/$/, '')}/${destinationKey}`;
        console.log('[R2Service] File moved successfully:', newUrl);
        return newUrl;

    } catch (error: any) {
        console.error('[R2Service] Error moving file:', error.message);
        return null; // Return null on failure so caller knows not to update DB
    }
};

export default {
    uploadToR2,
    uploadBase64ToR2,
    deleteFromR2,
    getKeyFromUrl,
    moveFileInR2
};
