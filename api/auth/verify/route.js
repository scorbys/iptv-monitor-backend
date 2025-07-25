const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// CORS middleware
const setCorsHeaders = (req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://iptv-monitor2.vercel.app"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
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
  const caller = req.headers["user-agent"] || "unknown";
  console.log(`[VERIFY] Called by: ${caller}`);

  try {
    const token =
      req.cookies.token ||
      req.cookies["auth-token"] ||
      req.cookies["authToken"] ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Jangan biarkan respons dicache
    res.setHeader("Cache-Control", "no-store");

    res.json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);

    // ⚠️ Hapus token hanya jika kamu benar-benar ingin — ini bisa jadi agresif
    // res.clearCookie(...);

    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
});

module.exports = router;
