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

    // Authenticate user dengan timeout
    const authPromise = authenticateUser(identifier, password);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Authentication timeout')), 10000); // 10 detik timeout
    });

    const result = await Promise.race([authPromise, timeoutPromise]);
    
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
          userId: result.user.userId, // Pastikan menggunakan userId
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

    // Create user dengan timeout
    const createUserPromise = createUser({ username, email, password });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('User creation timeout')), 10000); // 10 detik timeout
    });

    const result = await Promise.race([createUserPromise, timeoutPromise]);
    
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
          userId: result.userId, // Pastikan menggunakan userId
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

// Start server
app.listen(port, async () => {
  console.log(`Server starting on port ${port}...`);

  try {
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.error("Failed to connect to database. Server will continue but authentication may not work.");
      // Jangan exit server, biarkan tetap berjalan untuk debugging
    }

    console.log("Starting initial status checks...");
    // console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
    // console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);

    // Initialize status checks after server starts
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
      console.log("Initial status checks completed");
    } catch (statusError) {
      console.error("Error during initial status checks:", statusError);
      // Jangan stop server karena status checks gagal
    }

    console.log(`Server successfully started on port ${port}`);
  } catch (error) {
    console.error("Error during server startup:", error);
    // Server tetap berjalan untuk debugging
  }
});