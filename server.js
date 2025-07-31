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
const verifyRoute = require("./api/auth/verify/route");
const googleAuthRoute = require("./api/auth/google/route");
const googleCallbackRoute = require("./api/auth/google/callback/route");
const IPTVTelegramBot = require('./api/services/telegram/bot-tele');

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

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors(corsOptions));
app.use("/api/auth/verify", verifyRoute);
app.use("/api/auth/google", googleAuthRoute);
app.use("/api/auth/google/callback", googleCallbackRoute);

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
  UPDATE_INTERVAL: 1800000, // 30 minutes in milliseconds
};
// Configuration for Chromecast status simulation
const CHROMECAST_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  SIGNAL_LEVEL_RANGE: { min: -70, max: -20 }, // Signal strength in dBm
  SPEED_RANGE: { min: 10, max: 100 }, // Speed in Mbps
  RESPONSE_TIME_RANGE: { min: 10, max: 200 }, // Response time in ms
  UPDATE_INTERVAL: 1800000, // 30 minutes in milliseconds
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

// Helper untuk parsing user agent dan mendapatkan IP
const getUserInfo = (req) => {
  // Get real IP address (considering proxies)
  const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.headers['x-client-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.connection?.socket?.remoteAddress ||
           req.ip ||
           'Unknown';
  };

  // Parse User Agent untuk mendapatkan info browser dan device
  const parseUserAgent = (userAgent) => {
    if (!userAgent) return { browser: 'Unknown', device: 'Unknown', os: 'Unknown' };

    // Browser detection
    let browser = 'Unknown';
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Opera')) browser = 'Opera';

    // OS detection
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    // Device type detection
    let device = 'Desktop';
    if (userAgent.includes('Mobile')) device = 'Mobile';
    else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) device = 'Tablet';

    return { browser, device, os };
  };

  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const { browser, device, os } = parseUserAgent(userAgent);

  return {
    ip,
    browser,
    device,
    os,
    userAgent,
    timestamp: new Date().toISOString()
  };
};

// Function untuk inisialisasi Telegram bot
const initializeTelegramBot = () => {
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      telegramBot = new IPTVTelegramBot();
      console.log('✅ Telegram bot initialized successfully');
    } else {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN not found in environment variables');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error);
  }
};

// Inisialisasi bot Telegram di sini
let telegramBot = null;
initializeTelegramBot();

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("=== LOGIN REQUEST START ===");

    // Get user info
    const userInfo = getUserInfo(req);

    console.log("📍 Client Info:", {
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      os: userInfo.os,
      timestamp: userInfo.timestamp
    });

    console.log("🔍 User Agent:", userInfo.userAgent);

    console.log("📝 Request Details:", {
      identifier: req.body.identifier,
      passwordLength: req.body.password ? req.body.password.length : 0,
      headers: {
        origin: req.headers.origin,
        referer: req.headers.referer
      }
    });

    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      console.log(`❌ LOGIN FAILED - Missing credentials from IP: ${userInfo.ip} (${userInfo.browser} on ${userInfo.device})`);
      return res.status(400).json({
        success: false,
        error: "Email/username and password are required",
      });
    }

    // Authenticate user
    console.log("🔍 Authenticating user...");
    const result = await authenticateUser(identifier, password);

    if (result.success && result.user) {
      // Generate JWT token
      const tokenPayload = {
        userId: result.user.id || result.user.userId,
        email: result.user.email,
        username: result.user.username,
        iat: Math.floor(Date.now() / 1000)
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

      // Set cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/"
      };

      res.cookie("token", token, cookieOptions);

      const userResponse = {
        id: result.user.id || result.user.userId,
        username: result.user.username,
        email: result.user.email,
      };

      // Success logging dengan detail lengkap
      console.log("✅ LOGIN SUCCESS:", {
        username: userResponse.username,
        email: userResponse.email,
        ip: userInfo.ip,
        browser: userInfo.browser,
        device: userInfo.device,
        os: userInfo.os,
        timestamp: userInfo.timestamp,
        sessionDuration: "24h"
      });

      console.log("=== LOGIN REQUEST END ===");

      res.json({
        success: true,
        user: userResponse,
        message: "Login successful",
      });
    } else {
      // Failed login logging dengan detail
      console.log("❌ LOGIN FAILED:", {
        identifier: identifier,
        reason: result.error || "Invalid credentials",
        ip: userInfo.ip,
        browser: userInfo.browser,
        device: userInfo.device,
        os: userInfo.os,
        timestamp: userInfo.timestamp,
        userAgent: userInfo.userAgent
      });

      res.status(401).json({
        success: false,
        error: result.error || "Invalid credentials",
      });
    }
  } catch (error) {
    const userInfo = getUserInfo(req);
    console.error("💥 LOGIN ERROR:", {
      error: error.message,
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      timestamp: userInfo.timestamp
    });

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
    // Get user info
    const userInfo = getUserInfo(req);
    
    console.log("=== REGISTRATION REQUEST START ===");
    console.log("📍 Client Info:", {
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      os: userInfo.os,
      timestamp: userInfo.timestamp
    });
    
    console.log("📝 Registration attempt:", {
      username: req.body.username,
      email: req.body.email,
      userAgent: userInfo.userAgent
    });

    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      console.log(`❌ REGISTRATION FAILED - Missing fields from IP: ${userInfo.ip} (${userInfo.browser} on ${userInfo.device})`);
      return res.status(400).json({
        success: false,
        error: "Username, email, and password are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`❌ REGISTRATION FAILED - Invalid email format from IP: ${userInfo.ip}`);
      return res.status(400).json({
        success: false,
        error: "Please enter a valid email address",
      });
    }

    // Password validation
    if (password.length < 6) {
      console.log(`❌ REGISTRATION FAILED - Weak password from IP: ${userInfo.ip}`);
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      });
    }

    // Username validation
    if (username.length < 3) {
      console.log(`❌ REGISTRATION FAILED - Short username from IP: ${userInfo.ip}`);
      return res.status(400).json({
        success: false,
        error: "Username must be at least 3 characters long",
      });
    }

    // Create user
    const result = await createUser({ username, email, password });
    
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
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      // Success logging dengan detail lengkap
      console.log("✅ REGISTRATION SUCCESS:", {
        userId: result.userId,
        username: username,
        email: email,
        ip: userInfo.ip,
        browser: userInfo.browser,
        device: userInfo.device,
        os: userInfo.os,
        timestamp: userInfo.timestamp,
        autoLogin: true
      });

      console.log("=== REGISTRATION REQUEST END ===");

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
      // Failed registration logging
      console.log("❌ REGISTRATION FAILED:", {
        username: username,
        email: email,
        reason: result.error || "Failed to create account",
        ip: userInfo.ip,
        browser: userInfo.browser,
        device: userInfo.device,
        os: userInfo.os,
        timestamp: userInfo.timestamp
      });
      
      res.status(400).json({
        success: false,
        error: result.error || "Failed to create account",
      });
    }
  } catch (error) {
    const userInfo = getUserInfo(req);
    console.error("💥 REGISTRATION ERROR:", {
      error: error.message,
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      timestamp: userInfo.timestamp
    });
    
    res.status(500).json({
      success: false,
      error: "Internal server error during registration",
    });
  }
});

