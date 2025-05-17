const express = require("express");
const router = express.Router();
const multer = require("multer");
const { getProfileData, updateProfile } = require("../controllers/profileController.js");

const upload = multer({ dest: "uploads/" });

router.get("/", getProfileData);
router.put("/", upload.single("image"), updateProfile);

module.exports = router;