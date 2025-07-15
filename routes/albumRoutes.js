// Updated Express routes with Prisma, Cloudinary, Base64, and Local Path - Now respecting local ID and syncing with Electron
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { uploadBase64Image } = require("../lib/cloudinary");

const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  const userId = req.user.userId;
  try {
    const albums = await prisma.album.findMany({
      where: { userId },
      include: { _count: { select: { photos: true } } },
    });
    const formatted = albums.map((a) => ({
      ...a,
      photoCount: a._count.photos,
      _count: undefined,
    }));
    res.json(formatted);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ error: "Failed to fetch albums" });
  }
});

// GET album by ID
router.get("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  try {
    const album = await prisma.album.findFirst({
      where: { id, userId },
      include: { _count: { select: { photos: true } } },
    });
    if (!album) return res.status(404).json({ error: "Album not found" });
    res.json({ ...album, photoCount: album._count.photos });
  } catch (err) {
    console.error("Album fetch error:", err);
    res.status(500).json({ error: "Failed to fetch album" });
  }
});

router.post("/", async (req, res) => {
  const userId = req.user.userId;
  const { id, name, date, imageBase64, localImagePath } = req.body;

  console.log("Creating album with data:", { id, name, date, imageBase64, localImagePath });

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "ID is required from local" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!date || isNaN(new Date(date))) {
    return res.status(400).json({ error: "Valid date is required" });
  }

  try {
    let coverImageUrl = null;
    if (imageBase64) {
      const result = await uploadBase64Image(imageBase64);
      coverImageUrl = result.secure_url;
    }

    const album = await prisma.album.create({
      data: {
        id,
        name,
        date: new Date(date),
        userId,
        coverImage: coverImageUrl,
        localImagePath,
      },
    });
    res.status(201).json(album);
  } catch (err) {
    console.error("Create error:", err);
    res.status(500).json({ error: "Failed to create album" });
  }
});

router.put("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { name, date, imageBase64, localImagePath } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!date || isNaN(new Date(date))) {
    return res.status(400).json({ error: "Valid date is required" });
  }

  try {
    const album = await prisma.album.findFirst({ where: { id, userId } });
    if (!album) return res.status(404).json({ error: "Album not found" });

    let coverImageUrl = album.coverImage;
    if (imageBase64) {
      const result = await uploadBase64Image(imageBase64);
      coverImageUrl = result.secure_url;
    }

    const updated = await prisma.album.update({
      where: { id },
      data: {
        name,
        date: new Date(date),
        coverImage: coverImageUrl,
        localImagePath,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update album" });
  }
});

// DELETE album
router.delete("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  try {
    const album = await prisma.album.findFirst({ where: { id, userId } });
    if (!album) return res.status(404).json({ error: "Album not found" });

    await prisma.photo.deleteMany({ where: { albumId: id } });
    await prisma.album.delete({ where: { id } });

    res.json({ message: "Album deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete album" });
  }
});

module.exports = router;