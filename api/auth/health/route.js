const express = require("express");
const router = express.Router();

// CORS middleware untuk route ini
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