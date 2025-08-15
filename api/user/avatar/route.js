const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getUserByIdComplete, updateUserAvatar } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
};

// Configure multer untuk memory storage (Vercel compatible)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."
        )
      );
    }
  },
});

router.use(authenticateToken);

// Upload avatar
router.post("/", upload.single("avatar"), async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    // Get current user data
    const currentUser = await getUserByIdComplete(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if user can change avatar (not Google OAuth user)
    if (currentUser.provider === "google" && currentUser.googleId) {
      return res.status(400).json({
        success: false,
        error: "Avatar cannot be changed for Google accounts",
      });
    }

    try {
      const cloudinary = require('cloudinary').v2;

      // Configure cloudinary
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: "image",
            public_id: `avatar_${userId}_${Date.now()}`,
            folder: "avatars",
            transformation: [
              { width: 200, height: 200, crop: "fill", gravity: "face" }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      const avatarUrl = uploadResult.secure_url;

      // Delete old avatar from Cloudinary if exists
      if (currentUser.avatar && currentUser.avatar.includes('cloudinary')) {
        try {
          const publicId = currentUser.avatar.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`avatars/${publicId}`);
          console.log("Old avatar deleted from Cloudinary");
        } catch (error) {
          console.error("Error deleting old avatar:", error);
        }
      }

      // Update user avatar in database
      const result = await updateUserAvatar(userId, avatarUrl);

      if (result.success) {
        console.log("Avatar updated successfully for user:", userId);
        res.json({
          success: true,
          avatar: avatarUrl,
          message: "Avatar updated successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || "Failed to update avatar",
        });
      }
    } catch (uploadError) {
      console.error("Error uploading to Cloudinary:", uploadError);
      res.status(500).json({
        success: false,
        error: "Failed to upload avatar",
      });
    }

  } catch (error) {
    console.error("Error updating avatar:", error);

    // Handle multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size too large. Maximum size is 5MB.",
        });
      }
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;