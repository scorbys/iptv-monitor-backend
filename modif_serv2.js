require('dotenv').config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const dgram = require("dgram");
const net = require("net");
const path = require("path");
const {
  createUser,
  authenticateUser,
} = require("./db");

const app = express();
const port = process.env.PORT || 3001;
const verifyRoute = require("./api/auth/verify/route");
const googleAuthRoute = require("./api/auth/google/route");
const googleCallbackRoute = require("./api/auth/google/callback/route");
const IPTVTelegramBot = require('./api/services/telegram/bot-tele');
const userProfileRoute = require("./api/user/profile/route");
const userPasswordRoute = require("./api/user/password/route");
const userAvatarRoute = require("./api/user/avatar/route");

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET environment variable is required");
  process.exit(1);
}

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://iptv-monitor2.vercel.app",
    ];

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// Ensure uploads directory exists at startup
const ensureUploadsDirectory = () => {
  try {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Created uploads directory:', uploadsDir);
    } else {
      console.log('✅ Uploads directory exists:', uploadsDir);
    }
  } catch (error) {
    console.error('❌ Error creating uploads directory:', error);
  }
};

// Explicit OPTIONS handler untuk preflight requests
app.options(/.*/, cors());

// Manual CORS headers untuk semua responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://iptv-monitor2.vercel.app",
  ];

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.header("Cross-Origin-Embedder-Policy", "unsafe-none");

  next();
});

// Static files middleware untuk serve uploaded files
app.use('/api/uploads', express.static(path.join(process.cwd(), 'public/uploads'), {
  maxAge: '1y', // Cache selama 1 tahun
  setHeaders: (res, filePath) => {
    // Set proper headers untuk images
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    const contentType = contentTypes[ext];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Add CORS headers for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors(corsOptions));
app.use("/api/auth/verify", verifyRoute);
app.use("/api/auth/google", googleAuthRoute);
app.use("/api/auth/google/callback", googleCallbackRoute);
app.use("/api/user/profile", userProfileRoute);
app.use("/api/user/password", userPasswordRoute);
app.use("/api/user/avatar", userAvatarRoute);

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);

  // Log cookies untuk debugging
  if (req.path.includes('/auth/')) {
    console.log("Cookies:", req.cookies);
  }

  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  console.log("=== AUTHENTICATE TOKEN START ===");

  // Cek token dari cookie terlebih dahulu, kemudian dari header
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  console.log("Token source:", {
    fromCookie: !!req.cookies.token,
    fromHeader: !!req.headers.authorization,
    tokenPresent: !!token
  });

  if (!token) {
    console.log("❌ No token provided");
    return res.status(401).json({
      success: false,
      error: "Access denied. No token provided.",
      authenticated: false
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log("✅ Token verified for user:", decoded.username);
    console.log("Token expires at:", new Date(decoded.exp * 1000));
    console.log("=== AUTHENTICATE TOKEN END ===");
    next();
  } catch (error) {
    console.error("💥 Token verification error:", error);

    // berikan pesan error yang lebih spesifik
    let errorMessage = "Invalid token";
    let statusCode = 403;

    if (error.name === 'TokenExpiredError') {
      errorMessage = "Token expired";
      statusCode = 401;
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = "Invalid token format";
      statusCode = 401;
    }

    // Clear cookie jika token invalid
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/"
    });

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      authenticated: false
    });
  }
};

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("=== LOGIN REQUEST START ===");
    console.log("Headers:", req.headers);
    console.log("Body:", {
      identifier: req.body.identifier,
      passwordLength: req.body.password ? req.body.password.length : 0
    });

    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      console.log("❌ Missing credentials");
      return res.status(400).json({
        success: false,
        error: "Email/username and password are required",
      });
    }

    // Authenticate user
    console.log("🔍 Authenticating user...");
    const result = await authenticateUser(identifier, password);
    console.log("Authentication result:", {
      success: result.success,
      userId: result.user?.id,
      username: result.user?.username,
      error: result.error
    });

    if (result.success && result.user) {
      // Generate JWT token - pastikan field yang benar digunakan
      const tokenPayload = {
        userId: result.user.id || result.user.userId,
        email: result.user.email,
        username: result.user.username,
        iat: Math.floor(Date.now() / 1000)
      };

      console.log("🎫 Creating token with payload:", tokenPayload);

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

      // Set cookie dengan konfigurasi yang lebih kompatibel
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/" // PENTING: pastikan path cookie
      };

      console.log("🍪 Setting cookie with options:", cookieOptions);
      res.cookie("token", token, cookieOptions);

      // Konsisten dengan field yang digunakan di JWT
      const userResponse = {
        id: result.user.id || result.user.userId,
        username: result.user.username,
        email: result.user.email,
      };

      console.log("✅ Login successful for user:", userResponse.username);
      console.log("=== LOGIN REQUEST END ===");

      res.json({
        success: true,
        user: userResponse,
        message: "Login successful",
      });
    } else {
      console.log("❌ Login failed:", result.error);
      res.status(401).json({
        success: false,
        error: result.error || "Invalid credentials",
      });
    }
  } catch (error) {
    console.error("💥 Login API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during login",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Register endpoint
app.post("/api/auth/register", async (req, res) => {
  try {
    console.log("Registration attempt:", {
      username: req.body.username,
      email: req.body.email,
    });

    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Username, email, and password are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid email address",
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      });
    }

    // Username validation
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: "Username must be at least 3 characters long",
      });
    }

    // Create user
    const result = await createUser({ username, email, password });
    console.log("User creation result:", {
      success: result.success,
      userId: result.userId,
    });

    if (result.success && result.userId) {
      // Generate JWT token for new user
      const token = jwt.sign(
        {
          userId: result.userId,
          email: email,
          username: username,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Set HTTP-only cookie - sameSite untuk cross-origin
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      console.log("Registration successful for user:", username);

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        user: {
          id: result.userId,
          username: username,
          email: email,
        },
      });
    } else {
      console.log("Registration failed:", result.error);
      res.status(400).json({
        success: false,
        error: result.error || "Failed to create account",
      });
    }
  } catch (error) {
    console.error("Register API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during registration",
    });
  }
});

