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

// Configure multer for avatar upload
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

    // Create uploads directory structure
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log("Created uploads directory:", uploadsDir);
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `avatar_${userId}_${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);

    // FIXED: Use correct URL path for serving uploaded files
    const avatarUrl = `/api/uploads/avatars/${fileName}`;

    console.log("Saving avatar file:", {
      filePath,
      avatarUrl,
      uploadsDir,
    });

    // Save file to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // Verify file was written successfully
    if (!fs.existsSync(filePath)) {
      throw new Error("Failed to save file to disk");
    }

    console.log("Avatar file saved successfully:", filePath);

    // Delete old avatar file if exists and it's not a default/external avatar
    if (
      currentUser.avatar &&
      currentUser.avatar.startsWith("/api/uploads/avatars/")
    ) {
      const oldFileName = path.basename(currentUser.avatar);
      const oldAvatarPath = path.join(uploadsDir, oldFileName);
      
      if (fs.existsSync(oldAvatarPath)) {
        try {
          fs.unlinkSync(oldAvatarPath);
          console.log("Old avatar deleted:", oldAvatarPath);
        } catch (error) {
          console.error("Error deleting old avatar:", error);
          // Continue with upload even if old file deletion fails
        }
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
      // Delete uploaded file if database update fails
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log("Cleanup: Deleted file after DB failure");
        } catch (error) {
          console.error(
            "Error deleting uploaded file after DB failure:",
            error
          );
        }
      }

      res.status(500).json({
        success: false,
        error: result.error || "Failed to update avatar",
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