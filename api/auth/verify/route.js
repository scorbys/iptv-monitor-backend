const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getUserById } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

// CORS middleware - use environment-provided allowed origins when available
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
    const host = req.headers.host;
    if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      allowedOrigin = '*';
      console.log(`[CORS] Local development detected (host: ${host}), allowing all origins`);
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

router.get("/", async (req, res) => {
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

    // Fetch complete user data from database
    let user = null;
    if (decoded.userId) {
      try {
        user = await getUserById(decoded.userId);
        if (user) {
          // Remove sensitive data
          const { password, ...userWithoutPassword } = user;
          user = userWithoutPassword;
        }
      } catch (dbError) {
        console.error("Error fetching user from database:", dbError);
        // Fallback to token data if database fails
        user = {
          id: decoded.userId,
          userId: decoded.userId,
          username: decoded.username,
          email: decoded.email,
          role: decoded.role || 'guest',  // ✅ Add role
          name: decoded.name,
          avatar: decoded.avatar,
          provider: decoded.provider,
          googleId: decoded.googleId,
        };
      }
    }

    // If no user found, use token data as fallback
    if (!user) {
      user = {
        id: decoded.userId,
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role || 'guest',  // ✅ Add role
        name: decoded.name,
        avatar: decoded.avatar,
        provider: decoded.provider,
        googleId: decoded.googleId,
      };
    }

    // Don't let response be cached
    res.setHeader("Cache-Control", "no-store");

    res.json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("Token verification error:", error);

    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
});

module.exports = router;