// Logout endpoint
app.post("/api/auth/logout", (req, res) => {
  try {
    console.log("=== LOGOUT REQUEST START ===");
    console.log("Current cookies:", req.cookies);

    // Clear cookie dengan berbagai konfigurasi untuk memastikan terhapus
    const cookieConfigs = [
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      },
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      },
      {
        path: "/", // Basic clear
      }
    ];

    // Clear dengan semua konfigurasi possible
    cookieConfigs.forEach(config => {
      res.clearCookie("token", config);
    });

    console.log("✅ All cookie configurations cleared");
    console.log("=== LOGOUT REQUEST END ===");

    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  } catch (error) {
    console.error("💥 Logout error:", error);
    // Tetap return success karena logout harus selalu berhasil
    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  }
});

// Verify token endpoint
app.get("/api/auth/verify", authenticateToken, (req, res) => {
  try {
    console.log("=== TOKEN VERIFICATION START ===");
    console.log("Token from cookie:", req.cookies.token ? "Present" : "Missing");
    console.log("Token from header:", req.headers.authorization ? "Present" : "Missing");
    console.log("Decoded user:", req.user);

    // pastikan data user dikembalikan dengan benar
    const user = {
      id: req.user.userId || req.user.id, // konsisten dengan field
      userId: req.user.userId, // Tetap kirim userId untuk backward compatibility
      username: req.user.username,
      email: req.user.email,
    };

    console.log("✅ Token verification successful for user:", user.username);
    console.log("=== TOKEN VERIFICATION END ===");

    res.json({
      success: true,
      user: user,
      message: "Token verified successfully",
      authenticated: true // flag untuk frontend
    });
  } catch (error) {
    console.error("💥 Token verification error:", error);
    res.status(500).json({
      success: false,
      error: "Error verifying token",
      authenticated: false
    });
  }
});

