const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticateUser } = require("../../../db");

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

  console.log(`[CORS LOGIN] Allowing origin: ${allowedOrigin}`);

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
const validateLoginInput = (req, res, next) => {
  const { identifier, password } = req.body;

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
      userId: authResult.user._id.toString(),
      username: authResult.user.username,
      email: authResult.user.email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });

    console.log("Login successful for:", authResult.user.username);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    // CRITICAL FIX: Include token in response for frontend to save
    // Frontend needs to save token to localStorage for cross-domain compatibility
    const responseData = {
      success: true,
      user: authResult.user,
      token: token,
      message: "Login successful"
    };

    console.log("📤 [LOGIN RESPONSE] Sending response with token:", {
      hasToken: !!responseData.token,
      tokenLength: responseData.token?.length,
      userKeys: Object.keys(responseData.user)
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

module.exports = router;# Force Railway rebuild
