const asyncHandler = require("express-async-handler");
const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("../lib/cloudinary");

const prisma = new PrismaClient();

// Get all albums for a user
const getAlbums = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const albums = await prisma.album.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      date: true,
      coverImage: true,
      photoCount: true,
    },
  });
  res.json(albums);
});

// Get a single album by ID
const getAlbumById = asyncHandler(async (req, res) => {
  const { userId, id } = req.params;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const album = await prisma.album.findUnique({
    where: { id, userId },
  });
  if (!album) {
    res.status(404);
    throw new Error("Album not found");
  }
  res.json(album);
});

// Add a new album
const addAlbum = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const { name, date } = req.body;
  const coverImageFile = req.file;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!name || !date) {
    res.status(400);
    throw new Error("Missing required fields");
  }

  let coverImageUrl = null;
  if (coverImageFile) {
    coverImageUrl = await uploadImage(coverImageFile);
  }

  const album = await prisma.album.create({
    data: {
      name,
      date: new Date(date),
      userId,
      coverImage: coverImageUrl || undefined,
      photoCount: 0,
    },
  });

  res.status(201).json({ message: "Album created", album });
});

// Update an album
const updateAlbum = asyncHandler(async (req, res) => {
  const { userId, id } = req.params;
  const { name, date } = req.body;
  const coverImageFile = req.file;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!name || !date) {
    res.status(400);
    throw new Error("Missing required fields");
  }

  let coverImageUrl = null;
  if (coverImageFile) {
    coverImageUrl = await uploadImage(coverImageFile);
  }

  const album = await prisma.album.update({
    where: { id, userId },
    data: {
      name,
      date: new Date(date),
      coverImage: coverImageUrl || undefined,
    },
  });

  res.json({ message: "Album updated", album });
});

// Delete an album
const deleteAlbum = asyncHandler(async (req, res) => {
  const { userId, id } = req.params;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  await prisma.album.delete({
    where: { id, userId },
  });
  res.json({ message: "Album deleted" });
});

module.exports = {
  getAlbums,
  getAlbumById,
  addAlbum,
  updateAlbum,
  deleteAlbum,
};