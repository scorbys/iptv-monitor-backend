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
    
    // PERBAIKAN: berikan pesan error yang lebih spesifik
    let errorMessage = "Invalid token";
    let statusCode = 403;
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = "Token expired";
      statusCode = 401;
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = "Invalid token format";
      statusCode = 401;
    }
    
    // PERBAIKAN: Clear cookie jika token invalid
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

// Function database coonection check
async function checkDatabaseConnection() {
  try {
    // PERBAIKAN: tambahkan timeout untuk database connection
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

    for (const channel of allChannels) {
      try {
        const result = await checkMulticastConnectivity(channel.ipMulticast);
        channelStatus.set(channel.id, {
          ...result,
          lastChecked: new Date().toISOString(),
        });
      } catch (error) {
        channelStatus.set(channel.id, {
          status: "offline",
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString(),
        });
      }
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

    for (const tv of allTVs) {
      try {
        const result = await checkTVConnectivity(tv.ipAddress);
        tvStatus.set(tv.roomNo, {
          ...result,
          lastChecked: new Date().toISOString(),
        });
      } catch (error) {
        tvStatus.set(tv.roomNo, {
          status: "offline",
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString(),
        });
      }
    }

    console.log(
      `Checked status for ${allTVs.length} TV devices${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? " (using dummy status)" : ""
      }`
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

    for (const device of allDevices) {
      try {
        const result = await checkChromecastConnectivity(device.ipAddr);
        chromecastStatus.set(device.idCast, {
          ...result,
          lastChecked: new Date().toISOString(),
        });
      } catch (error) {
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
      }
    }

    console.log(
      `Checked status for ${allDevices.length} Chromecast devices${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? " (using dummy status)" : ""
      }`
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
  
  // PERBAIKAN: jangan gunakan catch-all route yang bermasalah
  if (res.headersSent) {
    return next(error);
  }
  
  // PERBAIKAN: berikan response yang lebih informatif
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
};


// Start server
app.listen(port, async () => {
  console.log(`🚀 Server starting on port ${port}`);
  
  // PERBAIKAN: buat database connection check opsional
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.warn("⚠️  Database connection failed, but server will continue running");
    // JANGAN exit server jika database gagal connect
    // process.exit(1);
  }

  console.log("Starting initial status checks...");
  console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);

  // PERBAIKAN: buat status checks opsional dan tidak crash server
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
