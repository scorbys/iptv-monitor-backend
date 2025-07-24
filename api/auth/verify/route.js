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
    // PERBAIKAN: Enhanced token extraction
    let token = req.cookies.token || req.cookies['auth-token'] || req.cookies.jwt;
    
    // Fallback dari Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('Token found in Authorization header');
      }
    }

    console.log('Verify route - Token present:', !!token);
    console.log('Verify route - Cookies available:', Object.keys(req.cookies || {}));

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
        debug: {
          cookies: Object.keys(req.cookies || {}),
          userAgent: req.headers['user-agent']
        }
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('Token decoded successfully:', {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email
    });
    
    // PERBAIKAN: Consistent user data format
    res.json({
      success: true,
      user: {
        userId: decoded.userId, // Pastikan menggunakan userId konsisten
        id: decoded.userId,     // Tambahan untuk compatibility
        username: decoded.username,
        email: decoded.email
      }
    });
    
  } catch (error) {
    console.error("Token verification error:", error);
    console.error("Token verification error type:", error.name);
    console.error("Token verification error message:", error.message);
    
    // Clear invalid token dengan multiple cookie names
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    };
    
    res.clearCookie("token", cookieOptions);
    res.clearCookie("auth-token", cookieOptions);
    res.clearCookie("jwt", cookieOptions);
    
    res.status(401).json({
      success: false,
      error: "Invalid token",
      debug: {
        errorType: error.name,
        errorMessage: error.message
      }
    });
  }
});

module.exports = router;