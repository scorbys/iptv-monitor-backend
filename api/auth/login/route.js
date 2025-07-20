const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticateUser } = require("../../../db");

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
const validateLoginInput = (req, res, next) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: "Email/username and password are required"
    });
  }

  if (identifier.trim().length === 0 || password.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Email/username and password cannot be empty"
    });
  }

  next();
};

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.post("/", validateLoginInput, async (req, res) => {
  const { identifier, password } = req.body;
  
  try {
    console.log("Login attempt for:", identifier);

    // Set timeout for authentication
    const authPromise = authenticateUser(identifier, password);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Authentication timeout")), 15000)
    );

    const authResult = await Promise.race([authPromise, timeoutPromise]);

    if (!authResult.success) {
      console.log("Login failed:", authResult.error);
      return res.status(401).json({
        success: false,
        error: authResult.error
      });
    }

    // Create JWT token
    const tokenPayload = {
      userId: authResult.user.userId,
      username: authResult.user.username,
      email: authResult.user.email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

    console.log("Login successful for:", authResult.user.username);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // Send response
    res.json({
      success: true,
      user: authResult.user,
      message: "Login successful"
    });

  } catch (error) {
    console.error("Login API error:", error);

    let errorMessage = "Internal server error";
    let statusCode = 500;

    if (error.message === "Authentication timeout") {
      errorMessage = "Authentication timeout. Please try again.";
      statusCode = 504;
    } else if (error.message === "Database connection failed") {
      errorMessage = "Database connection failed. Please try again.";
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

module.exports = router;