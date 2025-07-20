// routes/auth/google/callback.js
const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { createUser, getUserByEmailOrUsername, updateUserWithGoogleInfo } = require("../../../../db");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

const JWT_SECRET = process.env.JWT_SECRET;

// Cookie options configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",
};

// Helper function untuk update user dengan Google info
const updateUserGoogleInfo = async (email, googleData) => {
  try {
    const { connectDB } = require("../../../../db");
    const { users } = await connectDB();

    await users.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          googleId: googleData.googleId,
          avatar: googleData.avatar,
          provider: "google",
          updatedAt: new Date()
        }
      }
    );
    return true;
  } catch (error) {
    console.error("Failed to update user with Google info:", error);
    return false;
  }
};

// Helper function untuk generate response HTML
const generateResponseHTML = (user, redirectUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Google Login Success</title>
      <meta charset="utf-8">
    </head>
    <body>
      <script>
        console.log('Google login callback executed');
        
        // Cek apakah window dibuka sebagai popup
        if (window.opener && !window.opener.closed) {
          console.log('Sending message to parent window');
          
          // Kirim pesan ke parent window
          window.opener.postMessage({
            type: 'GOOGLE_LOGIN_SUCCESS',
            user: {
              userId: '${user._id?.toString() || user.userId}',
              username: '${user.username}',
              email: '${user.email}'
            },
            token: true // Menandakan bahwa cookie sudah di-set
          }, '${process.env.FRONTEND_URL || "http://localhost:3000"}');
          
          // Tunggu sebentar sebelum menutup window
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          console.log('No parent window, redirecting normally');
          // Jika tidak ada parent window, redirect normal
          window.location.href = '${redirectUrl}';
        }
        
        // Fallback jika window.close() tidak bekerja
        setTimeout(() => {
          if (!window.closed) {
            window.location.href = '${redirectUrl}';
          }
        }, 2000);
      </script>
      <div style="text-align: center; margin-top: 50px;">
        <h3>Login successful! Redirecting...</h3>
        <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a></p>
      </div>
    </body>
    </html>
  `;
};

router.get("/", async (req, res) => {
  try {
    console.log("=== GOOGLE CALLBACK START ===");
    console.log("Query params:", req.query);

    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.log("OAuth error:", error);
      const errorUrl = `${process.env.BASE_URL}/login?error=${error}`;
      return res.redirect(errorUrl);
    }

    if (!code) {
      console.log("No authorization code found");
      const errorUrl = `${process.env.BASE_URL}/login?error=no_code`;
      return res.redirect(errorUrl);
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
      const errorUrl = `${process.env.BASE_URL}/login?error=invalid_user_data`;
      return res.redirect(errorUrl);
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
        password: null, // No password for Google users
        googleId,
        avatar: picture || null,
        provider: "google",
      });

      if (createResult.success) {
        // Get the created user
        user = await getUserByEmailOrUsername(email);
        console.log("New user created:", user?.username);
      } else {
        console.error("Failed to create user:", createResult.error);
        const errorUrl = `${process.env.BASE_URL}/login?error=create_user_failed`;
        return res.redirect(errorUrl);
      }
    } else {
      console.log("User exists:", user.username);
      // Update existing user dengan Google info jika belum ada
      if (!user.googleId) {
        console.log("Updating user with Google info...");
        const updateSuccess = await updateUserGoogleInfo(email, {
          googleId,
          avatar: picture
        });

        if (updateSuccess) {
          // Refresh user data
          user = await getUserByEmailOrUsername(email);
        }
      }
    }

    // Validate user object
    if (!user) {
      console.error("User object is null after creation/retrieval");
      const errorUrl = `${process.env.BASE_URL}/login?error=user_not_found`;
      return res.redirect(errorUrl);
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
    console.log("Setting auth cookie...");
    res.cookie("token", token, cookieOptions);

    // Determine redirect URL
    let redirectUrl = `${process.env.FRONTEND_URL}/dashboard`;
    if (state) {
      try {
        const decodedState = decodeURIComponent(state);
        // Validate redirect URL - harus dari domain yang sama
        const allowedDomains = [
          process.env.FRONTEND_URL,
          process.env.BASE_URL,
          "http://localhost:3000",
          "https://localhost:3000"
        ].filter(Boolean);

        if (allowedDomains.some(domain => decodedState.startsWith(domain))) {
          redirectUrl = decodedState;
        }
      } catch (e) {
        console.log("Failed to decode state:", e);
      }
    }

    console.log("Redirecting to:", redirectUrl);
    console.log("=== GOOGLE CALLBACK END ===");

    // Send HTML response with JavaScript untuk handle popup dan redirect
    const responseHTML = generateResponseHTML(user, redirectUrl);
    res.send(responseHTML);

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
    } else if (error.message && error.message.includes("invalid_token")) {
      errorParam = "invalid_token";
    }

    const errorUrl = `${process.env.FRONTEND_URL || process.env.BASE_URL}/login?error=${errorParam}`;
    return res.redirect(errorUrl);
  }
});

module.exports = router;