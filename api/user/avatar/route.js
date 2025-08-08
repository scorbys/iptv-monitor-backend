const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getUserById, updateUserAvatar } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Invalid token"
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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

router.use(authenticateToken);

// Upload avatar
router.post("/", upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    // Get current user data
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Check if user can change avatar (not Google OAuth user)
    if (currentUser.provider === 'google' && currentUser.googleId) {
      return res.status(400).json({
        success: false,
        error: "Avatar cannot be changed for Google accounts"
      });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `avatar_${userId}_${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    const avatarUrl = `/uploads/avatars/${fileName}`;

    // Save file to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // Delete old avatar file if exists and it's not a default/external avatar
    if (currentUser.avatar && currentUser.avatar.startsWith('/uploads/avatars/')) {
      const oldAvatarPath = path.join(process.cwd(), 'public', currentUser.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Update user avatar in database
    const result = await updateUserAvatar(userId, avatarUrl);

    if (result.success) {
      res.json({
        success: true,
        avatar: avatarUrl,
        message: "Avatar updated successfully"
      });
    } else {
      // Delete uploaded file if database update fails
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.status(500).json({
        success: false,
        error: result.error || "Failed to update avatar"
      });
    }
  } catch (error) {
    console.error("Error updating avatar:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;