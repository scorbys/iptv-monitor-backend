const express = require("express");
const router = express.Router();

// CORS middleware - Dynamic origin based on Origin header or Referer
const setCorsHeaders = (req, res, next) => {
  // Get origin from request headers
  const requestOrigin = req.headers.origin || req.headers.referer;

  // Check if origin is from Vercel or localhost
  let allowedOrigin = requestOrigin;

  if (requestOrigin) {
    try {
      const originUrl = new URL(requestOrigin);

      // Allow any Vercel deployment (both production and preview)
      if (originUrl.hostname.endsWith('.vercel.app')) {
        allowedOrigin = requestOrigin;
      }
      // Allow localhost for development
      else if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
        allowedOrigin = requestOrigin;
      }
      // Default to production if unknown
      else {
        console.warn(`[CORS] Unknown origin: ${requestOrigin}, using production origin`);
        allowedOrigin = 'https://iptv-monitor.vercel.app';
      }
    } catch (e) {
      console.error('[CORS] Invalid origin:', requestOrigin);
      allowedOrigin = 'https://iptv-monitor.vercel.app';
    }
  } else {
    allowedOrigin = 'https://iptv-monitor.vercel.app';
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");

  console.log(`[CORS LOGOUT] Allowing origin: ${allowedOrigin}`);

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