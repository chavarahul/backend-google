const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { uploadImage , getImageUrl } = require('../lib/cloudinary');

const router = express.Router();
const prisma = new PrismaClient();


router.get("/user", async (req, res) => {
    try {
        const UserId = req.user.userId;
        console.log(UserId)

        const user = await prisma.user.findUnique({
            where: { id: UserId },
            select : {
                name:true,
                email:true,
                image:true
            }
        });

        console.log('eee'+  user)

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ error: "Something went wrong" });
    }
});

router.post("/user", async (req, res) => {
    try {
        const UserId = req.user.userId; 
        const { name } = req.body;
        const file = req.files?.image; 

        if (name && typeof name !== "string") {
            return res.status(400).json({ error: "Invalid name" });
        }

        const currentUser = await prisma.user.findUnique({
            where: { id: UserId },
            include: { albums: true },
        });

        let imageUrl = currentUser.image;
        console.log(imageUrl)
        

        if (file) {
            const uploadResult = await uploadImage(file);
            imageUrl = getImageUrl(uploadResult.public_id);
        }

        const updatedUser = await prisma.user.update({
            where: { id: UserId },
            data: {
                name: name,
                image: imageUrl,
                updatedAt: new Date(),
            },
            include: { albums: true }, 
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: "Update failed" });
    }
});

module.exports = router;