// Logout endpoint
app.post("/api/auth/logout", (req, res) => {
  try {
    const userInfo = getUserInfo(req);
    
    console.log("=== LOGOUT REQUEST START ===");
    console.log("📍 Logout from:", {
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      os: userInfo.os,
      timestamp: userInfo.timestamp
    });

    // Clear cookie dengan berbagai konfigurasi
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
        path: "/",
      }
    ];

    cookieConfigs.forEach(config => {
      res.clearCookie("token", config);
    });

    console.log("✅ LOGOUT SUCCESS:", {
      ip: userInfo.ip,
      browser: userInfo.browser,
      device: userInfo.device,
      timestamp: userInfo.timestamp
    });
    
    console.log("=== LOGOUT REQUEST END ===");

    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  } catch (error) {
    const userInfo = getUserInfo(req);
    console.error("💥 LOGOUT ERROR:", {
      error: error.message,
      ip: userInfo.ip,
      timestamp: userInfo.timestamp
    });
    
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

// Function to check multicast connectivity
async function checkMulticastConnectivity(
  ipAddress,
  port = 3001,
  timeout = 5000
) {
  return new Promise((resolve) => {
    const client = dgram.createSocket("udp4");
    let isResolved = false;

    // Set timeout
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        client.close();
        resolve({
          status: "offline",
          responseTime: null,
          error: "Connection timeout",
        });
      }
    }, timeout);

    const startTime = Date.now();

    try {
      // Try to bind to the multicast address
      client.bind(port, () => {
        try {
          client.addMembership(ipAddress);

          // If we get here, the multicast group is accessible
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            const responseTime = Date.now() - startTime;
            client.close();
            resolve({
              status: "online",
              responseTime: responseTime,
              error: null,
            });
          }
        } catch (membershipError) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            client.close();
            resolve({
              status: "offline",
              responseTime: null,
              error: membershipError.message,
            });
          }
        }
      });
    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        client.close();
        resolve({
          status: "offline",
          responseTime: null,
          error: error.message,
        });
      }
    }

    client.on("error", (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        client.close();
        resolve({
          status: "offline",
          responseTime: null,
          error: error.message,
        });
      }
    });
  });
}

// Function to generate dummy TV status
function generateDummyTVStatus() {
  const isOnline = Math.random() < TV_STATUS_CONFIG.ONLINE_PROBABILITY;
  const responseTime = isOnline
    ? Math.floor(
      Math.random() *
      (TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.max -
        TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.min +
        1)
    ) + TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.min
    : null;

  return {
    status: isOnline ? "online" : "offline",
    responseTime,
    error: isOnline ? null : "Device unreachable",
  };
}

