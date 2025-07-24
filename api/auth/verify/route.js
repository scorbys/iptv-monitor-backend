const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// CORS middleware
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
    // Enhanced token extraction dengan mobile detection
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    console.log('=== VERIFY TOKEN DEBUG ===');
    console.log('User Agent:', userAgent);
    console.log('Is Mobile:', isMobile);
    console.log('Raw cookie header:', req.headers.cookie);
    console.log('Parsed cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('Authorization header:', req.headers.authorization);

    let token = req.cookies.token ||
      req.cookies['auth-token'] ||
      req.cookies.jwt ||
      req.cookies.authToken; // Tambahan untuk mobile

    // Manual cookie parsing sebagai fallback
    if (!token && req.headers.cookie) {
      const cookieString = req.headers.cookie;
      const cookies = cookieString.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          acc[key] = decodeURIComponent(value);
        }
        return acc;
      }, {});

      token = cookies.token ||
        cookies['auth-token'] ||
        cookies.jwt ||
        cookies.authToken;

      if (token) {
        console.log('Token found via manual cookie parsing');
      }
    }

    // Fallback dari Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('Token found in Authorization header');
      }
    }

    console.log('Token extraction result:', {
      tokenFound: !!token,
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 30) + '...' : 'none',
      isMobile: isMobile
    });

    if (!token) {
      console.log('=== NO TOKEN FOUND ===');
      return res.status(401).json({
        success: false,
        error: "No token provided",
        debug: {
          cookies: Object.keys(req.cookies || {}),
          rawCookieHeader: req.headers.cookie,
          userAgent: userAgent,
          isMobile: isMobile,
          authHeader: !!req.headers.authorization,
          // More detailed debugging info
          cookieParsingResult: req.headers.cookie ? 'attempted' : 'no_cookie_header'
        }
      });
    }

    // Verify the token dengan enhanced error handling
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('Token verification successful');
    } catch (jwtError) {
      console.error('JWT Verification Error:', {
        name: jwtError.name,
        message: jwtError.message,
        expiredAt: jwtError.expiredAt
      });

      // Clear semua possible cookie names
      const cookieNames = ['token', 'auth-token', 'jwt', 'authToken'];
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      };

      cookieNames.forEach(name => {
        res.clearCookie(name, cookieOptions);
      });

      return res.status(401).json({
        success: false,
        error: "Token verification failed",
        debug: {
          errorType: jwtError.name,
          errorMessage: jwtError.message,
          isMobile: isMobile
        }
      });
    }

    console.log('Token decoded successfully:', {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp
    });

    // Consistent user data format
    const responseData = {
      success: true,
      user: {
        userId: decoded.userId,
        id: decoded.userId,
        username: decoded.username,
        email: decoded.email
      }
    };

    console.log('Sending response:', responseData);
    console.log('=== VERIFY TOKEN SUCCESS ===');

    res.json(responseData);

  } catch (error) {
    console.error("=== VERIFY TOKEN ERROR ===");
    console.error("Unexpected error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error",
      debug: {
        errorMessage: error.message,
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(req.headers['user-agent'] || '')
      }
    });
  }
});

module.exports = router;