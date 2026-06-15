const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticateUser } = require("../../../db");

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

// Cookie options configuration
const getCookieDomain = (req) => {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return undefined;

  try {
    const originUrl = new URL(origin);
    const hostname = originUrl.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return undefined;
    }

    // Vercel preview deployment should not set domain attribute
    if (hostname.endsWith('.vercel.app')) {
      const parts = hostname.split('.');
      if (parts.length > 2) return undefined;
      return '.vercel.app';
    }

    const publicSuffixes = [
      'co.id',
      'or.id',
      'ac.id',
      'sch.id',
      'web.id',
      'my.id',
      'gov.id',
      'net.id',
      'mil.id'
    ];

    const parts = hostname.split('.');
    if (parts.length < 2) return undefined;

    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');

    if (publicSuffixes.includes(lastTwo) && parts.length >= 3) {
      return `.${lastThree}`;
    }

    return `.${lastTwo}`;
  } catch (e) {
    return undefined;
  }
};

const getCookieOptions = (req) => {
  const isProduction = process.env.NODE_ENV === "production";
  const domain = getCookieDomain(req);

  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
    path: "/"
  };

  // Only set domain if explicitly determined
  if (domain) {
    options.domain = domain;
  }

  console.log(`[COOKIE OPTIONS]`, {
    isProduction,
    domain: domain || 'none',
    sameSite: options.sameSite,
    secure: options.secure
  });

  return options;
};

// Input validation middleware
const validateLoginInput = (req, res, next) => {
  const { identifier, password } = req.body;

  // Reject non-string values to prevent NoSQL injection (e.g. { $ne: null })
  if (typeof identifier !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      error: "Email/username and password must be strings"
    });
  }

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: "Email/username and password are required"
    });
  }

  if (identifier.trim().length === 0 || password.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Email/username and password cannot be empty"
    });
  }

  next();
};

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.post("/", validateLoginInput, async (req, res) => {
  const { identifier, password } = req.body;

  try {
    console.log("Login attempt for:", identifier);

    // Set timeout for authentication
    const authPromise = authenticateUser(identifier, password);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Authentication timeout")), 15000)
    );

    const authResult = await Promise.race([authPromise, timeoutPromise]);

    if (!authResult.success) {
      console.log("Login failed:", authResult.error);
      return res.status(401).json({
        success: false,
        error: authResult.error
      });
    }

    // Create JWT token
    const tokenPayload = {
      userId: (authResult.user._id || authResult.user.id || authResult.user.userId).toString(),
      username: authResult.user.username,
      email: authResult.user.email,
      role: authResult.user.role || 'guest', // Include role in token
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });

    console.log("Login successful for:", authResult.user.username, "with role:", tokenPayload.role);

    // Get dynamic cookie options based on request origin
    const cookieOptions = getCookieOptions(req);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // CRITICAL FIX: Include token in response for frontend to save
    // Frontend needs to save token to localStorage for cross-domain compatibility
    const userResponse = {
      id: (authResult.user._id || authResult.user.id || authResult.user.userId).toString(),
      username: authResult.user.username,
      email: authResult.user.email,
      role: authResult.user.role || 'guest' // Include role in response
    };

    const responseData = {
      success: true,
      user: userResponse,
      token: token,
      message: "Login successful"
    };

    console.log("📤 [LOGIN RESPONSE] Sending successful login response:", {
      userId: responseData.user.id,
      username: responseData.user.username,
      role: responseData.user.role
    });

    res.json(responseData);

  } catch (error) {
    console.error("Login API error:", error);

    let errorMessage = "Internal server error";
    let statusCode = 500;

    if (error.message === "Authentication timeout") {
      errorMessage = "Authentication timeout. Please try again.";
      statusCode = 504;
    } else if (error.message === "Database connection failed") {
      errorMessage = "Database connection failed. Please try again.";
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

module.exports = router;
