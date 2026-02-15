const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const {
  createUser,
  getUserByEmailOrUsername,
  updateUserWithGoogleInfo,
} = require("../../../../db");

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
    console.log("User-Agent:", req.headers["user-agent"]);

    const code = req.query.code;
    const state = req.query.state ? decodeURIComponent(req.query.state) : null;
    const error = req.query.error;

    // Handle OAuth errors
    if (error) {
      console.log("OAuth error:", error);
      const errorUrl = `${process.env.FRONTEND_URL}/login?error=${error}`;
      return res.redirect(errorUrl);
    }

    if (!code) {
      console.log("No authorization code found");
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
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
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=invalid_user_data`
      );
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
        name: name,
        password: null,
        googleId,
        avatar: picture || null,
        provider: "google",
      });

      if (createResult.success) {
        // Get the created user
        user = await getUserByEmailOrUsername(email);
        console.log("New user created:", {
          username: user.username,
          name: user.name,
          provider: user.provider,
          avatar: user.avatar
        });
      } else {
        console.error("Failed to create user:", createResult.error);
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=create_user_failed`
        );
      }
    } else {
      console.log("User exists:", {
        username: user.username,
        name: user.name,
        provider: user.provider,
      });

      // Update existing user dengan Google info
      if (!user.googleId) {
        console.log("Updating user with Google info...");

        try {
          const { users } = await require("../../../../db").connectDB();
          const updateResult = await users.updateOne(
            { email: email.toLowerCase() },
            {
              $set: {
                googleId,
                avatar: picture || user.avatar,
                name: name || user.name,
                provider: user.provider === "local" ? "google" : user.provider, // Preserve existing provider if not local
                updatedAt: new Date(),
              },
            }
          );

          console.log("User update result:", updateResult);

          // Refresh user data setelah update
          user = await getUserByEmailOrUsername(email);
          console.log("Updated user data:", {
            username: user.username,
            name: user.name,
            provider: user.provider,
            avatar: user.avatar,
            googleId: user.googleId,
          });
        } catch (updateError) {
          console.error("Failed to update user with Google info:", updateError);
        }
      }
    }

    // Generate JWT token
    console.log("Generating JWT token...");
    const userId =
      user._id?.toString() || user.userId?.toString() || user.id?.toString();

    console.log("Debug user object:", {
      _id: user._id,
      userId: user.userId,
      id: user.id,
      finalUserId: userId,
    });

    if (!userId) {
      console.error("No valid user ID found in user object:", user);
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=invalid_user_id`
      );
    }

    const tokenPayload = {
      userId: userId,
      username: user.username,
      name: user.name || user.username,
      email: user.email,
      provider: user.provider || 'google',
      googleId: user.googleId || null,
      avatar: user.avatar || null,
      iat: Math.floor(Date.now() / 1000),
    };
    
    console.log("Enhanced token payload:", {
      userId: tokenPayload.userId,
      username: tokenPayload.username,
      name: tokenPayload.name,
      email: tokenPayload.email,
      provider: tokenPayload.provider,
      hasGoogleId: !!tokenPayload.googleId,
      hasAvatar: !!tokenPayload.avatar
    });

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });
    console.log("JWT token generated successfully for user:", userId);

    // Enhanced cookie configuration
    const isProduction = process.env.NODE_ENV === "production";
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        req.headers["user-agent"] || ""
      );

    // CRITICAL FIX: Extract dynamic domain from frontend URL or referer
    // This ensures cookies work with BOTH production and deployment preview URLs
    const getCookieDomain = (urlString) => {
      if (!urlString || !isProduction) return undefined;

      try {
        const url = new URL(urlString);
        const hostname = url.hostname;

        // CRITICAL FIX: Distinguish between deployment preview and production subdomains
        // - Deployment preview: {project}-{git-branch}-{random-hash}.vercel.app (4+ parts)
        // - Production subdomain: {subdomain}.vercel.app (3 parts: iptv-monitor.vercel.app)

        const parts = hostname.split('.');

        // Vercel deployment preview (4+ parts like xxx-yyy-zzz-www.vercel.app)
        // -> DON'T set domain (undefined), cookie will be host-specific
        if (hostname.endsWith('.vercel.app') && parts.length > 3) {
          console.log('Vercel deployment preview detected - using host-specific cookies');
          return undefined;
        }

        // Vercel domains (both production and preview)
        // -> DO NOT set cookie domain for Vercel apps
        // Browser will handle it correctly with explicit domain
        if (hostname.endsWith('.vercel.app')) {
          console.log('Vercel domain detected - using undefined domain (browser will handle)');
          return undefined;
        }

        // Custom domain with subdomain (subdomain.example.com)
        // -> Set domain to .example.com for sharing
        if (parts.length >= 2) {
          const rootDomain = `.${parts.slice(-2).join('.')}`;
          console.log('Custom domain detected - using root domain:', rootDomain);
          return rootDomain;
        }

        return undefined;
      } catch (e) {
        console.error('Failed to parse URL for cookie domain:', e);
        return undefined;
      }
    };

    // Try multiple sources to get the frontend URL
    const frontendUrl = state || req.headers.referer || process.env.FRONTEND_URL;
    const dynamicDomain = getCookieDomain(frontendUrl);

    console.log('Cookie domain configuration:', {
      frontendUrl,
      hostname: frontendUrl ? (() => {
        try {
          return new URL(frontendUrl).hostname;
        } catch (e) {
          return 'Invalid URL';
        }
      })() : 'N/A',
      dynamicDomain,
      isProduction,
      source: state ? 'state' : req.headers.referer ? 'referer' : 'env'
    });

    // FIXED: More robust cookie configuration with DYNAMIC domain
    const baseCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 60 * 60 * 1000, // 1 hour
      path: "/",
      // CRITICAL FIX: Use DYNAMIC domain instead of hardcoded COOKIE_DOMAIN
      domain: dynamicDomain,
    };

    console.log("Setting auth cookie with options:", baseCookieOptions);

    // CRITICAL FIX: Set cookie dengan multiple methods untuk ensure compatibility
    res.cookie("token", token, baseCookieOptions);

    // Additional cookie untuk mobile fallback
    res.cookie("auth-token", token, {
      ...baseCookieOptions,
      httpOnly: false, // Allow JS access on mobile
    });

    // Legacy cookie name untuk compatibility
    res.cookie("authToken", token, {
      ...baseCookieOptions,
      httpOnly: false,
    });

    // Set cookie dengan SameSite=Lax sebagai fallback
    res.cookie("token-fallback", token, {
      ...baseCookieOptions,
      sameSite: "lax",
    });

    //  Set session cookie juga
    res.cookie("session-token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });

    console.log("Multiple cookies set for compatibility");

    // Redirect URL - state is already decoded above
    const redirectUrl = state
      ? state
      : `${process.env.FRONTEND_URL}/dashboard`;

    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set("google_login", "success");
    finalRedirectUrl.searchParams.set("_t", Date.now().toString());

    // CRITICAL: Add token as URL parameter for mobile fallback
    finalRedirectUrl.searchParams.set("temp_token", encodeURIComponent(token));

    console.log("Redirecting to:", finalRedirectUrl.toString());

    // ✅ USE HTTP REDIRECT INSTEAD OF HTML - More reliable
    console.log("=== GOOGLE CALLBACK END ===");
    return res.redirect(finalRedirectUrl.toString());
  } catch (error) {
    console.error("Google callback error:", error);

    // Clear any potentially invalid cookies dengan multiple methods
    const cookieNames = ["token", "auth-token", "jwt", "authToken"];
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    };

    cookieNames.forEach((name) => {
      res.clearCookie(name, cookieOptions);
    });

    // Provide specific error messages
    let errorParam = "auth_failed";
    if (error.message && error.message.includes("invalid_grant")) {
      errorParam = "expired_code";
    } else if (error.message && error.message.includes("timeout")) {
      errorParam = "timeout";
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=${errorParam}`
    );
  }
});

module.exports = router;
