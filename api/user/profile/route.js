const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getUserById, updateUserProfile, getUserByEmailOrUsername } = require("../../../db");

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

router.use(authenticateToken);

// Update user profile
router.put("/", async (req, res) => {
  try {
    const { username, name } = req.body;
    const userId = req.user.userId;

    // Get current user data
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Check if user is Google user and trying to change username
    if (currentUser.provider === 'google' && currentUser.googleId && username !== currentUser.username) {
      return res.status(400).json({
        success: false,
        error: "Username cannot be changed for Google accounts"
      });
    }

    // Validate username if it's being changed
    if (username !== currentUser.username) {
      if (!username || username.trim().length < 3) {
        return res.status(400).json({
          success: false,
          error: "Username must be at least 3 characters long"
        });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({
          success: false,
          error: "Username can only contain letters, numbers, and underscores"
        });
      }

      // Check if username is already taken
      const existingUser = await getUserByEmailOrUsername(username);
      if (existingUser && existingUser._id.toString() !== userId) {
        return res.status(400).json({
          success: false,
          error: "Username is already taken"
        });
      }
    }

    // Update user profile
    const result = await updateUserProfile(userId, {
      username: username.trim(),
      name: name ? name.trim() : null
    });

    if (result.success) {
      res.json({
        success: true,
        message: "Profile updated successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to update profile"
      });
    }
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;