// Function to check TV device connectivity
async function checkTVConnectivity(ipAddress, timeout = 5000) {
  // Use dummy status if configured
  if (TV_STATUS_CONFIG.USE_DUMMY_STATUS) {
    // Add small delay to simulate network checking
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 500 + 200)
    );
    return generateDummyTVStatus();
  }

  // Original real connectivity check
  return new Promise((resolve) => {
    const startTime = Date.now();

    // Create a simple TCP connection test
    const socket = new net.Socket();
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({
          status: "offline",
          responseTime: null,
          error: "Connection timeout",
        });
      }
    }, timeout);

    socket.connect(80, ipAddress, () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({
          status: "online",
          responseTime: responseTime,
          error: null,
        });
      }
    });

    socket.on("error", (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({
          status: "offline",
          responseTime: null,
          error: error.message,
        });
      }
    });
  });
}

// Function to get all channels from database
async function getAllChannelsFromDB() {
  try {
    const [internationalChannels, localChannels] = await Promise.all([
      getInternationalChannels(),
      getLocalChannels(),
    ]);

    return [...internationalChannels, ...localChannels];
  } catch (error) {
    console.error("Error fetching channels from database:", error);
    return [];
  }
}

// Function to check all channels status
async function checkAllChannelsStatus() {
  try {
    const allChannels = await getAllChannelsFromDB();
    const offlineNotifications = [];

    for (const channel of allChannels) {
      try {
        const previousStatus = channelStatus.get(channel.id)?.status;
        const result = await checkMulticastConnectivity(channel.ipMulticast);

        channelStatus.set(channel.id, {
          ...result,
          lastChecked: new Date().toISOString(),
        });

        // Kirim notifikasi hanya jika status berubah dari online ke offline
        if (previousStatus === "online" && result.status === "offline") {
          offlineNotifications.push({
            source: 'channel',
            message: `${channel.channelName || 'Unknown Channel'} is now offline`,
            ipAddr: channel.ipMulticast,
            deviceName: channel.channelName,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        const previousStatus = channelStatus.get(channel.id)?.status;

        channelStatus.set(channel.id, {
          status: "offline",
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString(),
        });

        // Kirim notifikasi jika status berubah ke offline
        if (previousStatus === "online") {
          offlineNotifications.push({
            source: 'channel',
            message: `${channel.channelName || 'Unknown Channel'} connection failed`,
            ipAddr: channel.ipMulticast,
            deviceName: channel.channelName,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Kirim notifikasi Telegram jika ada perangkat offline
    if (offlineNotifications.length > 0 && telegramBot) {
      await telegramBot.sendOfflineNotification(offlineNotifications);
    }

    console.log(`Checked status for ${allChannels.length} channels`);
  } catch (error) {
    console.error("Error checking channels status:", error);
  }
}

// Function to check all TV devices status
async function checkAllTVsStatus() {
  try {
    const allTVs = await getHospitalityTVs();
    const offlineNotifications = [];

    for (const tv of allTVs) {
      try {
        const previousStatus = tvStatus.get(tv.roomNo)?.status;
        const result = await checkTVConnectivity(tv.ipAddress);

        tvStatus.set(tv.roomNo, {
          ...result,
          lastChecked: new Date().toISOString(),
        });

        // Kirim notifikasi jika status berubah dari online ke offline
        if (previousStatus === "online" && result.status === "offline") {
          offlineNotifications.push({
            source: 'tv',
            message: `Room ${tv.roomNo} TV is now offline`,
            ipAddr: tv.ipAddress,
            deviceName: `Room ${tv.roomNo}`,
            roomNo: tv.roomNo,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        const previousStatus = tvStatus.get(tv.roomNo)?.status;

        tvStatus.set(tv.roomNo, {
          status: "offline",
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString(),
        });

        if (previousStatus === "online") {
          offlineNotifications.push({
            source: 'tv',
            message: `Room ${tv.roomNo} TV connection failed`,
            ipAddr: tv.ipAddress,
            deviceName: `Room ${tv.roomNo}`,
            roomNo: tv.roomNo,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Kirim notifikasi Telegram
    if (offlineNotifications.length > 0 && telegramBot) {
      await telegramBot.sendOfflineNotification(offlineNotifications);
    }

    console.log(
      `Checked status for ${allTVs.length} TV devices${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? " (using dummy status)" : ""}`
    );
  } catch (error) {
    console.error("Error checking TV status:", error);
  }
}

// Function to generate dummy Chromecast status
function generateDummyChromecastStatus() {
  const isOnline = Math.random() < CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY;
  const isPingable = isOnline; // Fixed: Added missing variable
  const signalLevel = isOnline
    ? Math.floor(
      Math.random() *
      (CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.max -
        CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min +
        1)
    ) + CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min
    : null;
  const speed = isOnline
    ? Math.floor(
      Math.random() *
      (CHROMECAST_STATUS_CONFIG.SPEED_RANGE.max -
        CHROMECAST_STATUS_CONFIG.SPEED_RANGE.min +
        1)
    ) + CHROMECAST_STATUS_CONFIG.SPEED_RANGE.min
    : null;
  const responseTime = isOnline
    ? Math.floor(
      Math.random() *
      (CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.max -
        CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.min +
        1)
    ) + CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.min
    : null;

  return {
    isPingable,
    isOnline,
    signalLevel,
    speed,
    responseTime,
    lastSeen: isOnline ? new Date().toISOString() : null,
    error: isOnline ? null : "Device unreachable",
  };
}

// Function to check Chromecast device connectivity
async function checkChromecastConnectivity(ipAddr, timeout = 5000) {
  // Use dummy status if configured
  if (CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
    // Add small delay to simulate network checking
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 1000 + 500)
    );
    return generateDummyChromecastStatus();
  }

  // Real connectivity check (simplified version)
  return new Promise((resolve) => {
    const startTime = Date.now();

    // Simple TCP connection test
    const socket = new net.Socket();
    const timeout_id = setTimeout(() => {
      socket.destroy();
      resolve({
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: "Connection timeout",
      });
    }, timeout);

    socket.connect(8008, ipAddr, () => {
      clearTimeout(timeout_id);
      const responseTime = Date.now() - startTime;
      socket.destroy();

      resolve({
        isPingable: true,
        isOnline: true,
        signalLevel: Math.floor(Math.random() * 60) - 80, // Simulated signal
        speed: Math.floor(Math.random() * 90) + 10, // Simulated speed
        responseTime: responseTime,
        lastSeen: new Date().toISOString(),
        error: null,
      });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout_id);
      resolve({
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: err.message,
      });
    });
  });
}

// Function to check all Chromecast devices status
async function checkAllChromecastsStatus() {
  try {
    const allDevices = await getChromecastDevices();
    const offlineNotifications = [];

    for (const device of allDevices) {
      try {
        const previousStatus = chromecastStatus.get(device.idCast)?.isOnline;
        const result = await checkChromecastConnectivity(device.ipAddr);

        chromecastStatus.set(device.idCast, {
          ...result,
          lastChecked: new Date().toISOString(),
        });

        // Kirim notifikasi jika status berubah dari online ke offline
        if (previousStatus === true && !result.isOnline) {
          offlineNotifications.push({
            source: 'chromecast',
            message: `${device.deviceName || 'Unknown Device'} is now offline`,
            ipAddr: device.ipAddr,
            deviceName: device.deviceName,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        const previousStatus = chromecastStatus.get(device.idCast)?.isOnline;

        chromecastStatus.set(device.idCast, {
          isPingable: false,
          isOnline: false,
          signalLevel: null,
          speed: null,
          responseTime: null,
          lastSeen: null,
          error: error.message,
          lastChecked: new Date().toISOString(),
        });

        if (previousStatus === true) {
          offlineNotifications.push({
            source: 'chromecast',
            message: `${device.deviceName || 'Unknown Device'} connection failed`,
            ipAddr: device.ipAddr,
            deviceName: device.deviceName,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Kirim notifikasi Telegram
    if (offlineNotifications.length > 0 && telegramBot) {
      await telegramBot.sendOfflineNotification(offlineNotifications);
    }

    console.log(
      `Checked status for ${allDevices.length} Chromecast devices${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? " (using dummy status)" : ""}`
    );
  } catch (error) {
    console.error("Error checking Chromecast status:", error);
  }
}

// API Routes for Channels

// Get all channels with status
app.get("/api/channels", trackRequestMetrics('channels'), authenticateToken, async (req, res) => {
  try {
    const { type, sortBy, sortOrder } = req.query;

    let channels = [];

    if (type === "international") {
      channels = await getInternationalChannels();
    } else if (type === "local") {
      channels = await getLocalChannels();
    } else {
      channels = await getAllChannelsFromDB();
    }

    // Add status information to channels
    const channelsWithStatus = channels.map((channel) => {
      const status = channelStatus.get(channel.id) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
      };

      // Determine channel type based on collection or add type field in your database
      let channelType = "unknown";
      if (type === "international") {
        channelType = "international";
      } else if (type === "local") {
        channelType = "local";
      } else {
        // If no specific type requested, determine from database or use a field
        channelType = channel.type || "unknown";
      }

      return {
        ...channel,
        ...status,
        type: channelType,
      };
    });

    // Sorting
    if (sortBy) {
      channelsWithStatus.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle different data types
        if (typeof aValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (sortOrder === "desc") {
          return bValue > aValue ? 1 : -1;
        } else {
          return aValue > bValue ? 1 : -1;
        }
      });
    }

    const internationalChannels = await getInternationalChannels();
    const localChannels = await getLocalChannels();

    res.json({
      success: true,
      data: channelsWithStatus,
      totalCount: channelsWithStatus.length,
      internationalCount: internationalChannels.length,
      localCount: localChannels.length,
      onlineCount: channelsWithStatus.filter((c) => c.status === "online")
        .length,
    });
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channels",
      error: error.message,
    });
  }
});

// Get channel by ID
app.get("/api/channels/:id", authenticateToken, async (req, res) => {
  try {
    const channelId = req.params.id;

    // Validasi parameter ID
    if (!channelId || isNaN(parseInt(channelId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel ID. Must be a valid number.",
      });
    }
    // Fetch all channels from the database
    const parsedChannelId = parseInt(channelId);
    const allChannels = await getAllChannelsFromDB();
    const channel = allChannels.find((c) => c.id === parsedChannelId);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const status = channelStatus.get(parsedChannelId) || {
      status: "offline",
      responseTime: null,
      lastChecked: null,
      error: "Not checked",
    };

    // Determine channel type
    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(
      (c) => c.id === parsedChannelId
    )
      ? "international"
      : "local";

    res.json({
      success: true,
      data: {
        ...channel,
        ...status,
        type: channelType,
      },
    });
  } catch (error) {
    console.error("Error fetching channel:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channel",
      error: error.message,
    });
  }
});

// Check specific channel status
app.post("/api/channels/:id/check", authenticateToken, async (req, res) => {
  try {
    const channelId = req.params.id;

    // Validasi parameter ID
    if (!channelId || isNaN(parseInt(channelId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel ID. Must be a valid number.",
      });
    }

    const parsedChannelId = parseInt(channelId);
    const allChannels = await getAllChannelsFromDB();
    const channel = allChannels.find((c) => c.id === parsedChannelId);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const result = await checkMulticastConnectivity(channel.ipMulticast);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    channelStatus.set(parsedChannelId, statusInfo);

    // Determine channel type
    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(
      (c) => c.id === parsedChannelId
    )
      ? "international"
      : "local";

    res.json({
      success: true,
      data: {
        ...channel,
        ...statusInfo,
        type: channelType,
      },
    });
  } catch (error) {
    console.error("Error checking channel status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking channel status",
      error: error.message,
    });
  }
});

// Get channel dashboard stats
app.get(
  "/api/channels/dashboard/stats", trackRequestMetrics('channels'),
  authenticateToken,
  async (req, res) => {
    try {
      const allChannels = await getAllChannelsFromDB();
      const internationalChannels = await getInternationalChannels();
      const localChannels = await getLocalChannels();

      const totalChannels = allChannels.length;
      const onlineChannels = Array.from(channelStatus.values()).filter(
        (s) => s.status === "online"
      ).length;
      const offlineChannels = totalChannels - onlineChannels;

      // Calculate uptime percentage
      const uptime =
        totalChannels > 0
          ? ((onlineChannels / totalChannels) * 100).toFixed(1)
          : "0.0";

      // Category stats
      const categoryStats = {};
      allChannels.forEach((channel) => {
        if (!categoryStats[channel.category]) {
          categoryStats[channel.category] = { total: 0, online: 0, offline: 0 };
        }
        categoryStats[channel.category].total++;

        const status = channelStatus.get(channel.id);
        if (status && status.status === "online") {
          categoryStats[channel.category].online++;
        } else {
          categoryStats[channel.category].offline++;
        }
      });

      res.json({
        success: true,
        data: {
          totalChannels,
          onlineChannels,
          offlineChannels,
          uptime,
          categoryStats,
          lastUpdated: new Date().toISOString(),
          internationalChannels: internationalChannels.length,
          localChannels: localChannels.length,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard stats",
        error: error.message,
      });
    }
  }
);

// API Routes for TV Hospitality

// Get all hospitality TVs with status
app.get("/api/hospitality/tvs", trackRequestMetrics('hospitality'), authenticateToken, async (req, res) => {
  try {
    const { status, search, sortBy = "roomNo", sortOrder = "asc" } = req.query;

    let tvs = await getHospitalityTVs();

    // Add status information to TVs
    const tvsWithStatus = tvs.map((tv) => {
      const deviceStatus = tvStatus.get(tv.roomNo) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
      };

      return {
        ...tv,
        ...deviceStatus,
        model: tv.model || "Samsung Hospitality",
      };
    });

    // Filter by status
    let filteredTVs = tvsWithStatus;
    if (status && status !== "all") {
      filteredTVs = tvsWithStatus.filter((tv) => tv.status === status);
    }

    // Filter by search (room number or IP address)
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredTVs = filteredTVs.filter(
        (tv) =>
          tv.roomNo.toString().toLowerCase().includes(searchTerm) ||
          tv.ipAddress.toLowerCase().includes(searchTerm)
      );
    }

    // Sorting
    filteredTVs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Special handling for room number sorting
      if (sortBy === "roomNo") {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      } else if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === "desc") {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    res.json({
      success: true,
      data: filteredTVs,
      totalCount: filteredTVs.length,
      onlineCount: filteredTVs.filter((tv) => tv.status === "online").length,
      offlineCount: filteredTVs.filter((tv) => tv.status === "offline").length,
    });
  } catch (error) {
    console.error("Error fetching hospitality TVs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching hospitality TVs",
      error: error.message,
    });
  }
});

// Get specific TV by room number
app.get("/api/hospitality/tvs/:roomNo", authenticateToken, async (req, res) => {
  try {
    const roomNo = req.params.roomNo;

    // Validasi parameter roomNo
    if (!roomNo || roomNo.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Invalid room number.",
      });
    }

    const tv = await getHospitalityTVByRoomNo(roomNo);

    if (!tv) {
      return res.status(404).json({
        success: false,
        message: "TV not found",
      });
    }

    const deviceStatus = tvStatus.get(roomNo) || {
      status: "offline",
      responseTime: null,
      lastChecked: null,
      error: "Not checked",
    };

    res.json({
      success: true,
      data: {
        ...tv,
        ...deviceStatus,
        model: tv.model || "Samsung Hospitality",
      },
    });
  } catch (error) {
    console.error("Error fetching TV:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching TV",
      error: error.message,
    });
  }
});

// Check specific TV status
app.post(
  "/api/hospitality/tvs/:roomNo/check",
  authenticateToken,
  async (req, res) => {
    try {
      const roomNo = req.params.roomNo;

      // Validasi parameter roomNo
      if (!roomNo || roomNo.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Invalid room number.",
        });
      }

      const tv = await getHospitalityTVByRoomNo(roomNo);

      if (!tv) {
        return res.status(404).json({
          success: false,
          message: "TV not found",
        });
      }

      const result = await checkTVConnectivity(tv.ipAddress);
      const statusInfo = {
        ...result,
        lastChecked: new Date().toISOString(),
      };

      tvStatus.set(roomNo, statusInfo);

      res.json({
        success: true,
        data: {
          ...tv,
          ...statusInfo,
          model: tv.model || "Samsung Hospitality",
        },
      });
    } catch (error) {
      console.error("Error checking TV status:", error);
      res.status(500).json({
        success: false,
        message: "Error checking TV status",
        error: error.message,
      });
    }
  }
);

// Bulk check all TVs status
app.post("/api/hospitality/tvs/check-all", async (req, res) => {
  try {
    await checkAllTVsStatus();

    const allTVs = await getHospitalityTVs();

    const tvsWithStatus = allTVs.map((tv) => {
      const deviceStatus = tvStatus.get(tv.roomNo) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
      };

      return {
        ...tv,
        ...deviceStatus,
        model: tv.model || "Samsung Hospitality",
      };
    });

    res.json({
      success: true,
      message: "All TVs status checked",
      data: tvsWithStatus,
      totalCount: tvsWithStatus.length,
      onlineCount: tvsWithStatus.filter((tv) => tv.status === "online").length,
      offlineCount: tvsWithStatus.filter((tv) => tv.status === "offline")
        .length,
    });
  } catch (error) {
    console.error("Error checking all TVs status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking all TVs status",
      error: error.message,
    });
  }
});

// Get hospitality dashboard stats
app.get(
  "/api/hospitality/dashboard/stats", trackRequestMetrics('hospitality'),
  authenticateToken,
  async (req, res) => {
    try {
      const allTVs = await getHospitalityTVs();

      const totalTVs = allTVs.length;
      const onlineTVs = Array.from(tvStatus.values()).filter(
        (s) => s.status === "online"
      ).length;
      const offlineTVs = totalTVs - onlineTVs;

      // Calculate uptime percentage
      const uptime =
        totalTVs > 0 ? ((onlineTVs / totalTVs) * 100).toFixed(1) : "0.0";

      // Floor stats (based on room number patterns)
      const floorStats = {};
      allTVs.forEach((tv) => {
        const floor = Math.floor(parseInt(tv.roomNo) / 100);
        if (!floorStats[floor]) {
          floorStats[floor] = { total: 0, online: 0, offline: 0 };
        }
        floorStats[floor].total++;

        const status = tvStatus.get(tv.roomNo);
        if (status && status.status === "online") {
          floorStats[floor].online++;
        } else {
          floorStats[floor].offline++;
        }
      });

      res.json({
        success: true,
        data: {
          totalTVs,
          onlineTVs,
          offlineTVs,
          uptime,
          floorStats,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error fetching hospitality dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching hospitality dashboard stats",
        error: error.message,
      });
    }
  }
);

// API Routes for Chromecast

// Get all Chromecast devices with status
app.get("/api/chromecast", trackRequestMetrics('chromecast'), authenticateToken, async (req, res) => {
  try {
    const {
      status,
      search,
      sortBy = "deviceName",
      sortOrder = "asc",
    } = req.query;

    let devices = await getChromecastDevices();

    // Add status information to devices
    const devicesWithStatus = devices.map((device) => {
      const deviceStatus = chromecastStatus.get(device.idCast) || {
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: "Not checked",
        lastChecked: null,
      };

      return {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || "Google Chromecast",
      };
    });

    // Filter by status
    let filteredDevices = devicesWithStatus;
    if (status && status !== "all") {
      if (status === "online") {
        filteredDevices = devicesWithStatus.filter((device) => device.isOnline);
      } else if (status === "offline") {
        filteredDevices = devicesWithStatus.filter(
          (device) => !device.isOnline
        );
      }
    }

    // Filter by search (device name or IP address)
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredDevices = filteredDevices.filter(
        (device) =>
          (device.deviceName &&
            device.deviceName.toLowerCase().includes(searchTerm)) ||
          (device.ipAddr && device.ipAddr.toLowerCase().includes(searchTerm))
      );
    }

    // Sorting
    filteredDevices.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === "desc") {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    res.json({
      success: true,
      data: filteredDevices,
      totalCount: filteredDevices.length,
      onlineCount: filteredDevices.filter((d) => d.isOnline).length, // Fixed: use isOnline instead of online
      offlineCount: filteredDevices.filter((d) => !d.isOnline).length, // Fixed: use isOnline instead of online
    });
  } catch (error) {
    console.error("Error fetching Chromecast devices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Chromecast devices",
      error: error.message,
    });
  }
});

// Get specific Chromecast device
app.get("/api/chromecast/:id", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.id;

    // Validasi parameter ID yang lebih ketat
    if (!deviceId || deviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    // Validasi format ID - harus ObjectId (24 karakter) atau numeric
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(deviceId);
    const isValidNumeric = /^\d+$/.test(deviceId);

    if (!isValidObjectId && !isValidNumeric) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid device ID format. Must be a valid ObjectId (24 hex characters) or numeric ID.",
      });
    }

    const device = await getChromecastDeviceById(deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Chromecast device not found",
      });
    }

    const deviceStatus = chromecastStatus.get(device.idCast) || {
      isPingable: false,
      isOnline: false,
      signalLevel: null,
      speed: null,
      responseTime: null,
      lastSeen: null,
      error: "Not checked",
      lastChecked: null,
    };

    res.json({
      success: true,
      data: {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || "Google Chromecast",
      },
    });
  } catch (error) {
    console.error("Error fetching Chromecast device:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Chromecast device",
      error: error.message,
    });
  }
});

