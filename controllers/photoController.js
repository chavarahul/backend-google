const asyncHandler = require("express-async-handler");
const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("../lib/cloudinary");

const prisma = new PrismaClient();

// Get photos by album ID
const getPhotosByAlbumId = asyncHandler(async (req, res) => {
  const { userId, albumId } = req.params;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const photos = await prisma.photo.findMany({
    where: {
      albumId,
      album: { userId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      caption: true,
      createdAt: true,
      albumId: true,
    },
  });
  res.json(photos);
});

// Add photos to an album
const addPhotos = asyncHandler(async (req, res) => {
  const { userId, albumId } = req.params;
  const imageFiles = req.files;
  const captions = req.body.captions || [];

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!imageFiles || imageFiles.length === 0) {
    res.status(400);
    throw new Error("At least one image is required");
  }

  const uploadedPhotos = await Promise.all(
    imageFiles.map(async (file, index) => {
      const imageUrl = await uploadImage(file);
      return prisma.photo.create({
        data: {
          albumId,
          url: imageUrl,
          caption: captions[index] || undefined,
          createdAt: new Date(),
        },
      });
    })
  );

  await prisma.album.update({
    where: { id: albumId, userId },
    data: { photoCount: { increment: imageFiles.length } },
  });

  res.status(201).json({ message: "Photos added", photos: uploadedPhotos });
});

// Delete a photo
const deletePhoto = asyncHandler(async (req, res) => {
  const { userId, albumId, photoId } = req.params;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  await prisma.photo.delete({
    where: { id: photoId, album: { userId } },
  });

  await prisma.album.update({
    where: { id: albumId, userId },
    data: { photoCount: { decrement: 1 } },
  });

  res.json({ message: "Photo deleted" });
});

module.exports = { getPhotosByAlbumId, addPhotos, deletePhoto };