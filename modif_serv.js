require('dotenv').config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const dgram = require("dgram");
const net = require("net");
const {
  getInternationalChannels,
  getLocalChannels,
  getHospitalityTVs,
  getHospitalityTVByRoomNo,
  getChromecastDevices,
  getChromecastDeviceById,
  createUser,
  authenticateUser,
} = require("./db");

const app = express();
const port = process.env.PORT || 3001;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET environment variable is required");
  process.exit(1);
}

// CORS Configuration
app.use(
  cors({
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
        console.log("CORS blocked origin:", origin); // Debug log
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 200,
    preflightContinue: false,
  })
);

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

  next();
});

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token =
    req.cookies.token ||
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({
      success: false,
      error: "Invalid token.",
    });
  }
};

// Store channel status in memory
const channelStatus = new Map();
// Store TV status in memory
const tvStatus = new Map();
// Store chromecast status in memory
const chromecastStatus = new Map();

// Configuration for TV status simulation
const TV_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  RESPONSE_TIME_RANGE: { min: 5, max: 150 }, // Response time in ms
  UPDATE_INTERVAL: 120000, // 2 minutes in milliseconds
};
// Configuration for Chromecast status simulation
const CHROMECAST_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  SIGNAL_LEVEL_RANGE: { min: -70, max: -20 }, // Signal strength in dBm
  SPEED_RANGE: { min: 10, max: 100 }, // Speed in Mbps
  RESPONSE_TIME_RANGE: { min: 10, max: 200 }, // Response time in ms
  UPDATE_INTERVAL: 120000, // 2 minutes in milliseconds
};

const networkStats = {
  channels: {
    requests: 0,
    totalRequests: 0,
    responseTime: 0,
    totalResponseTime: 0,
    errorCount: 0,
    throughput: 0,
    lastReset: new Date()
  },
  hospitality: {
    requests: 0,
    totalRequests: 0,
    responseTime: 0,
    totalResponseTime: 0,
    errorCount: 0,
    throughput: 0,
    lastReset: new Date()
  },
  chromecast: {
    requests: 0,
    totalRequests: 0,
    responseTime: 0,
    totalResponseTime: 0,
    errorCount: 0,
    throughput: 0,
    lastReset: new Date()
  }
};

// Middleware untuk tracking request metrics
const trackRequestMetrics = (serviceType) => {
  return (req, res, next) => {
    const startTime = Date.now();

    // Increment request count
    networkStats[serviceType].requests++;
    networkStats[serviceType].totalRequests++;

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      const responseTime = Date.now() - startTime;

      // Update response time
      networkStats[serviceType].totalResponseTime += responseTime;
      networkStats[serviceType].responseTime =
        networkStats[serviceType].totalResponseTime / networkStats[serviceType].totalRequests;

      // Track errors (status >= 400)
      if (res.statusCode >= 400) {
        networkStats[serviceType].errorCount++;
      }

      // Calculate throughput (requests per second)
      const timeDiff = (Date.now() - networkStats[serviceType].lastReset.getTime()) / 1000;
      networkStats[serviceType].throughput = networkStats[serviceType].requests / Math.max(timeDiff, 1);

      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("Login attempt:", { identifier: req.body.identifier });

    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Email/username and password are required",
      });
    }

    // Authenticate user
    const result = await authenticateUser(identifier, password);
    console.log("Authentication result:", {
      success: result.success,
      userId: result.user?.id,
    });

    if (result.success && result.user) {
      // Generate JWT token
      const token = jwt.sign(
        {
          userId: result.user.userId,
          email: result.user.email,
          username: result.user.username,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Set HTTP-only cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      console.log("Login successful for user:", result.user.username);

      res.json({
        success: true,
        user: {
          id: result.user.userId,
          username: result.user.username,
          email: result.user.email,
        },
        message: "Login successful",
      });
    } else {
      console.log("Login failed:", result.error);
      res.status(401).json({
        success: false,
        error: result.error || "Invalid credentials",
      });
    }
  } catch (error) {
    console.error("Login API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during login",
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

      // Set HTTP-only cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
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
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    console.log("User logged out successfully");

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Error during logout",
    });
  }
});