// Check specific Chromecast device status
app.post("/api/chromecast/:id/check", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.id;

    // Validasi parameter ID yang lebih ketat
    if (!deviceId || deviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    // Validasi format ID
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(deviceId);
    const isValidNumeric = /^\d+$/.test(deviceId);

    if (!isValidObjectId && !isValidNumeric) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid device ID format. Must be a valid ObjectId (24 hex characters) or numeric ID.",
      });
    }

    const device = await getChromecastDeviceById(deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Chromecast device not found",
      });
    }

    const result = await checkChromecastConnectivity(device.ipAddr);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    chromecastStatus.set(device.idCast, statusInfo);

    res.json({
      success: true,
      data: {
        ...device,
        ...statusInfo,
        id: device.idCast,
        type: device.type,
        model: device.model || "Google Chromecast",
      },
    });
  } catch (error) {
    console.error("Error checking Chromecast device status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking Chromecast device status",
      error: error.message,
    });
  }
});

// Bulk check all Chromecast devices status
app.post("/api/chromecast/check-all", async (req, res) => {
  try {
    await checkAllChromecastsStatus();

    const allDevices = await getChromecastDevices();

    const devicesWithStatus = allDevices.map((device) => {
      const deviceStatus = chromecastStatus.get(device.idCast) || {
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: "Not checked",
        lastChecked: null,
      };

      return {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || "Google Chromecast",
      };
    });

    res.json({
      success: true,
      message: "All Chromecast devices status checked",
      data: devicesWithStatus,
      totalCount: devicesWithStatus.length,
      onlineCount: devicesWithStatus.filter((d) => d.isOnline).length, // Fixed: use isOnline
      offlineCount: devicesWithStatus.filter((d) => !d.isOnline).length, // Fixed: use isOnline
    });
  } catch (error) {
    console.error("Error checking all Chromecast devices status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking all Chromecast devices status",
      error: error.message,
    });
  }
});

