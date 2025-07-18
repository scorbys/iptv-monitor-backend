const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { createUser, getUserByEmail } = require("../../../../db");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "Pec@tu2024++");

router.get("/", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Authorization code not found",
      });
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email || !googleId) {
      return res.status(400).json({
        success: false,
        error: "Invalid user data from Google",
      });
    }

    // Check if user exists
    let user = await getUserByEmail(email);

    if (!user) {
      // Create new user
      user = await createUser({
        email,
        username: name || email.split("@")[0],
        googleId,
        avatar: picture || null,
        provider: "google",
      });
    } else if (!user.googleId) {
      // Update user with Google ID (optional logic)
      user.googleId = googleId;
      user.avatar = picture || user.avatar;
      // You should update the DB if needed here
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id || user.userId,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET || "Pec@tu2024++",
      {
        algorithm: "HS256", // opsional, default-nya HS256 juga
        expiresIn: "7d"
      }
    );

    // Set cookie and redirect
    const redirectUrl = state
      ? decodeURIComponent(state)
      : `${process.env.BASE_URL}/dashboard`;

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // in ms
      path: "/",
    });

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google callback error:", error);

    let redirectTo = `${process.env.BASE_URL}/login?error=auth_failed`;

    if (error.message && error.message.includes("invalid_grant")) {
      redirectTo = `${process.env.BASE_URL}/login?error=expired_code`;
    }

    return res.redirect(redirectTo);
  }
});

module.exports = router;
