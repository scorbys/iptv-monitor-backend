const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

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

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.get("/", (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided"
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Return user info
    res.json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email
      }
    });
    
  } catch (error) {
    console.error("Token verification error:", error);
    
    // Clear invalid token
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    
    res.status(401).json({
      success: false,
      error: "Invalid token"
    });
  }
});

module.exports = router;