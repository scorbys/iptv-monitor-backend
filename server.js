require('dotenv').config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const dgram = require("dgram");
const net = require("net");
const path = require("path");
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

// Static files middleware untuk serve uploaded files
app.use('/api/uploads', express.static(path.join(process.cwd(), 'public/uploads'), {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
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
  }
}));

app.use('/api/uploads', (req, res, next) => {
  // Jika file tidak ditemukan oleh static middleware
  res.status(404).json({
    success: false,
    error: 'File not found'
  });
});

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

  // Tambahan data realistis
  const signalLevel = isOnline ? Math.floor(Math.random() * 30) + 70 : null; // 70-100%
  const model = ["Samsung Hospitality", "LG Commercial", "Sony Professional"][Math.floor(Math.random() * 3)];

  return {
    status: isOnline ? "online" : "offline",
    responseTime,
    error: isOnline ? null : ["Device unreachable", "Network timeout", "Connection refused"][Math.floor(Math.random() * 3)],
    signalLevel,
    model,
    lastChecked: new Date().toISOString(),
    // Tambahan metrik jaringan
    networkStats: isOnline ? {
      sent: (Math.random() * 8 + 2).toFixed(2), // 2-10 GB
      received: (Math.random() * 6 + 1).toFixed(2), // 1-7 GB  
      latency: Math.floor(Math.random() * 40) + 8, // 8-48ms
      jitter: Math.floor(Math.random() * 15) + 1, // 1-16ms
      ttl: Math.floor(Math.random() * 8) + 60, // 60-67
      packetLoss: parseFloat((Math.random() * 1.5).toFixed(2)), // 0-1.5%
      bandwidth: Math.floor(Math.random() * 60) + 30, // 30-90 Mbps
      hops: Math.floor(Math.random() * 15) + 12, // 12-26 hops
    } : null
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

        // Update dengan data yang lebih lengkap
        tvStatus.set(tv.roomNo, {
          ...result,
          lastChecked: new Date().toISOString(),
          roomNo: tv.roomNo,
          ipAddress: tv.ipAddress,
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
          roomNo: tv.roomNo,
          ipAddress: tv.ipAddress,
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

    // Kirim notifikasi Telegram jika ada
    if (offlineNotifications.length > 0 && typeof telegramBot !== 'undefined' && telegramBot) {
      try {
        await telegramBot.sendOfflineNotification(offlineNotifications);
      } catch (telegramError) {
        console.error("Failed to send Telegram notifications:", telegramError.message);
      }
    }

    const onlineCount = Array.from(tvStatus.values()).filter(s => s.status === "online").length;
    const offlineCount = allTVs.length - onlineCount;

    console.log(
      `TV Status Check: ${onlineCount}/${allTVs.length} online${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? " (dummy)" : ""}`
    );

    return {
      success: true,
      total: allTVs.length,
      online: onlineCount,
      offline: offlineCount,
      notifications: offlineNotifications.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error checking TV status:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Function to generate dummy Chromecast status
function generateDummyChromecastStatus() {
  const isOnline = Math.random() < CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY;
  
  if (!isOnline) {
    return {
      isPingable: false,
      isOnline: false,
      signalLevel: null,
      speed: null,
      responseTime: null,
      lastSeen: null,
      error: ["Device unreachable", "Network timeout", "Connection refused"][Math.floor(Math.random() * 3)],
    };
  }

  // Generate correlated values for online devices
  const signalLevel = Math.floor(Math.random() * 50) - 70; // -70 to -20 dBm
  const baseSpeed = Math.max(10, 100 + signalLevel); // Better signal = better speed
  const speed = baseSpeed + Math.floor(Math.random() * 20) - 10; // Add some variation
  const responseTime = Math.max(5, Math.abs(signalLevel) - 20 + Math.floor(Math.random() * 50)); // Worse signal = higher latency

  return {
    isPingable: true,
    isOnline: true,
    signalLevel: signalLevel,
    speed: Math.max(1, speed),
    responseTime: Math.max(1, responseTime),
    lastSeen: new Date().toISOString(),
    error: null,
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
    let checkedCount = 0;
    let onlineCount = 0;
    
    console.log(`Starting status check for ${allDevices.length} Chromecast devices...`);
    
    for (const device of allDevices) {
      try {
        const previousStatus = chromecastStatus.get(device.idCast)?.isOnline;
        const result = await checkChromecastConnectivity(device.ipAddr);
        
        chromecastStatus.set(device.idCast, {
          ...result,
          lastChecked: new Date().toISOString(),
        });
        
        if (result.isOnline) {
          onlineCount++;
        }
        
        // Send notification if status changed from online to offline
        if (previousStatus === true && !result.isOnline) {
          offlineNotifications.push({
            source: 'chromecast',
            message: `${device.deviceName || 'Unknown Device'} went offline`,
            ipAddr: device.ipAddr,
            deviceName: device.deviceName,
            previousStatus: 'online',
            currentStatus: 'offline',
            timestamp: new Date().toISOString()
          });
        }
        
        checkedCount++;
      } catch (error) {
        const previousStatus = chromecastStatus.get(device.idCast)?.isOnline;
        
        chromecastStatus.set(device.idCast, {
          isPingable: false,
          isOnline: false,
          signalLevel: null,
          speed: null,
          responseTime: null,
          lastSeen: null,
          error: `Check failed: ${error.message}`,
          lastChecked: new Date().toISOString(),
        });
        
        if (previousStatus === true) {
          offlineNotifications.push({
            source: 'chromecast',
            message: `${device.deviceName || 'Unknown Device'} check failed`,
            ipAddr: device.ipAddr,
            deviceName: device.deviceName,
            error: error.message,
            previousStatus: 'online',
            currentStatus: 'error',
            timestamp: new Date().toISOString()
          });
        }
        
        checkedCount++;
      }
    }
    
    // Send Telegram notifications if configured
    if (offlineNotifications.length > 0 && typeof telegramBot !== 'undefined' && telegramBot) {
      try {
        await telegramBot.sendOfflineNotification(offlineNotifications);
      } catch (telegramError) {
        console.error("Failed to send Telegram notifications:", telegramError.message);
      }
    }
    
    const offlineCount = checkedCount - onlineCount;
    const statusSummary = {
      total: allDevices.length,
      checked: checkedCount,
      online: onlineCount,
      offline: offlineCount,
      notificationsTriggered: offlineNotifications.length
    };
    
    console.log(`Chromecast status check completed: ${onlineCount}/${checkedCount} online${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? " (using dummy status)" : ""}`);
    console.log(`Status summary:`, statusSummary);
    
    // Return summary for potential use by calling functions
    return {
      success: true,
      summary: statusSummary,
      notifications: offlineNotifications,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("Error in checkAllChromecastsStatus:", error);
    
    // Return error information
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// ==================== CHANNELS ENDPOINTS ====================

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

// ==================== HOSPITALITY TV ENDPOINTS ====================

// Get all hospitality TVs with status
app.get("/api/hospitality/tvs", trackRequestMetrics('hospitality'), authenticateToken, async (req, res) => {
  try {
    const {
      status,
      search,
      sortBy = "roomNo",
      sortOrder = "asc",
    } = req.query;

    let tvs = await getHospitalityTVs();

    // Add status information to TVs dengan data yang lebih lengkap
    const tvsWithStatus = tvs.map((tv) => {
      const tvStatusData = tvStatus.get(tv.roomNo) || {
        status: "offline",
        responseTime: null,
        error: "Not checked",
        lastChecked: null,
        signalLevel: null,
        networkStats: null
      };

      return {
        ...tv,
        id: tv.id,
        roomNo: tv.roomNo,
        ipAddress: tv.ipAddress,
        status: tvStatusData.status,
        responseTime: tvStatusData.responseTime,
        lastChecked: tvStatusData.lastChecked,
        error: tvStatusData.error,
        model: tvStatusData.model || tv.model || "Samsung Hospitality",
        signalLevel: tvStatusData.signalLevel,
        isOnline: tvStatusData.status === "online",
        isPingable: tvStatusData.status === "online",
        // Tambahan computed fields
        statusText: tvStatusData.status === "online" ? "Online" : "Offline",
        signalQuality: tvStatusData.signalLevel ? 
          (tvStatusData.signalLevel > 85 ? "Excellent" :
           tvStatusData.signalLevel > 70 ? "Good" :
           tvStatusData.signalLevel > 50 ? "Fair" : "Poor") : null,
        lastCheckedFormatted: tvStatusData.lastChecked ? 
          new Date(tvStatusData.lastChecked).toLocaleString() : "Never"
      };
    });

    // Enhanced filtering
    let filteredTVs = tvsWithStatus;
    if (status && status !== "all") {
      if (status === "online") {
        filteredTVs = tvsWithStatus.filter((tv) => tv.status === "online");
      } else if (status === "offline") {
        filteredTVs = tvsWithStatus.filter((tv) => tv.status === "offline");
      }
    }

    // Enhanced search (room number, IP address, atau model)
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredTVs = filteredTVs.filter(
        (tv) =>
          (tv.roomNo && tv.roomNo.toLowerCase().includes(searchTerm)) ||
          (tv.ipAddress && tv.ipAddress.toLowerCase().includes(searchTerm)) ||
          (tv.model && tv.model.toLowerCase().includes(searchTerm))
      );
    }

    // Enhanced sorting
    filteredTVs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle numeric sorting untuk roomNo
      if (sortBy === "roomNo") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
        }
      }

      // Handle numeric sorting untuk responseTime
      if (sortBy === "responseTime") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
      }

      // Handle string sorting
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

    // Enhanced response dengan summary statistics
    const summary = {
      totalCount: filteredTVs.length,
      onlineCount: filteredTVs.filter((d) => d.status === "online").length,
      offlineCount: filteredTVs.filter((d) => d.status === "offline").length,
      avgResponseTime: filteredTVs.filter(d => d.responseTime && d.status === "online")
        .reduce((sum, d) => sum + d.responseTime, 0) / 
        Math.max(1, filteredTVs.filter(d => d.responseTime && d.status === "online").length),
      modelBreakdown: filteredTVs.reduce((acc, tv) => {
        const model = tv.model || "Unknown";
        acc[model] = (acc[model] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: filteredTVs,
      summary,
      ...summary, // backward compatibility
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching Hospitality TVs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Hospitality TVs",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TV device fetch endpoint dengan better error handling
app.get("/api/hospitality/tvs/:id", authenticateToken, async (req, res) => {
  try {
    const rawTvId = req.params.id;
    
    console.log('Fetching TV with ID:', rawTvId);
    
    if (!rawTvId || rawTvId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "TV identifier is required",
        error: "INVALID_TV_ID"
      });
    }

    let tv = null;
    const allTVs = await getHospitalityTVs();
    
    // Enhanced search strategies
    const searchStrategies = [
      rawTvId,                              
      decodeURIComponent(rawTvId),          
      decodeURIComponent(decodeURIComponent(rawTvId)),
      rawTvId.replace(/%20/g, ' '),         
      rawTvId.replace(/\+/g, ' '),
      rawTvId.replace(/_/g, ' '),
      rawTvId.replace(/-/g, ' '),
    ];

    const uniqueStrategies = [...new Set(searchStrategies.filter(Boolean))];
    
    console.log('Search strategies:', uniqueStrategies);
    console.log('Available TVs:', allTVs.map(d => ({ 
      id: d.id, 
      roomNo: d.roomNo,
      type: typeof d.roomNo
    })));

    // Try different matching approaches
    for (const searchTerm of uniqueStrategies) {
      if (tv) break;
      
      console.log(`Trying search term: "${searchTerm}"`);
      
      // 1. Exact roomNo match
      tv = allTVs.find(d => d.roomNo === searchTerm);
      if (tv) {
        console.log('Found by exact room match');
        break;
      }
      
      // 2. Case-insensitive roomNo match
      tv = allTVs.find(d => 
        d.roomNo && d.roomNo.toLowerCase() === searchTerm.toLowerCase()
      );
      if (tv) {
        console.log('Found by case-insensitive room match');
        break;
      }
      
      // 3. Partial room match (contains)
      tv = allTVs.find(d => 
        d.roomNo && (
          d.roomNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(d.roomNo.toLowerCase())
        )
      );
      if (tv) {
        console.log('Found by partial room match');
        break;
      }
      
      // 4. ID match (if numeric)
      if (/^\d+$/.test(searchTerm)) {
        tv = allTVs.find(d => d.id && d.id.toString() === searchTerm);
        if (tv) {
          console.log('Found by ID match');
          break;
        }
      }
      
      // 5. MongoDB ObjectId match
      if (/^[0-9a-fA-F]{24}$/.test(searchTerm)) {
        try {
          tv = await getHospitalityTVByRoomNo(searchTerm); // This might need adjustment based on your DB function
          if (tv) {
            console.log('Found by ObjectId match');
            break;
          }
        } catch (dbError) {
          console.warn(`Database lookup failed for ObjectId ${searchTerm}:`, dbError.message);
        }
      }
    }

    if (!tv) {
      const suggestions = allTVs.slice(0, 5).map(d => ({
        id: d.id,
        roomNo: d.roomNo
      }));
      
      return res.status(404).json({
        success: false,
        message: `TV device not found`,
        error: "TV_NOT_FOUND",
        details: {
          searchedFor: rawTvId,
          searchStrategies: uniqueStrategies,
          suggestions: suggestions,
          totalTVs: allTVs.length
        }
      });
    }

    // Get enhanced TV status
    const tvStatusData = tvStatus.get(tv.roomNo) || {
      status: "offline",
      responseTime: null,
      error: "Not checked",
      lastChecked: null,
    };

    // Prepare enhanced response
    const enhancedTV = {
      ...tv,
      id: tv.id,
      roomNo: tv.roomNo,
      ipAddress: tv.ipAddress,
      status: tvStatusData.status,
      responseTime: tvStatusData.responseTime,
      lastChecked: tvStatusData.lastChecked,
      error: tvStatusData.error,
      model: tv.model || "Samsung Hospitality",
      isOnline: tvStatusData.status === "online",
      isPingable: tvStatusData.status === "online",
      // Add computed fields
      statusText: tvStatusData.status === "online" ? "Online" : "Offline",
      lastCheckedFormatted: tvStatusData.lastChecked ? 
        new Date(tvStatusData.lastChecked).toLocaleString() : "Never"
    };

    console.log(`Successfully returning TV: Room ${tv.roomNo}`);

    res.json({
      success: true,
      data: enhancedTV,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Error fetching TV device:", error);
    
    let statusCode = 500;
    let errorMessage = "Internal server error";
    
    if (error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = "Request timeout";
    } else if (error.message.includes('network')) {
      statusCode = 503;
      errorMessage = "Network error";
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check specific TV status
app.post("/api/hospitality/tvs/:id/check", authenticateToken, async (req, res) => {
  try {
    const rawTvId = req.params.id;
    
    if (!rawTvId || rawTvId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "TV identifier is required",
        error: "INVALID_TV_ID"
      });
    }

    // Use same enhanced search logic
    let tv = null;
    const allTVs = await getHospitalityTVs();
    
    const decodingStrategies = [
      rawTvId,
      decodeURIComponent(rawTvId),
      rawTvId.replace(/%20/g, ' '),
      rawTvId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (tv) break;
      
      tv = allTVs.find(d => d.roomNo === searchTerm);
      if (tv) break;
      
      tv = allTVs.find(d => 
        d.roomNo && d.roomNo.toLowerCase() === searchTerm.toLowerCase()
      );
      if (tv) break;
      
      if (/^\d+$/.test(searchTerm)) {
        tv = allTVs.find(d => d.id && d.id.toString() === searchTerm);
        if (tv) break;
      }
    }

    if (!tv) {
      return res.status(404).json({
        success: false,
        message: `TV device not found`,
        error: "TV_NOT_FOUND"
      });
    }

    if (!tv.ipAddress) {
      return res.status(400).json({
        success: false,
        message: "TV IP address not available for connectivity check",
        error: "NO_IP_ADDRESS"
      });
    }

    console.log(`Checking connectivity for TV: Room ${tv.roomNo} (${tv.ipAddress})`);

    // Perform connectivity check
    const result = await checkTVConnectivity(tv.ipAddress);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    // Update status in memory
    tvStatus.set(tv.roomNo, statusInfo);

    // Log the check result
    console.log(`TV check completed: Room ${tv.roomNo} - ${result.status}`);

    const enhancedResponse = {
      ...tv,
      ...statusInfo,
      id: tv.id,
      model: tv.model || "Samsung Hospitality",
      isOnline: result.status === "online",
      isPingable: result.status === "online",
      statusText: result.status === "online" ? "Online" : "Offline"
    };

    res.json({
      success: true,
      message: "TV status checked successfully",
      data: enhancedResponse,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking TV device status:", error);

    let errorMessage = "Internal server error while checking TV status";
    let statusCode = 500;

    if (error.message.includes("timeout")) {
      errorMessage = "TV connection timeout";
      statusCode = 408;
    } else if (error.message.includes("unreachable")) {
      errorMessage = "TV unreachable";
      statusCode = 503;
    } else if (error.name === 'NetworkError') {
      errorMessage = "Network connectivity issue";
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/hospitality/tvs/:id/metrics", authenticateToken, async (req, res) => {
  try {
    const rawTvId = req.params.id;
    
    if (!rawTvId || rawTvId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "TV identifier is required",
        error: "INVALID_TV_ID"
      });
    }

    // Cari TV dengan enhanced search logic
    let tv = null;
    const allTVs = await getHospitalityTVs();
    
    const decodingStrategies = [
      rawTvId,
      decodeURIComponent(rawTvId),
      rawTvId.replace(/%20/g, ' '),
      rawTvId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (tv) break;
      
      tv = allTVs.find(d => d.roomNo === searchTerm);
      if (tv) break;
      
      tv = allTVs.find(d => 
        d.roomNo && d.roomNo.toLowerCase() === searchTerm.toLowerCase()
      );
      if (tv) break;
      
      if (/^\d+$/.test(searchTerm)) {
        tv = allTVs.find(d => d.id && d.id.toString() === searchTerm);
        if (tv) break;
      }
    }

    if (!tv) {
      return res.status(404).json({
        success: false,
        message: `TV "${rawTvId}" not found`,
        error: "TV_NOT_FOUND"
      });
    }

    const tvStatusData = tvStatus.get(tv.roomNo);
    const isOnline = tvStatusData?.status === "online";

    // Generate realistic network metrics
    const generateTVNetworkMetrics = (isOnline) => {
      if (!isOnline) {
        return {
          sent: "0.00",
          received: "0.00", 
          latency: 0,
          jitter: 0,
          ttl: 0,
          packetLoss: 100,
          bandwidth: 0,
          hops: 0
        };
      }

      // Generate correlated realistic values
      const baseLatency = Math.floor(Math.random() * 35) + 8; // 8-43ms
      const baseJitter = Math.max(1, Math.floor(baseLatency * 0.15) + Math.floor(Math.random() * 8)); // 15% of latency + variation
      const baseBandwidth = Math.floor(Math.random() * 70) + 25; // 25-95 Mbps
      const basePacketLoss = parseFloat((Math.random() * 1.2).toFixed(2)); // 0-1.2%

      return {
        sent: (Math.random() * 12 + 3).toFixed(2), // 3-15 GB
        received: (Math.random() * 8 + 2).toFixed(2), // 2-10 GB
        latency: baseLatency,
        jitter: baseJitter,
        ttl: Math.floor(Math.random() * 8) + 60, // 60-67 (realistic TTL)
        packetLoss: basePacketLoss,
        bandwidth: baseBandwidth,
        hops: Math.floor(Math.random() * 12) + 10 // 10-21 hops
      };
    };

    const metrics = generateTVNetworkMetrics(isOnline);

    res.json({
      success: true,
      data: {
        ...metrics,
        timestamp: new Date().toISOString(),
        roomNo: tv.roomNo,
        isOnline: isOnline,
        signalLevel: tvStatusData?.signalLevel || null
      }
    });
  } catch (error) {
    console.error("Error fetching TV metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching TV network metrics",
      error: error.message
    });
  }
});

app.get("/api/hospitality/tvs/:id/history", authenticateToken, async (req, res) => {
  try {
    const rawTvId = req.params.id;
    const { timeRange = '24h' } = req.query;

    if (!rawTvId || rawTvId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "TV identifier is required"
      });
    }

    // Enhanced TV search logic
    let tv = null;
    const allTVs = await getHospitalityTVs();
    
    const decodingStrategies = [
      rawTvId,
      decodeURIComponent(rawTvId),
      rawTvId.replace(/%20/g, ' '),
      rawTvId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (tv) break;
      
      tv = allTVs.find(d => d.roomNo === searchTerm);
      if (tv) break;
      
      tv = allTVs.find(d => 
        d.roomNo && d.roomNo.toLowerCase() === searchTerm.toLowerCase()
      );
      if (tv) break;
      
      if (/^\d+$/.test(searchTerm)) {
        tv = allTVs.find(d => d.id && d.id.toString() === searchTerm);
        if (tv) break;
      }
    }

    if (!tv) {
      return res.status(404).json({
        success: false,
        message: `TV "${rawTvId}" not found`
      });
    }

    const tvStatusData = tvStatus.get(tv.roomNo);
    const isOnline = tvStatusData?.status === "online";
    
    // Generate consistent historical data untuk TV
    const generateTVHistoricalData = (timeRange, isOnline) => {
      const now = new Date();
      const data = [];

      let points, intervalMs;
      switch (timeRange) {
        case '1h':
          points = 60;
          intervalMs = 60000; // 1 minute
          break;
        case '24h':
          points = 24;
          intervalMs = 3600000; // 1 hour
          break;
        case '7d':
          points = 7;
          intervalMs = 86400000; // 1 day
          break;
        default:
          points = 24;
          intervalMs = 3600000;
      }

      // Base values yang konsisten untuk TV
      const baseLatency = isOnline ? 22 : 0;
      const baseBandwidth = isOnline ? 65 : 0;
      const baseJitter = isOnline ? 6 : 0;
      const basePacketLoss = isOnline ? 0.3 : 0;
      const baseSent = isOnline ? 4.5 : 0;
      const baseReceived = isOnline ? 2.8 : 0;
      const baseHops = isOnline ? 14 : 0;

      for (let i = points - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * intervalMs);
        const timeStr = timeRange === '1h' 
          ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
          : timeRange === '24h'
          ? `${String(time.getHours()).padStart(2, '0')}:00`
          : time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Add realistic variation (20% variation)
        const variation = 0.2;
        data.push({
          time: timeStr,
          timestamp: time.toISOString(),
          latency: Math.max(0, Math.floor(baseLatency + (Math.random() - 0.5) * baseLatency * variation)),
          bandwidth: Math.max(0, Math.floor(baseBandwidth + (Math.random() - 0.5) * baseBandwidth * variation)),
          jitter: Math.max(0, Math.floor(baseJitter + (Math.random() - 0.5) * baseJitter * variation)),
          packetLoss: Math.max(0, parseFloat((basePacketLoss + (Math.random() - 0.5) * basePacketLoss * variation).toFixed(2))),
          sent: Math.max(0, parseFloat((baseSent + (Math.random() - 0.5) * baseSent * variation).toFixed(2))),
          received: Math.max(0, parseFloat((baseReceived + (Math.random() - 0.5) * baseReceived * variation).toFixed(2))),
          hops: Math.max(0, Math.floor(baseHops + (Math.random() - 0.5) * baseHops * variation))
        });
      }

      return data;
    };

    const historicalData = generateTVHistoricalData(timeRange, isOnline);

    res.json({
      success: true,
      data: historicalData,
      timeRange: timeRange,
      roomNo: tv.roomNo,
      isOnline: isOnline,
      totalPoints: historicalData.length
    });
  } catch (error) {
    console.error("Error fetching TV network history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching TV network history",
      error: error.message
    });
  }
});

// Bulk check all TVs status
app.post("/api/hospitality/tvs/check-all", authenticateToken, async (req, res) => {
  try {
    await checkAllTVsStatus();

    const allTVs = await getHospitalityTVs();

    const tvsWithStatus = allTVs.map((tv) => {
      const tvStatusData = tvStatus.get(tv.roomNo) || {
        status: "offline",
        responseTime: null,
        error: "Not checked",
        lastChecked: null,
      };

      return {
        ...tv,
        id: tv.id,
        roomNo: tv.roomNo,
        ipAddress: tv.ipAddress,
        status: tvStatusData.status,
        responseTime: tvStatusData.responseTime,
        lastChecked: tvStatusData.lastChecked,
        error: tvStatusData.error,
        model: tv.model || "Samsung Hospitality",
        isOnline: tvStatusData.status === "online",
        isPingable: tvStatusData.status === "online"
      };
    });

    res.json({
      success: true,
      message: "All TV devices status checked",
      data: tvsWithStatus,
      totalCount: tvsWithStatus.length,
      onlineCount: tvsWithStatus.filter((d) => d.status === "online").length,
      offlineCount: tvsWithStatus.filter((d) => d.status === "offline").length,
    });
  } catch (error) {
    console.error("Error checking all TV devices status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking all TV devices status",
      error: error.message,
    });
  }
});

// Get hospitality dashboard stats
app.get(
  "/api/hospitality/dashboard/stats", 
  trackRequestMetrics('hospitality'),
  authenticateToken,
  async (req, res) => {
    try {
      const allTVs = await getHospitalityTVs();
      const statusArray = Array.from(tvStatus.values());

      const totalTVs = allTVs.length;
      const onlineTVs = statusArray.filter(s => s.status === "online").length;
      const offlineTVs = totalTVs - onlineTVs;
      const uncheckedTVs = totalTVs - statusArray.length;

      // Calculate uptime percentage
      const uptime = totalTVs > 0 ? ((onlineTVs / totalTVs) * 100).toFixed(1) : "0.0";

      // Enhanced model stats
      const modelStats = {};
      allTVs.forEach((tv) => {
        const tvStatusData = tvStatus.get(tv.roomNo);
        const model = tvStatusData?.model || tv.model || "Samsung Hospitality";
        
        if (!modelStats[model]) {
          modelStats[model] = { total: 0, online: 0, offline: 0, unchecked: 0 };
        }
        modelStats[model].total++;

        if (tvStatusData) {
          if (tvStatusData.status === "online") {
            modelStats[model].online++;
          } else {
            modelStats[model].offline++;
          }
        } else {
          modelStats[model].unchecked++;
        }
      });

      // Enhanced metrics
      const onlineStatusList = statusArray.filter(s => s.status === "online");
      const avgResponseTime = onlineStatusList.length > 0
        ? (onlineStatusList.reduce((sum, s) => sum + (s.responseTime || 0), 0) / onlineStatusList.length).toFixed(1)
        : null;

      const avgSignalLevel = onlineStatusList.length > 0
        ? (onlineStatusList.reduce((sum, s) => sum + (s.signalLevel || 0), 0) / onlineStatusList.length).toFixed(1)
        : null;

      // Recent activity (dalam 1 jam terakhir)
      const oneHourAgo = new Date(Date.now() - 3600000);
      const recentChecks = statusArray.filter(s => 
        s.lastChecked && new Date(s.lastChecked) > oneHourAgo
      ).length;

      res.json({
        success: true,
        data: {
          totalTVs,
          onlineTVs,
          offlineTVs,
          uncheckedTVs,
          uptime,
          modelStats,
          avgResponseTime,
          avgSignalLevel,
          recentChecks,
          metrics: {
            responseTimeDistribution: onlineStatusList.reduce((acc, s) => {
              const time = s.responseTime || 0;
              if (time < 50) acc.fast++;
              else if (time < 100) acc.medium++;
              else acc.slow++;
              return acc;
            }, { fast: 0, medium: 0, slow: 0 }),
            signalQualityDistribution: onlineStatusList.reduce((acc, s) => {
              const signal = s.signalLevel || 0;
              if (signal > 85) acc.excellent++;
              else if (signal > 70) acc.good++;
              else if (signal > 50) acc.fair++;
              else acc.poor++;
              return acc;
            }, { excellent: 0, good: 0, fair: 0, poor: 0 })
          },
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error fetching TV dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching TV dashboard stats",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// ==================== CHROMECAST ENDPOINTS ====================

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

// Enhanced Chromecast device fetch endpoint dengan better error handling
app.get("/api/chromecast/:id", authenticateToken, async (req, res) => {
  try {
    const rawDeviceId = req.params.id;
    
    console.log('Fetching device with ID:', rawDeviceId);
    
    if (!rawDeviceId || rawDeviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
        error: "INVALID_DEVICE_ID"
      });
    }

    let device = null;
    const allDevices = await getChromecastDevices();
    
    // Enhanced search strategies
    const searchStrategies = [
      rawDeviceId,                              
      decodeURIComponent(rawDeviceId),          
      decodeURIComponent(decodeURIComponent(rawDeviceId)),
      rawDeviceId.replace(/%20/g, ' '),         
      rawDeviceId.replace(/\+/g, ' '),
      rawDeviceId.replace(/_/g, ' '),
      rawDeviceId.replace(/-/g, ' '),
    ];

    const uniqueStrategies = [...new Set(searchStrategies.filter(Boolean))];
    
    console.log('Search strategies:', uniqueStrategies);
    console.log('Available devices:', allDevices.map(d => ({ 
      id: d.idCast, 
      name: d.deviceName,
      type: typeof d.deviceName
    })));

    // Try different matching approaches
    for (const searchTerm of uniqueStrategies) {
      if (device) break;
      
      console.log(`Trying search term: "${searchTerm}"`);
      
      // 1. Exact deviceName match
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) {
        console.log('Found by exact name match');
        break;
      }
      
      // 2. Case-insensitive deviceName match
      device = allDevices.find(d => 
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) {
        console.log('Found by case-insensitive name match');
        break;
      }
      
      // 3. Partial name match (contains)
      device = allDevices.find(d => 
        d.deviceName && (
          d.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(d.deviceName.toLowerCase())
        )
      );
      if (device) {
        console.log('Found by partial name match');
        break;
      }
      
      // 4. ID match (if numeric)
      if (/^\d+$/.test(searchTerm)) {
        device = allDevices.find(d => d.idCast.toString() === searchTerm);
        if (device) {
          console.log('Found by ID match');
          break;
        }
      }
      
      // 5. MongoDB ObjectId match
      if (/^[0-9a-fA-F]{24}$/.test(searchTerm)) {
        try {
          device = await getChromecastDeviceById(searchTerm);
          if (device) {
            console.log('Found by ObjectId match');
            break;
          }
        } catch (dbError) {
          console.warn(`Database lookup failed for ObjectId ${searchTerm}:`, dbError.message);
        }
      }
    }

    if (!device) {
      const suggestions = allDevices.slice(0, 5).map(d => ({
        id: d.idCast,
        name: d.deviceName
      }));
      
      return res.status(404).json({
        success: false,
        message: `Chromecast device not found`,
        error: "DEVICE_NOT_FOUND",
        details: {
          searchedFor: rawDeviceId,
          searchStrategies: uniqueStrategies,
          suggestions: suggestions,
          totalDevices: allDevices.length
        }
      });
    }

    // Get enhanced device status
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

    // Prepare enhanced response
    const enhancedDevice = {
      ...device,
      ...deviceStatus,
      id: device.idCast,
      type: device.type || "Chromecast",
      model: device.model || "Google Chromecast",
      // Add computed fields
      statusText: deviceStatus.isOnline ? "Online" : "Offline",
      signalQuality: deviceStatus.signalLevel ? 
        (deviceStatus.signalLevel > -50 ? "Excellent" :
         deviceStatus.signalLevel > -60 ? "Good" :
         deviceStatus.signalLevel > -70 ? "Fair" : "Poor") : "Unknown",
      lastCheckedFormatted: deviceStatus.lastChecked ? 
        new Date(deviceStatus.lastChecked).toLocaleString() : "Never"
    };

    console.log(`Successfully returning device: ${device.deviceName}`);

    res.json({
      success: true,
      data: enhancedDevice,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Error fetching Chromecast device:", error);
    
    let statusCode = 500;
    let errorMessage = "Internal server error";
    
    if (error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = "Request timeout";
    } else if (error.message.includes('network')) {
      statusCode = 503;
      errorMessage = "Network error";
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced check device endpoint
app.post("/api/chromecast/:id/check", authenticateToken, async (req, res) => {
  try {
    const rawDeviceId = req.params.id;
    
    if (!rawDeviceId || rawDeviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device identifier is required",
        error: "INVALID_DEVICE_ID"
      });
    }

    // Use same enhanced search logic
    let device = null;
    const allDevices = await getChromecastDevices();
    
    const decodingStrategies = [
      rawDeviceId,
      decodeURIComponent(rawDeviceId),
      rawDeviceId.replace(/%20/g, ' '),
      rawDeviceId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (device) break;
      
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) break;
      
      device = allDevices.find(d => 
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) break;
      
      if (/^\d+$/.test(searchTerm)) {
        device = allDevices.find(d => d.idCast.toString() === searchTerm);
        if (device) break;
      }
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: `Chromecast device not found`,
        error: "DEVICE_NOT_FOUND"
      });
    }

    if (!device.ipAddr) {
      return res.status(400).json({
        success: false,
        message: "Device IP address not available for connectivity check",
        error: "NO_IP_ADDRESS"
      });
    }

    console.log(`Checking connectivity for device: ${device.deviceName} (${device.ipAddr})`);

    // Perform enhanced connectivity check
    const result = await checkChromecastConnectivity(device.ipAddr);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
      checkDuration: Date.now() - Date.now() // This will be near 0, but shows the concept
    };

    // Update status in memory
    chromecastStatus.set(device.idCast, statusInfo);

    // Log the check result
    console.log(`Device check completed: ${device.deviceName} - ${result.isOnline ? 'Online' : 'Offline'}`);

    const enhancedResponse = {
      ...device,
      ...statusInfo,
      id: device.idCast,
      type: device.type || "Chromecast", 
      model: device.model || "Google Chromecast",
      statusText: result.isOnline ? "Online" : "Offline",
      signalQuality: result.signalLevel ? 
        (result.signalLevel > -50 ? "Excellent" :
         result.signalLevel > -60 ? "Good" :
         result.signalLevel > -70 ? "Fair" : "Poor") : "Unknown"
    };

    res.json({
      success: true,
      message: "Device status checked successfully",
      data: enhancedResponse,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking Chromecast device status:", error);

    let errorMessage = "Internal server error while checking device status";
    let statusCode = 500;

    if (error.message.includes("timeout")) {
      errorMessage = "Device connection timeout";
      statusCode = 408;
    } else if (error.message.includes("unreachable")) {
      errorMessage = "Device unreachable";
      statusCode = 503;
    } else if (error.name === 'NetworkError') {
      errorMessage = "Network connectivity issue";
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint untuk device network metrics
app.get("/api/chromecast/:id/metrics", authenticateToken, async (req, res) => {
  try {
    const deviceId = decodeURIComponent(req.params.id);

    if (!deviceId || deviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device identifier is required"
      });
    }

    // Find device by name or ID using enhanced search logic
    let device;
    const allDevices = await getChromecastDevices();
    
    // Use same search logic as main device endpoint
    const decodingStrategies = [
      deviceId,
      decodeURIComponent(deviceId),
      deviceId.replace(/%20/g, ' '),
      deviceId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (device) break;
      
      // Exact match first
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) break;
      
      // Case-insensitive match
      device = allDevices.find(d => 
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) break;
      
      // ID match
      if (/^\d+$/.test(searchTerm)) {
        device = allDevices.find(d => d.idCast.toString() === searchTerm);
        if (device) break;
      }
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: `Device '${deviceId}' not found`
      });
    }

    const deviceStatus = chromecastStatus.get(device.idCast);
    const isOnline = deviceStatus?.isOnline || false;

    // Generate realistic network metrics
    const generateRealisticMetrics = () => {
      if (!isOnline) {
        return {
          sent: "0.00",
          received: "0.00", 
          latency: 0,
          jitter: 0,
          ttl: 0,
          packetLoss: 100,
          bandwidth: 0,
          speed: 0
        };
      }

      // Generate realistic values based on device performance
      const baseLatency = Math.floor(Math.random() * 30) + 10; // 10-40ms
      const baseJitter = Math.floor(baseLatency * 0.1) + Math.floor(Math.random() * 10); // 10% of latency + random
      const baseBandwidth = Math.floor(Math.random() * 80) + 20; // 20-100 Mbps
      const baseSpeed = Math.floor(baseBandwidth * 0.8) + Math.floor(Math.random() * 20); // 80% of bandwidth + variation

      return {
        sent: (Math.random() * 15 + 5).toFixed(2), // 5-20 GB
        received: (Math.random() * 12 + 3).toFixed(2), // 3-15 GB
        latency: baseLatency,
        jitter: baseJitter,
        ttl: Math.floor(Math.random() * 8) + 58, // 58-65 (realistic TTL range)
        packetLoss: parseFloat((Math.random() * 2).toFixed(2)), // 0-2%
        bandwidth: baseBandwidth,
        speed: baseSpeed
      };
    };

    const metrics = generateRealisticMetrics();

    res.json({
      success: true,
      data: {
        ...metrics,
        timestamp: new Date().toISOString(),
        deviceName: device.deviceName,
        isOnline: isOnline
      }
    });
  } catch (error) {
    console.error("Error fetching device metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching device metrics",
      error: error.message
    });
  }
});

// Endpoint untuk network history
app.get("/api/chromecast/:id/history", authenticateToken, async (req, res) => {
  try {
    const deviceId = decodeURIComponent(req.params.id);
    const { timeRange = '24h' } = req.query;

    if (!deviceId || deviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Device identifier is required"
      });
    }

    // Find device using same enhanced search logic
    let device;
    const allDevices = await getChromecastDevices();
    
    const decodingStrategies = [
      deviceId,
      decodeURIComponent(deviceId),
      deviceId.replace(/%20/g, ' '),
      deviceId.replace(/\+/g, ' '),
    ];
    
    const uniqueStrategies = [...new Set(decodingStrategies)];
    
    for (const searchTerm of uniqueStrategies) {
      if (device) break;
      
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) break;
      
      device = allDevices.find(d => 
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) break;
      
      if (/^\d+$/.test(searchTerm)) {
        device = allDevices.find(d => d.idCast.toString() === searchTerm);
        if (device) break;
      }
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: `Device '${deviceId}' not found`
      });
    }

    const deviceStatus = chromecastStatus.get(device.idCast);
    const isOnline = deviceStatus?.isOnline || false;
    
    // Generate consistent historical data
    const generateHistoricalData = (timeRange, isOnline) => {
      const now = new Date();
      const data = [];

      let points, intervalMs;
      switch (timeRange) {
        case '1h':
          points = 60;
          intervalMs = 60000; // 1 minute
          break;
        case '24h':
          points = 24;
          intervalMs = 3600000; // 1 hour
          break;
        case '7d':
          points = 7;
          intervalMs = 86400000; // 1 day
          break;
        default:
          points = 24;
          intervalMs = 3600000;
      }

      // Base values for consistency
      const baseLatency = isOnline ? 25 : 0;
      const baseBandwidth = isOnline ? 75 : 0;
      const baseJitter = isOnline ? 8 : 0;
      const basePacketLoss = isOnline ? 0.5 : 0;
      const baseSent = isOnline ? 3.2 : 0;
      const baseReceived = isOnline ? 2.1 : 0;
      const baseSpeed = isOnline ? 85 : 0;

      for (let i = points - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * intervalMs);
        const timeStr = timeRange === '1h' 
          ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
          : timeRange === '24h'
          ? `${String(time.getHours()).padStart(2, '0')}:00`
          : time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Add some realistic variation
        const variation = 0.3; // 30% variation
        data.push({
          time: timeStr,
          timestamp: time.toISOString(),
          latency: Math.max(0, Math.floor(baseLatency + (Math.random() - 0.5) * baseLatency * variation)),
          bandwidth: Math.max(0, Math.floor(baseBandwidth + (Math.random() - 0.5) * baseBandwidth * variation)),
          jitter: Math.max(0, Math.floor(baseJitter + (Math.random() - 0.5) * baseJitter * variation)),
          packetLoss: Math.max(0, parseFloat((basePacketLoss + (Math.random() - 0.5) * basePacketLoss * variation).toFixed(2))),
          sent: Math.max(0, parseFloat((baseSent + (Math.random() - 0.5) * baseSent * variation).toFixed(2))),
          received: Math.max(0, parseFloat((baseReceived + (Math.random() - 0.5) * baseReceived * variation).toFixed(2))),
          speed: Math.max(0, Math.floor(baseSpeed + (Math.random() - 0.5) * baseSpeed * variation))
        });
      }

      return data;
    };

    const historicalData = generateHistoricalData(timeRange, isOnline);

    res.json({
      success: true,
      data: historicalData,
      timeRange: timeRange,
      deviceName: device.deviceName,
      isOnline: isOnline,
      totalPoints: historicalData.length
    });
  } catch (error) {
    console.error("Error fetching network history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching network history",
      error: error.message
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
    }, 120000); // Every 2 minutes
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
