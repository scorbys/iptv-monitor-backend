const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

router.get("/", (req, res) => {
  try {
    const token = req.cookies.token;

    res.setHeader("Access-Control-Allow-Origin", "https://iptv-monitor2.vercel.app");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided"
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
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
      sameSite: "lax",
      path: "/",
    });
    
    res.status(401).json({
      success: false,
      error: "Invalid token"
    });
  }
});

module.exports = router;