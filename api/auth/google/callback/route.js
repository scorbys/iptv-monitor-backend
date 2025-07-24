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
    console.log("User-Agent:", req.headers['user-agent']);

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
    const userId = user._id?.toString() ||
      user.userId?.toString() ||
      user.id?.toString();

    console.log("Debug user object:", {
      _id: user._id,
      userId: user.userId,
      id: user.id,
      finalUserId: userId
    });

    if (!userId) {
      console.error("No valid user ID found in user object:", user);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_user_id`);
    }

    const tokenPayload = {
      userId: userId,
      username: user.username,
      email: user.email,
      iat: Math.floor(Date.now() / 1000)
    };
    console.log("Final token payload:", tokenPayload);
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });
    console.log("JWT token generated successfully for user:", userId);

    // console.log("JWT token generated successfully");
    // console.log("Token payload userId:", tokenPayload.userId); // Debug log

    // PERBAIKAN UTAMA: Simplified cookie configuration untuk mobile compatibility
    const isProduction = process.env.NODE_ENV === "production";
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(req.headers['user-agent'] || '');

    // Mobile-friendly cookie configuration
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    };

    console.log("Setting auth cookie with options:", cookieOptions);
    console.log("Is mobile device:", isMobile);

    // Set cookie hanya sekali dengan konfigurasi yang paling kompatibel
    res.cookie("token", token, cookieOptions);

    // Fallback cookie untuk mobile
    if (isMobile) {
      res.cookie("auth-token", token, {
        ...cookieOptions,
        httpOnly: false // Agar bisa diakses JavaScript di mobile
      });
    }

    // Redirect URL
    const redirectUrl = state ?
      decodeURIComponent(state) :
      `${process.env.FRONTEND_URL}/dashboard`;

    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set('google_login', 'success');
    finalRedirectUrl.searchParams.set('_t', Date.now().toString());

    console.log("Redirecting to:", finalRedirectUrl.toString());

    // MOBILE-OPTIMIZED HTML Response dengan improved cookie handling
    const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Complete</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
            console.log('Google OAuth callback processing...');
            
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            console.log('Is mobile device:', isMobile);
            
            // Enhanced cookie setting untuk mobile
            const token = '${token}';
            const isProduction = window.location.protocol === 'https:';
            
            // Set cookie dengan multiple methods untuk compatibility
            const setCookies = () => {
                // Method 1: Standard cookie setting
                const cookieString = \`token=\${token}; path=/; max-age=\${7 * 24 * 60 * 60}; \${isProduction ? 'secure; samesite=none' : 'samesite=lax'}\`;
                document.cookie = cookieString;
                
                // Method 2: Backup cookie untuk mobile
                const backupCookieString = \`auth-token=\${token}; path=/; max-age=\${7 * 24 * 60 * 60}; \${isProduction ? 'secure; samesite=none' : 'samesite=lax'}\`;
                document.cookie = backupCookieString;
                
                console.log('Cookies set:', {
                    standard: cookieString.substring(0, 50) + '...',
                    backup: backupCookieString.substring(0, 50) + '...'
                });
            };
            
            // Set cookies immediately
            setCookies();
            
            // Store token in localStorage as additional backup for mobile
            try {
                localStorage.setItem('authToken', token);
                localStorage.setItem('token', token);
                console.log('Token stored in localStorage as backup');
            } catch (e) {
                console.warn('Could not store token in localStorage:', e);
            }
            
            // Verify cookies were set
            setTimeout(() => {
                const allCookies = document.cookie;
                console.log('All cookies after setting:', allCookies);
                console.log('Token cookie present:', document.cookie.includes('token='));
                console.log('Auth-token cookie present:', document.cookie.includes('auth-token='));
                
                // Enhanced redirect for mobile
                const redirectDelay = isMobile ? 2000 : 1000; // Longer delay for mobile
                
                setTimeout(() => {
                    console.log('Redirecting to:', '${finalRedirectUrl.toString()}');
                    
                    // Force refresh untuk ensure cookie is recognized
                    if (isMobile) {
                        // For mobile, use location.replace with cache busting
                        const redirectUrl = new URL('${finalRedirectUrl.toString()}');
                        redirectUrl.searchParams.set('_refresh', Date.now().toString());
                        window.location.replace(redirectUrl.toString());
                    } else {
                        window.location.href = '${finalRedirectUrl.toString()}';
                    }
                }, redirectDelay);
            }, 500);
        </script>
    </head>
    <body>
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
            <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color: #2c3e50; margin-bottom: 15px; font-size: 24px;">Authentication Successful ✓</h2>
                <p style="color: #7f8c8d; margin-bottom: 25px; font-size: 16px;">Please wait while we redirect you...</p>
                <div style="margin: 20px 0;">
                    <div class="spinner"></div>
                </div>
                <p style="color: #95a5a6; font-size: 14px; margin-top: 20px;">If you're not redirected automatically, <a href="${finalRedirectUrl.toString()}" style="color: #3498db; text-decoration: none;">click here</a></p>
            </div>
        </div>
        
        <style>
            .spinner {
                display: inline-block;
                width: 40px;
                height: 40px;
                border: 4px solid #ecf0f1;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            body {
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            @media (max-width: 480px) {
                body { padding: 10px; }
                .spinner { width: 30px; height: 30px; }
                h2 { font-size: 20px !important; }
                p { font-size: 14px !important; }
            }
        </style>
        
        <script>
            // Enhanced fallback for mobile browsers
            let redirectAttempted = false;
            
            const performRedirect = () => {
                if (redirectAttempted) return;
                redirectAttempted = true;
                
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                if (isMobile) {
                    // For mobile, try multiple redirect methods
                    try {
                        if (window.location.replace) {
                            window.location.replace('${finalRedirectUrl.toString()}');
                        } else {
                            window.location.href = '${finalRedirectUrl.toString()}';
                        }
                    } catch (e) {
                        console.error('Redirect error:', e);
                        // Manual redirect as last resort
                        window.location = '${finalRedirectUrl.toString()}';
                    }
                } else {
                    window.location.href = '${finalRedirectUrl.toString()}';
                }
            };
            
            // Multiple fallback triggers
            window.addEventListener('load', () => {
                setTimeout(performRedirect, 2000);
            });
            
            // Additional fallback
            setTimeout(performRedirect, 3000);
            
            // Handle visibility change (mobile app switching)
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && !redirectAttempted) {
                    setTimeout(performRedirect, 500);
                }
            });
        </script>
    </body>
    </html>`;

    // Send HTML response with mobile-optimized headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Mobile-specific headers
    res.setHeader('X-UA-Compatible', 'IE=edge');
    res.setHeader('Vary', 'User-Agent');

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