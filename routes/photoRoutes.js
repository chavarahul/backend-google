const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("../lib/cloudinary");

const prisma = new PrismaClient();

router.get("/album/:albumId", async (req, res) => {
  const userId = req.user.userId;
  const { albumId } = req.params;
  try {
    const album = await prisma.album.findFirst({
      where: { id: albumId, userId },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }
    const photos = await prisma.photo.findMany({
      where: { albumId },
    });
    res.json(photos);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

router.post("/album/:albumId", async (req, res) => {
  const userId = req.user.userId;
  const { albumId } = req.params;
  const images = req.files?.images;
  const captions = req.body.captions
    ? Array.isArray(req.body.captions)
      ? req.body.captions
      : [req.body.captions]
    : [];

  try {
    const album = await prisma.album.findFirst({
      where: { id: albumId, userId },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    const files = Array.isArray(images) ? images : images ? [images] : [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const uploadPromises = files.map(async (file, index) => {
      const result = await uploadImage(file);
      return prisma.photo.create({
        data: {
          url: result.secure_url,
          albumId,
          caption: captions[index] || "",
        },
      });
    });

    await Promise.all(uploadPromises);
    res.status(201).json({ message: "Photos added successfully" });
  } catch (error) {
    console.error("Error adding photos:", error);
    res.status(500).json({ error: "Failed to add photos" });
  }
});

router.delete("/:photoId/album/:albumId", async (req, res) => {
  const userId = req.user.userId;
  const { photoId, albumId } = req.params;
  try {
    const album = await prisma.album.findFirst({
      where: { id: albumId, userId },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    const photo = await prisma.photo.findFirst({
      where: { id: photoId, albumId },
    });
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    await prisma.photo.delete({ where: { id: photoId } });
    res.json({ message: "Photo deleted successfully" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

module.exports = router;