// Get Chromecast dashboard stats
app.get(
  "/api/chromecast/dashboard/stats", trackRequestMetrics('chromecast'),
  authenticateToken,
  async (req, res) => {
    try {
      const allDevices = await getChromecastDevices();

      const totalDevices = allDevices.length;
      const onlineDevices = Array.from(chromecastStatus.values()).filter(
        (s) => s.isOnline
      ).length;
      const offlineDevices = totalDevices - onlineDevices;

      // Calculate uptime percentage
      const uptime =
        totalDevices > 0
          ? ((onlineDevices / totalDevices) * 100).toFixed(1)
          : "0.0";

      // Type stats
      const typeStats = {};
      allDevices.forEach((device) => {
        const type = device.type || "Unknown";
        if (!typeStats[type]) {
          typeStats[type] = { total: 0, online: 0, offline: 0 };
        }
        typeStats[type].total++;

        const status = chromecastStatus.get(device.idCast);
        if (status && status.isOnline) {
          typeStats[type].online++;
        } else {
          typeStats[type].offline++;
        }
      });

      // Average signal level and speed
      const onlineStatusList = Array.from(chromecastStatus.values()).filter(
        (s) => s.isOnline
      );
      const avgSignalLevel =
        onlineStatusList.length > 0
          ? (
            onlineStatusList.reduce(
              (sum, s) => sum + (s.signalLevel || 0),
              0
            ) / onlineStatusList.length
          ).toFixed(1)
          : null;
      const avgSpeed =
        onlineStatusList.length > 0
          ? (
            onlineStatusList.reduce((sum, s) => sum + (s.speed || 0), 0) /
            onlineStatusList.length
          ).toFixed(1)
          : null;

      res.json({
        success: true,
        data: {
          totalDevices,
          onlineDevices,
          offlineDevices,
          uptime,
          typeStats,
          avgSignalLevel,
          avgSpeed,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error fetching Chromecast dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Chromecast dashboard stats",
        error: error.message,
      });
    }
  }
);

/* Manajemen Bot Telegram */
app.get("/api/telegram/status", authenticateToken, (req, res) => {
  try {
    if (!telegramBot) {
      return res.json({
        success: false,
        message: "Telegram bot not initialized",
        isRunning: false
      });
    }

    const subscribers = telegramBot.getActiveSubscribers();

    res.json({
      success: true,
      isRunning: true,
      subscriberCount: subscribers.length,
      subscribers: subscribers.map(sub => ({
        chatId: sub.chatId,
        userName: sub.userName,
        active: sub.active,
        pausedUntil: sub.pausedUntil
      })),
      message: "Telegram bot is running"
    });
  } catch (error) {
    console.error("Error getting Telegram bot status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get bot status"
    });
  }
});

