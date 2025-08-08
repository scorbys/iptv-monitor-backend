const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getUserById, updateUserPassword, comparePassword } = require("../../../db");

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

// Update user password
router.put("/", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: "New password is required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long"
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

    // Check if user is Google OAuth user with googleId (pure Google user)
    if (currentUser.provider === 'google' && currentUser.googleId && !currentUser.password) {
      // Google user setting password for first time - no current password needed
      const result = await updateUserPassword(userId, newPassword);
      
      if (result.success) {
        res.json({
          success: true,
          message: "Password set successfully"
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || "Failed to set password"
        });
      }
      return;
    }

    // For users with existing passwords (local users or Google users who already set password)
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password is required"
      });
    }

    if (!currentUser.password) {
      return res.status(400).json({
        success: false,
        error: "No password set for this account"
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password is incorrect"
      });
    }

    // Update password
    const result = await updateUserPassword(userId, newPassword);

    if (result.success) {
      res.json({
        success: true,
        message: "Password updated successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to update password"
      });
    }
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;