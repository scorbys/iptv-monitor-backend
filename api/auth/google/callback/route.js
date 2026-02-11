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

        // CRITICAL: For Vercel deployment preview URLs, DON'T set domain
        // Deployment preview URLs use pattern: {project}-{id}-{hash}.vercel.app
        // Setting domain to '.vercel.app' does NOT work for these URLs
        // Only set domain for production custom domains with 2 levels

        const parts = hostname.split('.');

        // Vercel deployment preview (3+ parts like xxx-yyy-zzz.vercel.app)
        // -> DON'T set domain (undefined), cookie will be host-specific
        if (hostname.endsWith('.vercel.app') && parts.length > 2) {
          console.log('Vercel deployment preview detected - using host-specific cookies');
          return undefined;
        }

        // Production Vercel domain (2 parts like xxx.vercel.app)
        // -> Set domain to .vercel.app for sharing across subdomains
        if (hostname.endsWith('.vercel.app') && parts.length === 2) {
          console.log('Vercel production domain detected - using .vercel.app domain');
          return '.vercel.app';
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

    // ENHANCED HTML Response dengan better cookie & localStorage handling
    const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Complete</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
            console.log('=== GOOGLE OAUTH CALLBACK HTML ===');
            const token = '${token}';
            const isProduction = window.location.protocol === 'https:';
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // CRITICAL: Dynamic cookie domain based on current hostname
            const getCookieDomain = () => {
                if (!isProduction) return '';

                const hostname = window.location.hostname;
                const parts = hostname.split('.');

                // Vercel deployment preview (3+ parts like xxx-yyy-zzz.vercel.app)
                // -> DON'T set domain attribute
                if (hostname.endsWith('.vercel.app') && parts.length > 2) {
                    console.log('Vercel deployment preview detected - no domain attribute');
                    return '';
                }

                // Production Vercel domain (2 parts like xxx.vercel.app)
                // -> Set domain to .vercel.app
                if (hostname.endsWith('.vercel.app') && parts.length === 2) {
                    console.log('Vercel production domain detected - using .vercel.app');
                    return '; domain=.vercel.app';
                }

                // Custom domain with subdomain
                if (parts.length >= 2) {
                    const rootDomain = parts.slice(-2).join('.');
                    console.log('Custom domain detected - using root domain:', rootDomain);
                    return '; domain=.' + rootDomain;
                }

                return '';
            };

            const cookieDomainSuffix = getCookieDomain();

            // ENHANCED: Set cookies with multiple strategies for better compatibility
            const setCookiesAdvanced = () => {
                console.log('Setting cookies with advanced compatibility...');
                console.log('Cookie domain suffix:', cookieDomainSuffix);

                const cookieConfigs = [
                    // Primary token cookie with DYNAMIC domain
                    \`token=\${token}; path=/; max-age=\${60 * 60}; \${isProduction ? 'secure; samesite=none' : 'samesite=lax'}\${cookieDomainSuffix}\`,
                    // Auth token cookie (mobile friendly)
                    \`auth-token=\${token}; path=/; max-age=\${60 * 60}; \${isProduction ? 'secure; samesite=none' : 'samesite=lax'}\${cookieDomainSuffix}\`,
                    // Legacy authToken
                    \`authToken=\${token}; path=/; max-age=\${60 * 60}; \${isProduction ? 'secure; samesite=none' : 'samesite=lax'}\${cookieDomainSuffix}\`,
                    // Fallback dengan SameSite=Lax (no domain for maximum compatibility)
                    \`token-fallback=\${token}; path=/; max-age=\${60 * 60}; samesite=lax\`,
                    // Session token (no domain)
                    \`session-token=\${token}; path=/; samesite=lax\`
                ];

                cookieConfigs.forEach((config, index) => {
                    document.cookie = config;
                    console.log(\`Cookie \${index + 1} set: \${config.split('=')[0]}\`);
                });
            };
            
            // ENHANCED: Multiple localStorage strategies
            const setStorageAdvanced = () => {
                console.log('Setting localStorage with advanced strategies...');
                try {
                    const storageKeys = ['authToken', 'token', 'jwt', 'auth-token', 'session-token'];
                    storageKeys.forEach(key => {
                        localStorage.setItem(key, token);
                        sessionStorage.setItem(key, token);
                    });
                    
                    localStorage.setItem('isAuthenticated', 'true');
                    localStorage.setItem('authMethod', 'google');
                    localStorage.setItem('tokenSetAt', Date.now().toString());
                    
                    console.log('Advanced storage tokens set successfully');
                } catch (e) {
                    console.error('Storage error:', e);
                }
            };
            
            // Execute immediately with retry
            const initAuth = async () => {
                setCookiesAdvanced();
                setStorageAdvanced();
                
                // Verify tokens were set
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const cookieCheck = document.cookie.includes('token=');
                const storageCheck = localStorage.getItem('authToken') === token;
                
                console.log('Token verification:', { cookieCheck, storageCheck });
                
                if (!cookieCheck && !storageCheck) {
                    console.log('Retrying token setup...');
                    setCookiesAdvanced();
                    setStorageAdvanced();
                }
            };
            
            initAuth().then(() => {
                console.log('Auth initialization complete');
                
                // Redirect dengan delay yang lebih pendek
                setTimeout(() => {
                    const redirectUrl = '${finalRedirectUrl.toString()}';
                    console.log('Redirecting to:', redirectUrl);
                    window.location.href = redirectUrl;
                }, 1500);
            });
        </script>
    </head>
    <body>
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <h2>Authentication Successful ✓</h2>
            <p>Setting up your session...</p>
            <div class="spinner"></div>
            <p style="margin-top: 20px;">
                <a href="${finalRedirectUrl.toString()}">Click here if not redirected</a>
            </p>
        </div>
        
        <style>
            .spinner {
                display: inline-block;
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 20px 0;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </body>
    </html>`;

    // Send HTML response with enhanced headers
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Mobile-specific headers
    res.setHeader("X-UA-Compatible", "IE=edge");
    res.setHeader("Vary", "User-Agent, Cookie");

    // CORS headers for OAuth
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.FRONTEND_URL || "*"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    res.send(htmlResponse);

    console.log("=== GOOGLE CALLBACK END ===");
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
