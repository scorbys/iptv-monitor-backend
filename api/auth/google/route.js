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
    const redirectTo = req.query.redirect || "/dashboard";

    // Validate env
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        error: "Google OAuth not configured",
      });
    }

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
      state: encodeURIComponent(`${process.env.BASE_URL}${redirectTo}`),
      prompt: "select_account",
    });

    return res.redirect(url);
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate auth URL",
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
