const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.STORE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.STORE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORE_R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a file buffer to Cloudflare R2
 * @param {Buffer} fileBuffer - The file content as a buffer
 * @param {string} fileName - The original file name
 * @param {string} mimeType - The file's MIME type
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
const uploadToR2 = async (fileBuffer, fileName, mimeType) => {
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fileName)}`;
  
  const uploadParams = {
    Bucket: process.env.STORE_R2_BUCKET_NAME,
    Key: uniqueName,
    Body: fileBuffer,
    ContentType: mimeType,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `${process.env.STORE_R2_PUBLIC_URL}/${uniqueName}`;
  } catch (error) {
    console.error("R2 Upload Error:", error);
    throw new Error("Failed to upload file to R2");
  }
};

module.exports = { uploadToR2 };
