const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const {
  getUserById,
  updateUserProfile,
  getUserByEmailOrUsername,
} = require("../../../db");

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
        error: "User not found",
      });
    }

    // Check if user is Google user and trying to change username
    if (
      currentUser.provider === "google" &&
      currentUser.googleId &&
      username &&
      username !== currentUser.username
    ) {
      return res.status(400).json({
        success: false,
        error: "Username cannot be changed for Google accounts",
      });
    }

    const updateData = {};

    // Validate username if it's being changed
    if (username && username.trim() !== currentUser.username) {
      const trimmedUsername = username.trim();

      if (trimmedUsername.length < 3) {
        return res.status(400).json({
          success: false,
          error: "Username must be at least 3 characters long",
        });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
        return res.status(400).json({
          success: false,
          error: "Username can only contain letters, numbers, and underscores",
        });
      }

      // Check if username is already taken
      try {
        const existingUser = await getUserByEmailOrUsername(trimmedUsername);
        if (existingUser && existingUser._id.toString() !== userId) {
          return res.status(400).json({
            success: false,
            error: "Username is already taken",
          });
        }

        updateData.username = trimmedUsername;
      } catch (error) {
        console.error("Error checking username availability:", error);
        return res.status(500).json({
          success: false,
          error: "Error validating username",
        });
      }
    }

    // Prepare name update
    if (name !== undefined && name !== currentUser.name) {
      updateData.name = name ? name.trim() : null;
    }

    // Only update if there are actual changes
    if (Object.keys(updateData).length === 0) {
      return res.json({
        success: true,
        message: "No changes to update",
      });
    }

    console.log("Profile update:", {
      userId,
      updateData,
      currentUser: {
        username: currentUser.username,
        name: currentUser.name,
        provider: currentUser.provider
      }
    });

    // Update user profile
    const result = await updateUserProfile(userId, updateData);

    if (result.success) {
      console.log("Profile updated successfully for user:", userId);
      res.json({
        success: true,
        message: "Profile updated successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to update profile",
      });
    }
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;
