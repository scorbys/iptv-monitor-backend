const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { createUser } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

// CORS middleware
const setCorsHeaders = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://iptv-monitor2.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
};

router.use(setCorsHeaders);

// Cookie options configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: "/"
};

// Input validation middleware
const validateRegisterInput = (req, res, next) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      error: "All fields are required"
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: "Invalid email format"
    });
  }

  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 6 characters long"
    });
  }

  next();
};

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.post("/", validateRegisterInput, async (req, res) => {
  const { username, email, password } = req.body;

  try {
    console.log("Registration attempt for:", email);

    // Create user
    const createResult = await createUser({ username, email, password });

    if (!createResult.success) {
      return res.status(400).json({
        success: false,
        error: createResult.error
      });
    }

    // Create JWT token
    const tokenPayload = {
      userId: createResult.userId.toString(),
      username: username,
      email: email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

    console.log("Registration successful for:", username);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // Send response
    res.json({
      success: true,
      user: {
        userId: createResult.userId,
        username: username,
        email: email
      },
      message: "Registration successful"
    });

  } catch (error) {
    console.error("Registration API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;