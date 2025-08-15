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

    // Better logic untuk determine provider dan password status
    const isGoogleUser = currentUser.provider === "google";
    const isLocalUser = !currentUser.provider || currentUser.provider === "local";

    // More robust password existence check
    const hasExistingPassword = currentUser.password &&
      typeof currentUser.password === 'string' &&
      currentUser.password.trim() !== "" &&
      currentUser.password !== "null" &&
      currentUser.password !== "undefined" &&
      currentUser.password.length > 10; // bcrypt hash minimal length

    console.log("Password update attempt:", {
      userId,
      isGoogleUser,
      isLocalUser,
      hasExistingPassword,
      currentPasswordProvided: !!currentPassword,
      passwordLength: currentUser.password ? currentUser.password.length : 0,
      passwordType: typeof currentUser.password,
    });

    // Validation rules
    if (isLocalUser && hasExistingPassword) {
      // Local user dengan existing password - WAJIB current password
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: "Current password is required",
        });
      }

      // Verify current password
      try {
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
      } catch (compareError) {
        console.error("Password comparison error:", compareError);
        return res.status(400).json({
          success: false,
          error: "Error validating current password",
        });
      }
    } else if (isGoogleUser && hasExistingPassword && currentPassword) {
      // Google user dengan existing password yang mau validate current password
      try {
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
      } catch (compareError) {
        console.error("Password comparison error:", compareError);
        return res.status(400).json({
          success: false,
          error: "Error validating current password",
        });
      }
    }

    // Cases yang tidak perlu current password:
    // 1. Google user setting password pertama kali (!hasExistingPassword)
    // 2. Local user setting password pertama kali (!hasExistingPassword) - rare case
    // 3. Google user dengan existing password tapi tidak provide current password

    // Update password
    const result = await updateUserPassword(userId, newPassword);

    if (result.success) {
      // Log successful password update
      console.log("Password updated successfully for user:", {
        userId,
        wasFirstTime: !hasExistingPassword,
        provider: currentUser.provider || 'local'
      });

      res.json({
        success: true,
        message: !hasExistingPassword
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