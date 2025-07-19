const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { createUser, getUserByEmailOrUsername } = require("../../../../db");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

const JWT_SECRET = process.env.JWT_SECRET;

router.get("/", async (req, res) => {
  try {
    console.log("=== GOOGLE CALLBACK START ===");
    console.log("Query params:", req.query);

    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;

    // Handle OAuth errors
    if (error) {
      console.log("OAuth error:", error);
      const errorUrl = `${process.env.BASE_URL}/login?error=${error}`;
      return res.redirect(errorUrl);
    }

    if (!code) {
      console.log("No authorization code found");
      return res.redirect(`${process.env.BASE_URL}/login?error=no_code`);
    }

    console.log("Exchanging code for tokens...");
    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    console.log("Verifying ID token...");
    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    console.log("Google user info:", { email, name, googleId });

    if (!email || !googleId) {
      console.log("Invalid user data from Google");
      return res.redirect(`${process.env.BASE_URL}/login?error=invalid_user_data`);
    }

    // Check if user exists
    console.log("Checking if user exists...");
    let user = await getUserByEmailOrUsername(email);

    if (!user) {
      console.log("Creating new user...");
      // Create new user
      const createResult = await createUser({
        email,
        username: name || email.split("@")[0],
        password: googleId, // Use googleId as password for Google users
        googleId,
        avatar: picture || null,
        provider: "google",
      });

      if (createResult.success) {
        // Get the created user
        user = await getUserByEmailOrUsername(email);
        console.log("New user created:", user.username);
      } else {
        console.error("Failed to create user:", createResult.error);
        return res.redirect(`${process.env.BASE_URL}/login?error=create_user_failed`);
      }
    } else {
      console.log("User exists:", user.username);
      // Optionally update user with Google info if not set
      if (!user.googleId) {
        console.log("Updating user with Google info...");
        // Update user in database if needed - implement updateUser function in db.js if required
      }
    }

    // Generate JWT token
    console.log("Generating JWT token...");
    const tokenPayload = {
      userId: user._id?.toString() || user.userId,
      username: user.username,
      email: user.email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

    // Set cookie with proper configuration
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    };

    console.log("Setting auth cookie...");
    res.cookie("token", token, cookieOptions);

    // Determine redirect URL
    let redirectUrl = `${process.env.BASE_URL}/dashboard`;
    if (state) {
      try {
        const decodedState = decodeURIComponent(state);
        // Validate redirect URL
        if (decodedState.startsWith(process.env.BASE_URL)) {
          redirectUrl = decodedState;
        }
      } catch (e) {
        console.log("Failed to decode state:", e);
      }
    }

    console.log("Redirecting to:", redirectUrl);
    console.log("=== GOOGLE CALLBACK END ===");

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google callback error:", error);

    // Clear any potentially invalid cookies
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    // Provide specific error messages
    let errorParam = "auth_failed";
    if (error.message && error.message.includes("invalid_grant")) {
      errorParam = "expired_code";
    } else if (error.message && error.message.includes("timeout")) {
      errorParam = "timeout";
    }

    return res.redirect(`${process.env.BASE_URL}/login?error=${errorParam}`);
  }
});

module.exports = router;