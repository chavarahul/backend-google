const asyncHandler = require("express-async-handler");
const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("../lib/cloudinary");

const prisma = new PrismaClient();

// Get user profile data
const getProfileData = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      image: true,
    },
  });
  if (!data) {
    res.status(404);
    throw new Error("User not found");
  }
  res.json(data);
});

// Update user profile
const updateProfile = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const { name } = req.body;
  const imageFile = req.file;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!name) {
    res.status(400);
    throw new Error("Name is required");
  }

  let imageUrl = null;
  if (imageFile) {
    imageUrl = await uploadImage(imageFile);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      image: imageUrl || undefined,
    },
  });

  res.json({ message: "Profile updated successfully", user });
});

module.exports = { getProfileData, updateProfile };