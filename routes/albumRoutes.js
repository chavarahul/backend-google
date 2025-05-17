const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("../lib/cloudinary");
const { v4: uuidv4 } = require("uuid");

const prisma = new PrismaClient();

// GET /api/albums - Fetch all albums for the authenticated user
router.get("/", async (req, res) => {
  const userId = req.user.userId;
  try {
    const albums = await prisma.album.findMany({
      where: { userId },
      include: { _count: { select: { photos: true } } },
    });
    const formattedAlbums = albums.map((album) => ({
      ...album,
      photoCount: album._count.photos,
      _count: undefined,
    }));
    res.json(formattedAlbums);
  } catch (error) {
    console.error("Error fetching albums:", error);
    res.status(500).json({ error: "Failed to fetch albums" });
  }
});

// GET /api/albums/:id - Fetch a specific album
router.get("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  try {
    const album = await prisma.album.findFirst({
      where: { id, userId },
      include: { _count: { select: { photos: true } } },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }
    const formattedAlbum = {
      ...album,
      photoCount: album._count.photos,
      _count: undefined,
    };
    res.json(formattedAlbum);
  } catch (error) {
    console.error("Error fetching album:", error);
    res.status(500).json({ error: "Failed to fetch album" });
  }
});

// POST /api/albums - Create a new album
router.post("/", async (req, res) => {
  const userId = req.user.userId;
  const { name, date } = req.body || {};
  const coverImage = req.files && req.files.coverImage;

  console.log("POST /api/albums - Request body:", req.body);
  console.log("POST /api/albums - Files:", req.files);

  // Validate required fields
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Album name is required and must be a string" });
  }
  if (!date || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: "Valid date is required" });
  }

  try {
    let coverImageUrl = null;
    if (coverImage && coverImage.path) {
      const result = await uploadImage(coverImage);
      coverImageUrl = result.secure_url;
    }

    const album = await prisma.album.create({
      data: {
        id: uuidv4(),
        name,
        date: new Date(date),
        userId,
        coverImage: coverImageUrl,
      },
    });
    res.status(201).json(album);
  } catch (error) {
    console.error("Error creating album:", error);
    res.status(500).json({ error: "Failed to create album" });
  }
});

// PUT /api/albums/:id - Update an existing album
router.put("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { name, date } = req.body || {};
  const coverImage = req.files && req.files.coverImage;

  console.log("PUT /api/albums/:id - Request body:", req.body);
  console.log("PUT /api/albums/:id - Files:", req.files);

  // Validate required fields
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Album name is required and must be a string" });
  }
  if (!date || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: "Valid date is required" });
  }

  try {
    const album = await prisma.album.findFirst({
      where: { id, userId },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    let coverImageUrl = album.coverImage;
    if (coverImage && coverImage.path) {
      const result = await uploadImage(coverImage);
      coverImageUrl = result.secure_url;
    }

    const updatedAlbum = await prisma.album.update({
      where: { id },
      data: {
        name,
        date: new Date(date),
        coverImage: coverImageUrl,
      },
    });
    res.json(updatedAlbum);
  } catch (error) {
    console.error("Error updating album:", error);
    res.status(500).json({ error: "Failed to update album" });
  }
});

// DELETE /api/albums/:id - Delete an album
router.delete("/:id", async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    const album = await prisma.album.findFirst({
      where: { id, userId },
    });
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    await prisma.photo.deleteMany({ where: { albumId: id } });
    await prisma.album.delete({ where: { id } });
    res.json({ message: "Album deleted successfully" });
  } catch (error) {
    console.error("Error deleting album:", error);
    res.status(500).json({ error: "Failed to delete album" });
  }
});

module.exports = router;