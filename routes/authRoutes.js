const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { v4: uuidv4 } = require("uuid");
const authenticateToken = require("../middleware/protectRoute.js");

const prisma = new PrismaClient();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    console.error("No token provided in request");
    return res.status(400).json({ error: "No token provided" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in environment variables");
    return res.status(500).json({ error: "Server configuration error: JWT_SECRET missing" });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      console.error("No payload received from Google token verification");
      return res.status(401).json({ error: "Invalid Google token: No payload" });
    }

    const { sub: googleId, email, name, picture, email_verified } = payload;
    console.log("Google token payload:", { googleId, email, name, picture, email_verified });

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.log("Creating new user for email:", email);
      user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email,
          name,
          image: picture,
          emailVerified: email_verified ? new Date() : null,
        },
      });

      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleId,
          idToken: token,
        },
      });
    } else {
      console.log("User already exists, updating account for email:", email);
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: { provider: "google", providerAccountId: googleId },
        },
        update: { idToken: token },
        create: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleId,
          idToken: token,
        },
      });
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: 60 * 60 * 24 * 1000 * 30 }
    );

    res.json({ user, token: jwtToken });
  } catch (error) {
    console.error("Google auth error details:", error.message);
    console.error("Full error:", error);
    res.status(401).json({ error: "Invalid Google token", details: error.message });
  }
});

router.get("/verify-token", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, image: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/signout", authenticateToken, async (req, res) => {
  try {
    res.json({ message: "Signed out successfully" });
  } catch (error) {
    console.error("Signout error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;