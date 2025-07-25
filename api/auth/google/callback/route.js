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
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_user_data`);
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
        password: null,
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
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=create_user_failed`);
      }
    } else {
      console.log("User exists:", user.username);
      // Update existing user dengan Google info
      if (!user.googleId) {
        console.log("Updating user with Google info...");
        await updateUserWithGoogleInfo(email, {
          googleId,
          avatar: picture
        });
        // Refresh user data
        user = await getUserByEmailOrUsername(email);

        try {
          const { users } = await require("../../../../db").connectDB();
          await users.updateOne(
            { email: email.toLowerCase() },
            {
              $set: {
                googleId,
                avatar: picture || user.avatar,
                provider: "google",
                updatedAt: new Date()
              }
            }
          );
        } catch (updateError) {
          console.error("Failed to update user with Google info:", updateError);
        }
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

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });
    console.log("JWT token generated successfully");

    // PERBAIKAN UTAMA: Cookie configuration yang lebih robust
    const isProduction = process.env.NODE_ENV === "production";
    
    // Cookie options untuk production
    const productionCookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
      // Domain tidak di-set agar cookie bisa cross-origin
    };

    // Cookie options untuk development
    const developmentCookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/"
    };

    const cookieOptions = isProduction ? productionCookieOptions : developmentCookieOptions;

    console.log("Setting auth cookie with options:", cookieOptions);
    
    // Set cookie dengan multiple attempts untuk memastikan berhasil
    res.cookie("token", token, cookieOptions);
    
    // Untuk production, set additional cookie variants
    if (isProduction) {
      // Set dengan domain explicit untuk vercel
      res.cookie("token", token, {
        ...productionCookieOptions,
        domain: ".vercel.app"
      });
      
      // Set tanpa domain constraint
      res.cookie("token", token, {
        ...productionCookieOptions,
        domain: undefined
      });
    }

    // Redirect langsung dengan query parameter untuk trigger auth check
    const redirectUrl = state ? 
      decodeURIComponent(state) : 
      `${process.env.FRONTEND_URL}/dashboard`;

    // Tambahkan parameter untuk trigger auth recheck
    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set('google_login', 'success');
    finalRedirectUrl.searchParams.set('_t', Date.now().toString()); // Cache buster

    console.log("Redirecting to:", finalRedirectUrl.toString());

    // SOLUSI ALTERNATIF: Gunakan HTML page dengan JavaScript untuk set cookie dan redirect
    const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Complete</title>
        <script>
            console.log('Google OAuth callback processing...');
            
            // Multiple cookie setting attempts
            const cookieConfigs = [
                'token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; ${isProduction ? 'secure; samesite=none' : 'samesite=lax'}',
                'token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax',
                'token=${token}; path=/; max-age=${7 * 24 * 60 * 60}'
            ];
            
            cookieConfigs.forEach(config => {
                document.cookie = config;
                console.log('Set cookie:', config.substring(0, 50) + '...');
            });
            
            // Verify cookie was set
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {});
            
            console.log('Cookies after setting:', Object.keys(cookies));
            console.log('Token cookie present:', !!cookies.token);
            
            // Store token in localStorage as backup
            try {
                localStorage.setItem('authToken', '${token}');
                console.log('Token stored in localStorage as backup');
            } catch (e) {
                console.warn('Could not store token in localStorage:', e);
            }
            
            // Redirect with delay to ensure cookie is set
            setTimeout(function() {
                console.log('Redirecting to:', '${finalRedirectUrl.toString()}');
                window.location.href = '${finalRedirectUrl.toString()}';
            }, 500);
        </script>
    </head>
    <body>
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Authentication Successful</h2>
            <p>Please wait while we redirect you...</p>
            <div style="margin-top: 20px;">
                <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>
            // Fallback redirect if setTimeout doesn't work
            window.addEventListener('load', function() {
                setTimeout(function() {
                    if (window.location.href.includes('callback')) {
                        window.location.href = '${finalRedirectUrl.toString()}';
                    }
                }, 1000);
            });
        </script>
    </body>
    </html>`;

    // Send HTML response instead of direct redirect
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(htmlResponse);

    console.log("=== GOOGLE CALLBACK END ===");

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

    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${errorParam}`);
  }
});

module.exports = router;