// Verify token endpoint
app.get("/api/auth/verify", authenticateToken, (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        userId: req.user.userId,
        username: req.user.username,
        email: req.user.email,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      success: false,
      error: "Error verifying token",
    });
  }
});

// Function database coonection check
async function checkDatabaseConnection() {
  try {
    const testChannel = await getInternationalChannels();
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Endpoint baru untuk network traffic stats
app.get("/api/network/traffic/stats", authenticateToken, async (req, res) => {
  try {
    const randomMetric = () => ({
      requests: Math.floor(Math.random() * 20) + 5,
      responseTime: Math.floor(Math.random() * 200) + 50,
      errorRate: parseFloat((Math.random() * 5).toFixed(2)),
      throughput: parseFloat((Math.random() * 5).toFixed(1)),
      totalRequests: Math.floor(Math.random() * 1000),
      errorCount: Math.floor(Math.random() * 50)
    });

    res.json({
      success: true,
      data: {
        channels: randomMetric(),
        hospitality: randomMetric(),
        chromecast: randomMetric(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating dummy stats",
      error: error.message
    });
  }
});


// Endpoint untuk historical data (simulasi berdasarkan time range)
app.get("/api/network/traffic/history", authenticateToken, async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const now = new Date();
    const data = [];

    let intervals, intervalMs, points;

    switch (timeRange) {
      case '1h':
        intervals = 60;
        intervalMs = 60000; // 1 minute intervals
        points = 60;
        break;
      case '6h':
        intervals = 72;
        intervalMs = 300000; // 5 minute intervals
        points = 72;
        break;
      case '24h':
        intervals = 48;
        intervalMs = 1800000; // 30 minute intervals
        points = 48;
        break;
      default:
        intervalMs = 60000;
        points = 60;
    }

    // This function formats the time based on the time range
    const pad2 = (n) => String(n).padStart(2, '0');

    const formatTime = (date, timeRange) => {
      const h = pad2(date.getHours());
      const m = pad2(date.getMinutes());
      if (timeRange === '24h') {
        const d = pad2(date.getDate());
        const mo = pad2(date.getMonth() + 1);
        return `${mo}/${d} ${h}:${m}`;
      }
      return `${h}:${m}`;
    };

    // Generate historical data based on current stats with some variation
    for (let i = points - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * intervalMs);
      const timeStr = formatTime(time, timeRange);

      data.push({
        time: timeStr,
        timestamp: time.toISOString(),
        channel: Math.floor(Math.random() * 20) + 5,
        hospitality: Math.floor(Math.random() * 15) + 3,
        chromecast: Math.floor(Math.random() * 10) + 2
      });
    }


    res.json({
      success: true,
      data: data,
      timeRange: timeRange
    });
  } catch (error) {
    console.error("Error fetching network traffic history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching network traffic history",
      error: error.message
    });
  }
});

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
  res.json({
    success: true,
    message: "IPTV Monitoring API is running",
    timestamp: new Date().toISOString(),
    config: {
      tvDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
      chromecastDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
    },
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
app.use("/{*splat}", (error, req, res, next) => {
  // Handle path-to-regexp errors
  if (error.message && error.message.includes("Missing parameter name")) {
    console.error("Route parameter error:", error.message);
    return res.status(400).json({
      success: false,
      error: "Invalid route parameter format",
    });
  }

  console.error("Unhandled error:", error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server
app.listen(port, async () => {
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error("Failed to connect to database. Exiting...");
    process.exit(1);
  }

  console.log("Starting initial status checks...");
  // console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  // console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);

  // Initialize status checks after server starts
  try {
    await checkAllChannelsStatus();
    await checkAllTVsStatus();
    await checkAllChromecastsStatus();
    console.log("Initial status checks completed");
  } catch (error) {
    console.error("Error during initial status checks:", error);
  }
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

// Periodic status checks
setInterval(checkAllChannelsStatus, 120000); // Every 2 minutes for channels
setInterval(() => {
  if (
    TV_STATUS_CONFIG.USE_DUMMY_STATUS ||
    CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS
  ) {
    checkAllTVsStatus();
    checkAllChromecastsStatus();
  }
}, Math.min(TV_STATUS_CONFIG.UPDATE_INTERVAL, CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL));
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
