const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
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


router.post("/signout", authenticateToken, async (req, res) => {
  try {
    res.json({ message: "Signed out successfully" });
  } catch (error) {
    console.error("Signout error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

  router.post("/send-email-otp", async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const otp = generateOTP();
      await prisma.otp.create({
        data: {
          email,
          code: otp,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
        },
      });

      const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: 'chavarahul7@gmail.com',
        pass: 'awadicgmcftstaxt',
      },
    });

      await transporter.sendMail({
        from: 'chavarahul7@gmail.com',
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
      });

      res.json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });


router.post("/register", async (req, res) => {
  const { firstName, lastName, email, password, phone, emailVerified, phoneVerified } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Verify OTP
    const otpRecord = await prisma.otp.findFirst({
      where: { email, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: "No valid OTP found" });
    }

    const user = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        email,
        password, 
        phone,
        emailVerified: emailVerified ? new Date() : null,
        phoneVerified: phoneVerified ? new Date() : null,
      },
    });

    await prisma.otp.deleteMany({ where: { email } });

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: 60 * 60 * 24 * 1000 * 30 }
    );

    res.json({ user, token: jwtToken });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.password !== password) { 
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: 60 * 60 * 24 * 1000 * 30 }
    );

    res.json({ user, token: jwtToken });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/verify-email-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }


  
  try {
    const otpRecord = await prisma.otp.findFirst({
      where: {
        email,
        code: otp,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "OTP verification failed" });
  }
});

router.get("/verify-token", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, image: true, phone: true, emailVerified: true, phoneVerified: true },
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


module.exports = router;