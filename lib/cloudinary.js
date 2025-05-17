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
  let mimeType, fileSize, fileName;

  // Handle file objects from express-fileupload (albumRoutes.js)
  if (file.mimetype) {
    mimeType = file.mimetype;
    fileSize = file.size;
    fileName = file.originalname || file.name;
  } else {
    // Handle file objects from FTP watcher (server.js)
    if (!file.path) {
      throw new Error("File path is required");
    }
    // Infer MIME type from file extension
    mimeType = mime.lookup(file.path) || "application/octet-stream";
    // Get file size using fs
    const stats = await fs.stat(file.path);
    fileSize = stats.size;
    fileName = file.name || file.path.split(/[\\/]/).pop();
  }

  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(mimeType)) {
    throw new Error(
      "Unsupported file type. Please upload a JPEG, PNG, GIF, or WebP image."
    );
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (fileSize > maxSize) {
    throw new Error("File size exceeds 10MB limit.");
  }

  try {
    const result = await cloudinary.uploader.upload(file.path, {
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