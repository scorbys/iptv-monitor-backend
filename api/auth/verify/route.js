const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getUserById } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

// CORS middleware - Dynamic origin based on Origin header or Referer
const setCorsHeaders = (req, res, next) => {
  // Get origin from request headers
  const requestOrigin = req.headers.origin || req.headers.referer;

  // List of allowed origins (both production and deployment previews)
  const allowedOrigins = [
    // Production domain
    'https://iptv-monitor.vercel.app',
    // Allow any Vercel deployment preview (using wildcard pattern)
    // We'll check if it matches *.vercel.app
  ];

  // Check if origin is from Vercel or is in our allowed list
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
      // Check against explicit allowed origins
      else if (allowedOrigins.includes(requestOrigin)) {
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
    // No origin header - this is a same-origin request (likely from localhost)
    // For development, we should allow same-origin requests
    const host = req.headers.host;
    if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      // Local development - allow the request
      allowedOrigin = '*'; // Allow any origin for local dev
      console.log(`[CORS] Local development detected (host: ${host}), allowing all origins`);
    } else {
      // Production without origin header
      allowedOrigin = 'https://iptv-monitor.vercel.app';
    }
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin"); // Important for caching

  console.log(`[CORS] Allowing origin: ${allowedOrigin}`);

  next();
};

router.use(setCorsHeaders);

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.get("/", async (req, res) => {
  const caller = req.headers["user-agent"] || "unknown";
  console.log(`[VERIFY] Called by: ${caller}`);

  // Debug: Log all headers and cookies
  console.log(`[VERIFY] Request headers:`, {
    authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 30)}...` : 'none',
    allHeaders: Object.keys(req.headers),
    cookies: Object.keys(req.cookies),
    tokenCookie: req.cookies.token ? 'exists' : 'none'
  });

  try {
    const token =
      req.cookies.token ||
      req.cookies["auth-token"] ||
      req.cookies["authToken"] ||
      req.headers.authorization?.split(" ")[1];

    console.log(`[VERIFY] Token extraction result:`, {
      fromCookie: !!req.cookies.token,
      fromAuth: !!req.headers.authorization,
      tokenFound: !!token,
      tokenLength: token?.length
    });

    if (!token) {
      console.log(`[VERIFY] No token found - returning 401`);
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