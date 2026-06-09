const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { createUser } = require("../../../db");

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

  console.log(`[CORS REGISTER] Allowing origin: ${allowedOrigin}`);

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
const validateRegisterInput = (req, res, next) => {
  const { username, email, password } = req.body;

  // Reject non-string values to prevent NoSQL injection / malformed input
  if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      error: "All fields must be strings"
    });
  }

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      error: "All fields are required"
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: "Invalid email format"
    });
  }

  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 6 characters long"
    });
  }

  next();
};

// Handle preflight OPTIONS requests
router.options("/", (req, res) => {
  res.status(200).end();
});

router.post("/", validateRegisterInput, async (req, res) => {
  const { username, email, password } = req.body;

  try {
    console.log("Registration attempt for:", email);

    // Create user
    const createResult = await createUser({ username, email, password });

    if (!createResult.success) {
      return res.status(400).json({
        success: false,
        error: createResult.error
      });
    }

    // Create JWT token
    const tokenPayload = {
      userId: createResult.userId.toString(),
      username: username,
      email: email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });

    console.log("Registration successful for:", username);

    // Get dynamic cookie options based on request origin
    const cookieOptions = getCookieOptions(req);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // CRITICAL FIX: Include token in response for frontend to save
    // Frontend needs to save token to localStorage for cross-domain compatibility
    const responseData = {
      success: true,
      user: {
        id: createResult.userId.toString(),
        username: username,
        email: email
      },
      token: token,
      message: "Registration successful"
    };

    console.log("📤 [REGISTER RESPONSE] Sending response with token:", {
      hasToken: !!responseData.token,
      tokenLength: responseData.token?.length,
      userKeys: Object.keys(responseData.user)
    });

    res.json(responseData);

  } catch (error) {
    console.error("Registration API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;