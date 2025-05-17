const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const winston = require("winston");
const albumRoutes = require("./routes/albumRoutes");
const profileRoutes = require("./routes/profileRoutes");
const photoRoutes = require("./routes/photoRoutes");
const authRoutes = require("./routes/authRoutes");
const { uploadImage } = require("./lib/cloudinary");
const authenticateToken = require("./middleware/protectRoute");

require("dotenv").config();

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "server.log" }),
    new winston.transports.Console(),
  ],
});

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(fileUpload());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/albums", authenticateToken, albumRoutes);
app.use("/api/profile", authenticateToken, profileRoutes);
app.use("/api/photos", authenticateToken, photoRoutes);

app.get("/api/auth/user-id", authenticateToken, (req, res) => {
  res.json({ userId: req.user.userId, name: req.user.name });
});

app.get("/", (req, res) => {
  res.send("<h1>Welcome to the API Test App Server</h1>");
});

// Endpoint for photo uploads from Electron
app.post("/api/upload-photo", authenticateToken, async (req, res) => {
  const { albumId, imageUrl } = req.body;
  const userId = req.user.userId;

  if (!albumId || !imageUrl) {
    logger.error("Missing albumId or imageUrl in /api/upload-photo", { albumId, imageUrl });
    return res.status(400).json({ error: "Album ID and image URL are required" });
  }

  try {
    // Validate album ownership
    const album = await prisma.album.findFirst({
      where: { id: albumId, userId },
    });
    if (!album) {
      logger.error("Album not found or not owned by user", { albumId, userId });
      return res.status(404).json({ error: "Album not found" });
    }

    // Save to database in a transaction
    await prisma.$transaction([
      prisma.photo.create({
        data: {
          url: imageUrl,
          albumId,
          caption: "",
        },
      }),
      prisma.album.update({
        where: { id: albumId },
        data: { photoCount: { increment: 1 } },
      }),
    ]);

    logger.info("Photo saved to album", { imageUrl, albumId });
    res.status(201).json({ message: "Photo saved successfully" });
  } catch (error) {
    logger.error("Failed to save photo", { error: error.message, albumId });
    res.status(500).json({ error: "Failed to save photo" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`HTTP Server running on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down server...");
  await prisma.$disconnect();
  process.exit(0);
});