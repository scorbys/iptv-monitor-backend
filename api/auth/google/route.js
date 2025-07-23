const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

// GET /api/auth/google → Redirect ke Google OAuth
router.get("/", (req, res) => {
  try {
    console.log("=== GOOGLE AUTH START ===");
    console.log("Base URL:", process.env.BASE_URL);
    console.log("Frontend URL:", process.env.FRONTEND_URL);
    
    const redirectTo = req.query.redirect || "/dashboard";
    const state = req.query.state;

    // Validate env
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("Google OAuth credentials not configured");
      return res.status(500).json({
        success: false,
        error: "Google OAuth not configured",
      });
    }

    const baseUrl = process.env.BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const finalState = state || `${process.env.FRONTEND_URL}${redirectTo}`;

    console.log("Generating auth URL with state:", finalState);

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
      state: encodeURIComponent(finalState),
      prompt: "select_account",
      include_granted_scopes: true,
    });

    console.log("Generated auth URL:", url);
    return res.redirect(url);
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate auth URL: " + error.message,
    });
  }
});

// OPTIONS /api/auth/google → Untuk CORS preflight
router.options("/", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.sendStatus(200);
});

module.exports = router;
