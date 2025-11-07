const express = require("express");
const router = express.Router();

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

router.post("/", (req, res) => {
  try {
    console.log("=== EXPRESS LOGOUT REQUEST START ===");

    // Clear cookie dengan berbagai konfigurasi untuk memastikan terhapus
    const cookieConfigs = [
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/"
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/"
      },
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/"
      },
      {
        path: "/"
      }
    ];

    // Clear dengan semua konfigurasi
    const cookieNames = ["token", "auth-token", "authToken", "token-fallback", "session-token"];

    cookieConfigs.forEach(config => {
      cookieNames.forEach(name => {
        res.clearCookie(name, config);
      });
    });

    console.log("✅ Express logout successful - all cookies cleared");
    console.log("=== EXPRESS LOGOUT REQUEST END ===");

    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });

  } catch (error) {
    console.error("Logout API error:", error);
    
    // Selalu return success untuk logout
    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  }
});

module.exports = router;