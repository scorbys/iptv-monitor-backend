const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const {
  getUserById,
  updateUserPassword,
  comparePassword,
  connectDB,
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

// Update user password
router.put("/", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: "New password is required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long",
      });
    }

    // Get current user data dengan password info
    const { users } = await connectDB();
    const currentUser = await users.findOne(
      { _id: new ObjectId(userId) },
      {
        projection: {
          username: 1,
          email: 1,
          provider: 1,
          googleId: 1,
          password: 1, // Ambil password untuk validasi
        },
      }
    );

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // FIXED: Logic berdasarkan provider dan status password
    const isGoogleUser = currentUser.provider === "google";
    const isLocalUser = !currentUser.provider || currentUser.provider === "local";
    const hasExistingPassword = currentUser.password && 
                               currentUser.password !== null && 
                               currentUser.password !== "exists" &&
                               currentUser.password.trim() !== "";

    console.log("Password update attempt:", {
      userId,
      isGoogleUser,
      isLocalUser,
      hasExistingPassword,
      currentPasswordProvided: !!currentPassword,
      passwordValue: currentUser.password,
    });

    // FIXED: Untuk local user dengan existing password, WAJIB current password
    if (isLocalUser && hasExistingPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: "Current password is required",
        });
      }

      // Verify current password
      const isValidPassword = await comparePassword(
        currentPassword,
        currentUser.password
      );
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: "Current password is incorrect",
        });
      }
    }

    // Google user setting password untuk pertama kali - tidak perlu current password
    if (isGoogleUser && !hasExistingPassword) {
      console.log("Google user setting first password");
    }

    // Google user dengan existing password - optional current password validation
    if (isGoogleUser && hasExistingPassword && currentPassword) {
      const isValidPassword = await comparePassword(
        currentPassword,
        currentUser.password
      );
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: "Current password is incorrect",
        });
      }
    }

    // Local user tanpa password existing (first time) - tidak perlu current password
    // Ini jarang terjadi tapi mungkin ada edge case

    // Update password
    const result = await updateUserPassword(userId, newPassword);

    if (result.success) {
      res.json({
        success: true,
        message:
          isGoogleUser && !hasExistingPassword
            ? "Password set successfully"
            : "Password updated successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to update password",
      });
    }
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;