// Function database coonection check
async function checkDatabaseConnection() {
  try {
    // tambahkan timeout untuk database connection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 10000);
    });

    const dbPromise = getInternationalChannels();

    await Promise.race([dbPromise, timeoutPromise]);
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Configuration endpoint to toggle dummy status
app.post("/api/config/tv-status-mode", async (req, res) => {
  try {
    const { useDummyStatus } = req.body;

    if (typeof useDummyStatus === "boolean") {
      TV_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;

      // Clear existing status to force refresh
      tvStatus.clear();

      // Restart status checks with new mode
      await checkAllTVsStatus();

      res.json({
        success: true,
        message: `TV status mode changed to ${useDummyStatus ? "dummy" : "real"
          } connectivity checks`,
        config: {
          useDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
          onlineProbability: TV_STATUS_CONFIG.ONLINE_PROBABILITY,
          responseTimeRange: TV_STATUS_CONFIG.RESPONSE_TIME_RANGE,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid parameter. useDummyStatus must be a boolean",
      });
    }
  } catch (error) {
    console.error("Error updating TV status mode:", error);
    res.status(500).json({
      success: false,
      message: "Error updating TV status mode",
      error: error.message,
    });
  }
});

// Get current configuration
app.get("/api/config", authenticateToken, async (req, res) => {
  res.json({
    success: true,
    data: {
      tvStatus: {
        useDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
        onlineProbability: TV_STATUS_CONFIG.ONLINE_PROBABILITY,
        responseTimeRange: TV_STATUS_CONFIG.RESPONSE_TIME_RANGE,
        updateInterval: TV_STATUS_CONFIG.UPDATE_INTERVAL,
      },
      chromecastStatus: {
        useDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
        onlineProbability: CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY,
        signalLevelRange: CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
        speedRange: CHROMECAST_STATUS_CONFIG.SPEED_RANGE,
        updateInterval: CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL,
      },
    },
  });
});

// Configuration endpoint to toggle Chromecast status mode
app.post("/api/config/chromecast-status-mode", async (req, res) => {
  try {
    const { useDummyStatus } = req.body;

    if (typeof useDummyStatus === "boolean") {
      CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;

      // Clear existing status to force refresh
      chromecastStatus.clear();

      // Restart status checks with new mode
      await checkAllChromecastsStatus();

      res.json({
        success: true,
        message: `Chromecast status mode changed to ${useDummyStatus ? "dummy" : "real"
          } connectivity checks`,
        config: {
          useDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
          onlineProbability: CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY,
          signalLevelRange: CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
          speedRange: CHROMECAST_STATUS_CONFIG.SPEED_RANGE,
          updateInterval: CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid parameter. useDummyStatus must be a boolean",
      });
    }
  } catch (error) {
    console.error("Error updating Chromecast status mode:", error);
    res.status(500).json({
      success: false,
      message: "Error updating Chromecast status mode",
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/api/health", authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "IPTV Monitoring API is running",
      timestamp: new Date().toISOString(),
      config: {
        tvDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
        chromecastDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
      },
      stats: networkStats
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      success: false,
      error: "Health check failed"
    });
  }
});

// Endpoint untuk check server status tanpa auth
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  // jangan gunakan catch-all route yang bermasalah
  if (res.headersSent) {
    return next(error);
  }

  // berikan response yang lebih informatif
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(isDevelopment && { details: error.message, stack: error.stack })
  });
});

// Periodic status checks - lebih robust
const startPeriodicChecks = () => {
  // Channel status checks
  if (typeof checkAllChannelsStatus === 'function') {
    setInterval(() => {
      checkAllChannelsStatus().catch(error => {
        console.error("Error in periodic channel status check:", error);
      });
    }, 1800000); // Every 30 minutes
  }

  // TV and Chromecast status checks
  if (typeof checkAllTVsStatus === 'function' && typeof checkAllChromecastsStatus === 'function') {
    setInterval(() => {
      if (TV_STATUS_CONFIG.USE_DUMMY_STATUS || CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
        Promise.all([
          checkAllTVsStatus().catch(error => {
            console.error("Error in TV status check:", error);
          }),
          checkAllChromecastsStatus().catch(error => {
            console.error("Error in Chromecast status check:", error);
          })
        ]);
      }
    }, Math.min(TV_STATUS_CONFIG.UPDATE_INTERVAL, CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL));
  }

  // Cleanup Telegram bot subscribers setiap 1 jam
  if (telegramBot) {
    setInterval(() => {
      try {
        telegramBot.cleanupSubscribers();
      } catch (error) {
        console.error("Error cleaning up Telegram subscribers:", error);
      }
    }, 3600000); // Every hour
  }
};


// Start server
app.listen(port, async () => {
  console.log(`🚀 Server starting on port ${port}`);

  // buat database connection check opsional
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.warn("⚠️  Database connection failed, but server will continue running");
    // JANGAN exit server jika database gagal connect
    // process.exit(1);
  }

  console.log("Starting initial status checks...");
  console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);

  // buat status checks opsional dan tidak crash server
  try {
    if (typeof checkAllChannelsStatus === 'function') {
      await checkAllChannelsStatus();
    }
    if (typeof checkAllTVsStatus === 'function') {
      await checkAllTVsStatus();
    }
    if (typeof checkAllChromecastsStatus === 'function') {
      await checkAllChromecastsStatus();
    }
    console.log("✅ Initial status checks completed");
  } catch (error) {
    console.error("⚠️  Error during initial status checks:", error);
    // JANGAN crash server jika status check gagal
  }
  setTimeout(startPeriodicChecks, 5000); // Start after 5 seconds
  console.log(`✅ Server is running on port ${port}`);
  ensureUploadsDirectory();
});

// Debugging endpoint to list all routes
app.get("/api/debug/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      });
    }
  });

  res.json({
    success: true,
    routes: routes,
    message: "Available routes",
  });
});

// Reset stats dashboard
setInterval(() => {
  Object.keys(networkStats).forEach(service => {
    networkStats[service].requests = 0;
    networkStats[service].lastReset = new Date();
  });
}, 3600000); // Reset every hour

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down server gracefully...");
  process.exit(0);
});

module.exports = app;
