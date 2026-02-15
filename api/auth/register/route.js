const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { createUser } = require("../../../db");

const JWT_SECRET = process.env.JWT_SECRET;

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

  console.log(`[CORS REGISTER] Allowing origin: ${allowedOrigin}`);

  next();
};

router.use(setCorsHeaders);

// Cookie options configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
  path: "/"
};

// Input validation middleware
const validateRegisterInput = (req, res, next) => {
  const { username, email, password } = req.body;

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

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // CRITICAL FIX: Include token in response for frontend to save
    // Frontend needs to save token to localStorage for cross-domain compatibility
    const responseData = {
      success: true,
      user: {
        userId: createResult.userId,
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