const cloudinary = require("cloudinary").v2;
const mime = require("mime-types");
const fs = require("fs").promises;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(file) {
  let mimeType, fileSize, fileName, uploadSource;

  if (file.mimetype) {
    // File is likely from express-fileupload or multer
    mimeType = file.mimetype;
    fileSize = file.size;
    fileName = file.originalname || file.name;

    // Check if file is in memory (Buffer) or on disk (path)
    if (file.data && Buffer.isBuffer(file.data)) {
      // Convert Buffer to Base64 data URI for Cloudinary
      const base64String = file.data.toString("base64");
      uploadSource = `data:${mimeType};base64,${base64String}`;
    } else if (file.path) {
      // File is on disk
      uploadSource = file.path;
    } else {
      throw new Error("File data or path is required");
    }
  } else {
    // Fallback for files with a path (e.g., manually provided)
    if (!file.path) {
      throw new Error("File path is required");
    }
    mimeType = mime.lookup(file.path) || "application/octet-stream";
    const stats = await fs.stat(file.path);
    fileSize = stats.size;
    fileName = file.name || file.path.split(/[\\/]/).pop();
    uploadSource = file.path;
  }

  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(mimeType)) {
    throw new Error(
      "Unsupported file type. Please upload a JPEG, PNG, GIF, or WebP image."
    );
  }

  const maxSize = 10 * 1024 * 1024;
  if (fileSize > maxSize) {
    throw new Error("File size exceeds 10MB limit.");
  }

  try {
    const result = await cloudinary.uploader.upload(uploadSource, {
      folder: "albums",
      resource_type: "image",
    });
    return result;
  } catch (error) {
    console.error(`Failed to upload ${fileName} to Cloudinary:`, error);
    throw error;
  }
}

function getImageUrl(publicId) {
  return cloudinary.url(publicId, { secure: true });
}

module.exports = { uploadImage, getImageUrl };