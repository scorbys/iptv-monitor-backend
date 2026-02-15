const express = require("express");
const router = express.Router();

// CORS middleware untuk route ini - Dynamic origin
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

  next();
};

router.use(setCorsHeaders);

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.get("/", (req, res) => {
  try {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "IPTV Authentication API"
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

router.post("/", (req, res) => {
  try {
    res.json({
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "IPTV Authentication API"
    });
  } catch (error) {
    console.error("Health check POST error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;