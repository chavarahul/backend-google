// server.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const winston = require("winston");
const dotenv = require("dotenv");

dotenv.config();

// Middleware & Routes
const albumRoutes = require("./routes/albumRoutes");
const profileRoutes = require("./routes/profileRoutes");
const photoRoutes = require("./routes/photoRoutes");
const authRoutes = require("./routes/authRoutes");
const authenticateToken = require("./middleware/protectRoute");

const prisma = new PrismaClient();

// Winston Logger Setup
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
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(fileUpload());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/albums", authenticateToken, albumRoutes);
app.use("/api/profile", authenticateToken, profileRoutes);
app.use("/api/photos", authenticateToken, photoRoutes);

// Get User Info
app.get("/api/auth/user-id", authenticateToken, (req, res) => {
  res.json({ userId: req.user.userId, name: req.user.name });
});

// Health Check
app.get("/", (req, res) => {
  res.send("<h1>Welcome to the API Test App Server</h1>");
});

// Upload Photo Endpoint
app.post("/api/upload-photo", authenticateToken, async (req, res) => {
  const { albumId, imageUrl } = req.body;
  const userId = req.user.userId;

  if (!albumId || !imageUrl) {
    logger.error("Missing albumId or imageUrl", { albumId, imageUrl });
    return res.status(400).json({ error: "Album ID and image URL are required" });
  }

  try {
    const album = await prisma.album.findFirst({
      where: { id: albumId, userId },
    });

    if (!album) {
      logger.error("Album not found or unauthorized", { albumId, userId });
      return res.status(404).json({ error: "Album not found" });
    }

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

    logger.info("Photo uploaded", { imageUrl, albumId });
    res.status(201).json({ message: "Photo saved successfully" });
  } catch (error) {
    logger.error("Photo upload failed", { error: error.message });
    res.status(500).json({ error: "Failed to save photo" });
  }
});

// Server Start
app.listen(PORT, () => {
  logger.info(`🚀 Server running at http://localhost:${PORT}`);
});

// Graceful Shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});
