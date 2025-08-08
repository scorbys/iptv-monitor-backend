const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { getUserById } = require("../../../db");

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

router.get("/", async (req, res) => {
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