// Endpoint untuk mengirim notifikasi manual (untuk testing)
app.post("/api/telegram/test-notification", authenticateToken, async (req, res) => {
  try {
    if (!telegramBot) {
      return res.status(400).json({
        success: false,
        message: "Telegram bot not initialized"
      });
    }

    const testNotifications = [{
      source: 'system',
      message: 'This is a test notification from IPTV Monitor',
      timestamp: new Date().toISOString()
    }];

    await telegramBot.sendOfflineNotification(testNotifications);

    res.json({
      success: true,
      message: "Test notification sent to all active subscribers"
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send test notification"
    });
  }
});

// Add after other API routes, before the 404 handler
// Special endpoints for Telegram bot (no auth required, internal use only)
app.get("/api/internal/channels", async (req, res) => {
  try {
    // Validate request is from internal source (optional security check)
    const userAgent = req.get('User-Agent');
    if (!userAgent || !userAgent.includes('node')) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const channels = await getAllChannelsFromDB();
    const channelsWithStatus = channels.map((channel) => {
      const status = channelStatus.get(channel.id) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
      };
      return { ...channel, ...status };
    });

    res.json({
      success: true,
      data: channelsWithStatus
    });
  } catch (error) {
    console.error("Error fetching channels for bot:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channels",
      error: error.message,
    });
  }
});

app.get("/api/internal/chromecast", async (req, res) => {
  try {
    const userAgent = req.get('User-Agent');
    if (!userAgent || !userAgent.includes('node')) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const devices = await getChromecastDevices();
    const devicesWithStatus = devices.map((device) => {
      const deviceStatus = chromecastStatus.get(device.idCast) || {
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: "Not checked",
        lastChecked: null,
      };
      return { ...device, ...deviceStatus };
    });

    res.json({
      success: true,
      data: devicesWithStatus
    });
  } catch (error) {
    console.error("Error fetching chromecast for bot:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching chromecast devices",
      error: error.message,
    });
  }
});

app.get("/api/internal/hospitality/tvs", async (req, res) => {
  try {
    const userAgent = req.get('User-Agent');
    if (!userAgent || !userAgent.includes('node')) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const tvs = await getHospitalityTVs();
    const tvsWithStatus = tvs.map((tv) => {
      const deviceStatus = tvStatus.get(tv.roomNo) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
      };
      return { ...tv, ...deviceStatus };
    });

    res.json({
      success: true,
      data: tvsWithStatus
    });
  } catch (error) {
    console.error("Error fetching TVs for bot:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching hospitality TVs",
      error: error.message,
    });
  }
});

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
