const express = require("express");
const router = express.Router();

// CORS middleware untuk route ini - Dynamic origin using env
const getAllowedOrigins = () => {
  const envList = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const add = [];
  if (process.env.FRONTEND_URL) add.push(process.env.FRONTEND_URL);
  if (process.env.PUBLIC_BASE_URL) add.push(process.env.PUBLIC_BASE_URL);
  if (process.env.NEXT_PUBLIC_API_URL) add.push(process.env.NEXT_PUBLIC_API_URL);
  return Array.from(new Set([...envList, ...add]));
};

const getDefaultOrigin = () => process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'https://be.radissonuluwatu.my.id';

const setCorsHeaders = (req, res, next) => {
  const requestOrigin = req.headers.origin || req.headers.referer;
  const allowedOrigins = getAllowedOrigins();
  let allowedOrigin = allowedOrigins[0] || getDefaultOrigin();

  if (requestOrigin) {
    try {
      const originUrl = new URL(requestOrigin);
      const hostname = originUrl.hostname;

      if (hostname.endsWith('.vercel.app') || hostname === 'localhost' || hostname === '127.0.0.1') {
        allowedOrigin = requestOrigin;
      } else if (allowedOrigins.includes(requestOrigin) || allowedOrigins.includes(hostname)) {
        allowedOrigin = requestOrigin;
      } else {
        console.warn(`[CORS] Unknown origin: ${requestOrigin}, using ${allowedOrigin}`);
      }
    } catch (e) {
      console.error('[CORS] Invalid origin:', requestOrigin);
    }
  } else {
    if (req.headers.host && (req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1'))) {
      allowedOrigin = '*';
      console.log(`[CORS] Local development detected (host: ${req.headers.host}), allowing all origins`);
    }
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