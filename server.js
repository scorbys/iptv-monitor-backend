require('dotenv').config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const dgram = require("dgram");
const net = require("net");
const path = require("path");
const axios = require('axios');
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

// ==================== APP CONFIGURATION ====================
const app = express();
const port = process.env.PORT || 3001;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET environment variable is required");
  process.exit(1);
}

// Gemini API
const GEMINI_CONFIG = {
  apiKey: process.env.GEMINI_API_KEY,
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
};

// ==================== IMPORTS ====================
const verifyRoute = require("./api/auth/verify/route");
const googleAuthRoute = require("./api/auth/google/route");
const googleCallbackRoute = require("./api/auth/google/callback/route");
const IPTVTelegramBot = require('./api/services/telegram/bot-tele');
const userProfileRoute = require("./api/user/profile/route");
const userPasswordRoute = require("./api/user/password/route");
const userAvatarRoute = require("./api/user/avatar/route");

// ==================== CONFIGURATION ====================
const CHANNEL_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.94, // 94% chance of being online
  RESPONSE_TIME_RANGE: { min: 8, max: 120 }, // Response time in ms
  SIGNAL_LEVEL_RANGE: { min: 60, max: 95 }, // Signal strength in %
  BITRATE_RANGE: { min: 2500, max: 8000 }, // Bitrate in kbps
  UPDATE_INTERVAL: 120000, // 2 minutes in milliseconds
};

const TV_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  RESPONSE_TIME_RANGE: { min: 5, max: 150 }, // Response time in ms
  UPDATE_INTERVAL: 120000, // 2 minutes in milliseconds
};

const CHROMECAST_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  SIGNAL_LEVEL_RANGE: { min: -70, max: -20 }, // Signal strength in dBm
  SPEED_RANGE: { min: 10, max: 100 }, // Speed in Mbps
  RESPONSE_TIME_RANGE: { min: 10, max: 200 }, // Response time in ms
  UPDATE_INTERVAL: 120000, // 2 minutes in milliseconds
};

// ==================== IN-MEMORY STORAGE ====================
const channelStatus = new Map();
const tvStatus = new Map();
const chromecastStatus = new Map();

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

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
  origin: function (origin, callback) {
    // Dynamic origin support for Vercel deployments
    let allowedOrigin = null;

    if (!origin) {
      // Same-origin request or server-to-server
      return callback(null, true);
    }

    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;

      // Allow any Vercel deployment (both production and preview)
      if (hostname.endsWith('.vercel.app')) {
        allowedOrigin = origin;
        console.log(`[CORS] Allowing Vercel origin: ${origin}`);
      }
      // Allow localhost for development
      else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        allowedOrigin = origin;
        console.log(`[CORS] Allowing localhost origin: ${origin}`);
      }
      // Allow IP addresses for local network testing
      else if (/^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$|^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) {
        allowedOrigin = origin;
        console.log(`[CORS] Allowing local network origin: ${origin}`);
      }
      // Default to production if unknown
      else {
        console.warn(`[CORS] Unknown origin: ${origin}, blocking request`);
        return callback(new Error("Not allowed by CORS"));
      }

      return callback(null, allowedOrigin);
    } catch (e) {
      console.error('[CORS] Invalid origin:', origin);
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// ==================== MIDDLEWARE SETUP ====================
// Preflight CORS must use corsOptions to avoid wildcard
app.options(/.*/, cors(corsOptions));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Dynamic origin support for Vercel deployments
  let allowedOrigin = null;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;

      // Allow any Vercel deployment (both production and preview)
      if (hostname.endsWith('.vercel.app')) {
        allowedOrigin = origin;
      }
      // Allow localhost for development
      else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        allowedOrigin = origin;
      }
      // Allow IP addresses for local network testing
      else if (/^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$|^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) {
        allowedOrigin = origin;
      }
      // Default to production origin if unknown (don't set custom header)
      else {
        console.warn(`[MIDDLEWARE CORS] Unknown origin: ${origin}, not setting CORS header`);
      }
    } catch (e) {
      console.error('[MIDDLEWARE CORS] Invalid origin:', origin);
    }
  }

  // Only set Access-Control-Allow-Origin if we validated the origin
  if (allowedOrigin) {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors(corsOptions));

// Route middleware
app.use("/api/auth/verify", verifyRoute);
app.use("/api/auth/google", googleAuthRoute);
app.use("/api/auth/google/callback", googleCallbackRoute);
app.use("/api/user/profile", userProfileRoute);
app.use("/api/user/password", userPasswordRoute);
app.use("/api/user/avatar", userAvatarRoute);
app.use('/api/dashboard', require('./api/dashboard/stats'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);

  if (req.path.includes('/auth/')) {
    console.log("Cookies:", req.cookies);
  }

  next();
});

// Static files middleware
app.use('/api/uploads', express.static(path.join(__dirname, 'api/uploads'), {
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

// ==================== MIDDLEWARE FUNCTIONS ====================
const authenticateToken = (req, res, next) => {
  console.log("=== AUTHENTICATE TOKEN START ===");

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
    console.log("No token provided");
    return res.status(401).json({
      success: false,
      error: "Access denied. No token provided.",
      authenticated: false
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log("Token verified for user:", decoded.username);
    console.log("Token expires at:", new Date(decoded.exp * 1000));
    console.log("=== AUTHENTICATE TOKEN END ===");
    next();
  } catch (error) {
    console.error("Token verification error:", error);

    let errorMessage = "Invalid token";
    let statusCode = 403;

    if (error.name === 'TokenExpiredError') {
      errorMessage = "Token expired";
      statusCode = 401;
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = "Invalid token format";
      statusCode = 401;
    }

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

const trackRequestMetrics = (serviceType) => {
  return (req, res, next) => {
    const startTime = Date.now();

    networkStats[serviceType].requests++;
    networkStats[serviceType].totalRequests++;

    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      const responseTime = Date.now() - startTime;

      networkStats[serviceType].totalResponseTime += responseTime;
      networkStats[serviceType].responseTime =
        networkStats[serviceType].totalResponseTime / networkStats[serviceType].totalRequests;

      if (res.statusCode >= 400) {
        networkStats[serviceType].errorCount++;
      }

      const timeDiff = (Date.now() - networkStats[serviceType].lastReset.getTime()) / 1000;
      networkStats[serviceType].throughput = networkStats[serviceType].requests / Math.max(timeDiff, 1);

      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

// ==================== TELEGRAM BOT INITIALIZATION ====================
const initializeTelegramBot = async () => {
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      telegramBot = new IPTVTelegramBot();
      await telegramBot.start(); // Start the Grammy bot
      console.log('Telegram bot initialized successfully');
    } else {
      console.warn('TELEGRAM_BOT_TOKEN not found in environment variables');
    }
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error);
  }
};

let telegramBot = null;
initializeTelegramBot();

// ==================== UTILITY FUNCTIONS ====================
async function checkDatabaseConnection() {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 5000);
    });

    // Test dengan query sederhana
    const dbPromise = Promise.resolve().then(async () => {
      try {
        const testChannels = await getInternationalChannels();
        if (!testChannels || !Array.isArray(testChannels)) {
          throw new Error('Invalid channels data structure');
        }
        return testChannels;
      } catch (error) {
        console.warn('International channels test failed, trying local channels...');
        const localChannels = await getLocalChannels();
        if (!localChannels || !Array.isArray(localChannels)) {
          throw new Error('Both international and local channels failed');
        }
        return localChannels;
      }
    });

    await Promise.race([dbPromise, timeoutPromise]);
    console.log("Database connection successful");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error.message);
    return false;
  }
}

async function getAllChannelsFromDB() {
  try {
    const [internationalChannels, localChannels] = await Promise.all([
      getInternationalChannels(),
      getLocalChannels(),
    ]);

    const intlArray = Array.isArray(internationalChannels) ? internationalChannels : [];
    const localArray = Array.isArray(localChannels) ? localChannels : [];

    const allChannels = [...intlArray, ...localArray];

    const validChannels = allChannels.filter(channel => {
      const hasRequiredFields = channel &&
        typeof channel.id !== 'undefined' &&
        (channel.channelName || channel.channelNumber);

      if (!hasRequiredFields) {
        console.warn("Invalid channel found:", channel);
      }

      return hasRequiredFields;
    });

    return validChannels;
  } catch (error) {
    console.error("Error fetching channels from database:", error);
    return [];
  }
}

async function getSystemContext() {
  try {
    const [channels, tvs, chromecasts] = await Promise.all([
      getAllChannelsFromDB(),
      getHospitalityTVs(),
      getChromecastDevices()
    ]);

    const channelOnline = channels.filter(c => channelStatus.get(c.id)?.status === 'online').length;
    const tvOnline = Array.from(tvStatus.values()).filter(s => s.status === 'online').length;
    const chromecastOnline = Array.from(chromecastStatus.values()).filter(s => s.isOnline).length;

    return {
      totalChannels: channels.length,
      channelOnline,
      channelOffline: channels.length - channelOnline,
      totalTVs: tvs.length,
      tvOnline,
      tvOffline: tvs.length - tvOnline,
      totalChromecasts: chromecasts.length,
      chromecastOnline,
      chromecastOffline: chromecasts.length - chromecastOnline,
    };
  } catch (error) {
    console.error('Error getting system context:', error);
    return null;
  }
}

async function findChannelByIdentifier(allChannels, identifier) {
  if (!identifier || !allChannels || allChannels.length === 0) {
    return null;
  }

  let channel = null;
  const searchStrategies = [
    identifier,
    decodeURIComponent(identifier),
    identifier.replace(/%20/g, ' '),
    identifier.replace(/\+/g, ' '),
    identifier.replace(/_/g, ' '),
    identifier.replace(/-/g, ' '),
  ];

  const uniqueStrategies = [...new Set(searchStrategies.filter(Boolean))];

  console.log('Search strategies for identifier:', identifier, uniqueStrategies);

  for (const searchTerm of uniqueStrategies) {
    if (channel) break;

    console.log('Trying search term:', searchTerm);

    if (/^\d+$/.test(searchTerm)) {
      const numericSearch = parseInt(searchTerm);
      channel = allChannels.find(c => c.channelNumber === numericSearch);
      if (channel) {
        console.log('Found by channelNumber:', channel.channelNumber);
        break;
      }
    }

    channel = allChannels.find(c =>
      c.channelName && c.channelName.toLowerCase() === searchTerm.toLowerCase()
    );
    if (channel) {
      console.log('Found by exact channelName:', channel.channelName);
      break;
    }

    const searchSlug = searchTerm.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    channel = allChannels.find(c => {
      if (!c.channelName) return false;
      const channelSlug = c.channelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return channelSlug === searchSlug;
    });
    if (channel) {
      console.log('Found by slug match:', channel.channelName, 'slug:', searchSlug);
      break;
    }

    channel = allChannels.find(c =>
      c.channelName && (
        c.channelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(c.channelName.toLowerCase())
      )
    );
    if (channel) {
      console.log('Found by partial match:', channel.channelName);
      break;
    }

    if (/^\d+$/.test(searchTerm)) {
      const numericSearch = parseInt(searchTerm);
      channel = allChannels.find(c => c.id === numericSearch);
      if (channel) {
        console.log('Found by database ID:', channel.id);
        break;
      }
    }
  }
  console.log('Final result for identifier', identifier, ':', channel ? channel.channelName : 'NOT FOUND');
  return channel;
}

function findRelevantFAQs(query, limit = 3) {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(' ').filter(word => word.length > 2);

  const scored = FAQ_DATA.map(faq => {
    let score = 0;
    const searchText = `${faq.device} ${faq.issue} ${faq.solutions.join(' ')}`.toLowerCase();

    // Keyword matching
    keywords.forEach(keyword => {
      if (searchText.includes(keyword)) score += 1;
      if (faq.device.toLowerCase().includes(keyword)) score += 3;
      if (faq.issue.toLowerCase().includes(keyword)) score += 5;
    });

    // Device exact match dengan prioritas lebih tinggi
    if (queryLower.includes('chromecast') && faq.device === 'Chromecast') score += 10;
    if (queryLower.includes('iptv') && faq.device === 'IPTV') score += 10;
    if (queryLower.includes('tv') && faq.device === 'IPTV') score += 8;
    if (queryLower.includes('channel') && faq.device === 'Channel') score += 10;

    // Boost untuk error keywords yang spesifik
    if (queryLower.includes('black screen') && faq.id === 10) score += 15;
    if (queryLower.includes('no device found') && faq.id === 1) score += 15;
    if (queryLower.includes('offline') && queryLower.includes('chromecast') && faq.id === 1) score += 12;
    if (queryLower.includes('offline') && (queryLower.includes('tv') || queryLower.includes('kamar')) && faq.id === 3) score += 12;

    // Status query penalty
    const isStatusQuery = (queryLower.includes('cek') || queryLower.includes('status') ||
      queryLower.includes('mana saja') || queryLower.includes('berapa')) &&
      !queryLower.includes('cara') && !queryLower.includes('bagaimana');
    if (isStatusQuery) {
      score = Math.max(0, score - 5);
    }

    return { ...faq, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ==================== FAQ DATA CATEGORY ====================

const FAQ_DATA = [
  {
    id: 1,
    category: "Kategori-1",
    device: "Chromecast",
    issue: "No Device Found Chromecast",
    solutions: [
      "Deactive White list profile",
      "Restart Chromecast & WIFI",
      "Radisson Guest Must Be Login",
      "Forget WIFI Radisson Guest",
      "Logout WIFI (log-out.me)",
    ],
    detailedSteps: [
      "Buka aplikasi Google Home di perangkat iOS Anda",
      "Pastikan Chromecast dan perangkat iOS terhubung ke jaringan WiFi yang sama",
      "Di pengaturan iPhone, buka Settings > Privacy & Security > Local Network",
      "Aktifkan akses Local Network untuk aplikasi Google Home",
      "Logout dari WiFi Radisson Guest, lalu login kembali dengan kredensial yang benar",
      "Restart Chromecast dengan mencabut dan memasang kembali adaptor daya",
      "Buka browser dan akses log-out.me untuk memastikan tidak ada session yang konflik",
      "Coba setup Chromecast kembali melalui aplikasi Google Home",
    ],
    troubleshooting: [
      "Jika masih tidak terdeteksi, coba reset Chromecast ke pengaturan pabrik",
      "Pastikan tidak ada VPN yang aktif di perangkat iOS",
      "Periksa apakah firewall hotel memblokir koneksi Chromecast",
    ],
    actionType: "System",
    priority: "High",
    slug: "no-device-found-chromecast",
  },
  {
    id: 2,
    category: "Kategori-2",
    device: "IPTV",
    issue: "Weak Or No Signal",
    solutions: [
      "Periksa koneksi LAN pada TV",
      "Pastikan sumber HDMI diatur ke HDMI-1",
      "Restart perangkat IPTV",
      "Periksa indikator LED pada box IPTV",
    ],
    detailedSteps: [
      "Periksa apakah kabel LAN terpasang dengan kuat ke port yang benar",
      "Pastikan kabel LAN terhubung ke port 'LAN IN' bukan 'LAN OUT'",
      "Pada remote TV, tekan tombol 'Source' atau 'Input'",
      "Pilih HDMI-1 sebagai sumber input",
      "Cabut adaptor daya box IPTV selama 10 detik, lalu pasang kembali",
      "Tunggu hingga indikator LED berubah menjadi hijau (sekitar 2-3 menit)",
      "Jika LED masih merah atau berkedip, periksa koneksi internet",
      "Test koneksi dengan mengganti kabel LAN jika tersedia",
    ],
    troubleshooting: [
      "Jika masih lemah, periksa kabel LAN apakah ada kerusakan fisik",
      "Pastikan tidak ada bending yang berlebihan pada kabel",
      "Coba gunakan port LAN yang berbeda jika tersedia di wall outlet",
    ],
    actionType: "On Site",
    priority: "Medium",
    slug: "weak-or-no-signal",
  },
  {
    id: 3,
    category: "Kategori-3",
    device: "IPTV",
    issue: "Unplug LAN TV",
    solutions: [
      "Periksa koneksi LAN (pastikan terpasang di LAN IN)",
      "Posisikan kabel LAN dengan benar",
      "Pastikan tidak terpasang di LAN OUT",
      "Test koneksi dengan kabel LAN lain",
    ],
    detailedSteps: [
      "Matikan TV dan box IPTV terlebih dahulu",
      "Lepaskan kabel LAN dari box IPTV",
      "Periksa port pada box IPTV, cari tulisan 'LAN IN' atau 'ETHERNET IN'",
      "Pastikan kabel LAN dipasang ke port 'LAN IN', bukan 'LAN OUT'",
      "Tekan kabel hingga terdengar bunyi 'click' yang menandakan terpasang kuat",
      "Periksa ujung kabel yang terhubung ke wall outlet juga terpasang dengan kuat",
      "Nyalakan kembali box IPTV dan tunggu proses booting selesai",
      "Nyalakan TV dan atur input ke HDMI-1",
      "Jika masih bermasalah, coba gunakan kabel LAN cadangan",
    ],
    troubleshooting: [
      "Periksa apakah ada kerusakan pada konektor RJ45",
      "Pastikan tidak ada dust atau kotoran di dalam port",
      "Jika tersedia, test dengan kabel LAN yang berbeda",
    ],
    actionType: "On Site",
    priority: "High",
    slug: "unplug-lan-tv",
  },
  {
    id: 4,
    category: "Kategori-4",
    device: "Chromecast",
    issue: "Chromecast Setup iOS",
    solutions: [
      "Install Google Home app",
      "Pastikan perangkat dalam satu jaringan WiFi",
      "Allow local network access pada iPhone",
      "Follow setup wizard di aplikasi",
    ],
    detailedSteps: [
      "Download dan install aplikasi Google Home dari App Store",
      "Pastikan Chromecast terhubung ke TV via HDMI dan mendapat daya",
      "Buka Settings di iPhone > Privacy & Security > Local Network",
      "Aktifkan toggle untuk aplikasi Google Home",
      "Buka aplikasi Google Home dan sign in dengan akun Google",
      "Tap tombol '+' untuk menambah perangkat baru",
      "Pilih 'Set up device' > 'New devices'",
      "Pilih rumah/lokasi tempat Chromecast akan disetup",
      "Aplikasi akan mencari Chromecast di sekitar",
      "Ikuti instruksi on-screen untuk menyelesaikan setup",
      "Sambungkan Chromecast ke WiFi 'Radisson Guest'",
      "Masukkan password WiFi jika diminta",
    ],
    troubleshooting: [
      "Jika Chromecast tidak terdeteksi, restart aplikasi Google Home",
      "Pastikan iPhone dan Chromecast terhubung ke WiFi yang sama",
      "Jika setup gagal, reset Chromecast dengan menekan tombol di device selama 25 detik",
    ],
    actionType: "System",
    priority: "Medium",
    slug: "chromecast-setup-ios",
  },
  {
    id: 5,
    category: "Kategori-5",
    device: "Channel",
    issue: "Error Playing",
    solutions: [
      "Channel issue dari Biznet (Testing VIA VLC)",
      "Restart streaming service",
      "Check network bandwidth and stability",
      "Update codec or media player",
    ],
    detailedSteps: [
      "Buka aplikasi VLC Media Player",
      "Pilih menu 'Media' > 'Open Network Stream'",
      "Masukkan URL channel yang bermasalah",
      "Klik 'Play' untuk test streaming",
      "Jika VLC bisa memutar, masalah ada di aplikasi IPTV",
      "Jika VLC tidak bisa, masalah ada di provider (Biznet)",
      "Hubungi technical support untuk konfirmasi channel",
      "Laporkan hasil test VLC ke tim support",
    ],
    troubleshooting: [
      "Coba channel lain untuk memastikan tidak ada masalah jaringan",
      "Periksa kecepatan internet dengan speed test",
      "Restart modem/router jika diperlukan",
    ],
    actionType: "System",
    priority: "Medium",
    slug: "error-playing",
  },
  {
    id: 6,
    category: "Kategori-6",
    device: "Channel",
    issue: "Error_Player_Error_Err",
    solutions: [
      "Hbrowser & Widget Solution incorrect",
      "Channel issue Biznet (Testing VLC)",
      "Update browser to latest version",
      "Clear browser cache and cookies",
    ],
    detailedSteps: [
      "Identifikasi jenis error yang muncul",
      "Periksa konfigurasi HBrowser di set-top box",
      "Buka menu pengaturan aplikasi IPTV",
      "Cari pengaturan 'Widget' atau 'Player Settings'",
      "Reset konfigurasi widget ke default",
      "Restart aplikasi IPTV setelah perubahan",
      "Test channel yang bermasalah",
      "Jika masih error, lakukan test dengan VLC seperti prosedur sebelumnya",
    ],
    troubleshooting: [
      "Backup konfigurasi sebelum melakukan reset",
      "Catat pengaturan yang berhasil untuk referensi",
      "Hubungi support jika error persisten setelah reset",
    ],
    actionType: "System",
    priority: "High",
    slug: "error-player-error",
  },
  {
    id: 7,
    category: "Kategori-7",
    device: "Channel",
    issue: "Connection_Failure",
    solutions: [
      "Reinstall Widget Solution",
      "Reload IGCMP",
      "Confirmed IP conflict, changed IP, issue resolved",
      "Check firewall settings and open required ports",
    ],
    detailedSteps: [
      "Identifikasi penyebab connection failure",
      "Periksa status koneksi internet",
      "Buka pengaturan jaringan di set-top box",
      "Catat IP address yang sedang digunakan",
      "Scan untuk IP conflict di jaringan",
      "Ubah IP address ke range yang available",
      "Restart set-top box dengan IP baru",
      "Reinstall widget solution jika diperlukan",
      "Reload IGCMP service",
      "Test koneksi channel setelah perubahan",
    ],
    troubleshooting: [
      "Gunakan IP scanner untuk detect conflict",
      "Dokumentasikan perubahan IP untuk referensi",
      "Monitor stabilitas koneksi setelah perubahan",
    ],
    actionType: "System",
    priority: "Medium",
    slug: "connection-failure",
  },
  {
    id: 8,
    category: "Kategori-8",
    device: "Chromecast",
    issue: "Reset Configuration",
    solutions: [
      "Restart Chromecast",
      "Reset Chromecast dibawa ke ruang server pencet tombol poer 10 Detik",
      "Factory reset melalui aplikasi Google Home",
      "Cabut kabel power selama 30 detik lalu hubungkan kembali",
    ],
    detailedSteps: [
      "Identifikasi masalah yang memerlukan reset",
      "Coba restart sederhana terlebih dahulu",
      "Cabut adaptor daya Chromecast selama 10 detik",
      "Pasang kembali adaptor daya",
      "Tunggu Chromecast boot up (LED akan berubah)",
      "Jika masalah persisten, lakukan factory reset",
      "Bawa Chromecast ke ruang server",
      "Tekan dan tahan tombol reset selama 10 detik",
      "LED akan berkedip menandakan proses reset",
      "Setup ulang Chromecast dari awal",
    ],
    troubleshooting: [
      "Backup pengaturan penting sebelum factory reset",
      "Siapkan kredensial WiFi untuk setup ulang",
      "Test fungsi basic setelah reset",
    ],
    actionType: "On Site",
    priority: "Low",
    slug: "reset-configuration",
  },
  {
    id: 9,
    category: "Kategori-9",
    device: "IPTV",
    issue: "No Device Logged",
    solutions: [
      "Pastikan Allow local Network pada Setingan iPhone",
      "Periksa pengaturan VPN dan Cast",
      "Restart aplikasi IPTV",
      "Pastikan perangkat dalam satu jaringan WiFi yang sama",
    ],
    detailedSteps: [
      "Buka Settings di iPhone",
      "Scroll ke bawah dan pilih Privacy & Security",
      "Tap Local Network",
      "Cari aplikasi yang memerlukan akses network (Google Home, dll)",
      "Aktifkan toggle untuk aplikasi tersebut",
      "Periksa apakah VPN sedang aktif di iPhone",
      "Jika VPN aktif, matikan sementara selama setup",
      "Restart aplikasi yang digunakan untuk casting",
      "Coba deteksi perangkat kembali",
    ],
    troubleshooting: [
      "Jika masih tidak terdeteksi, restart iPhone",
      "Pastikan perangkat target dan iPhone dalam jaringan WiFi yang sama",
      "Coba forget dan reconnect ke WiFi",
    ],
    actionType: "On Site",
    priority: "High",
    slug: "no-device-logged",
  },
  {
    id: 10,
    category: "Kategori-10",
    device: "Chromecast",
    issue: "Chromecast Black Screen",
    solutions: [
      "Chromecast Power Adaptor Rusak",
      "Check Adaptor Chromecast",
      "Coba port HDMI yang berbeda pada TV",
      "Periksa koneksi kabel HDMI",
    ],
    detailedSteps: [
      "Periksa LED indicator pada Chromecast",
      "Jika LED tidak menyala, periksa adaptor daya",
      "Coba gunakan adaptor daya yang berbeda (5V 1A minimum)",
      "Pastikan kabel micro USB tidak rusak",
      "Periksa koneksi HDMI ke TV",
      "Coba port HDMI yang berbeda di TV",
      "Restart TV dan ubah input source ke HDMI yang digunakan",
      "Jika masih black screen, coba reset Chromecast",
    ],
    troubleshooting: [
      "Jika LED berkedip, kemungkinan masalah koneksi WiFi",
      "Jika LED solid tapi layar hitam, periksa HDMI connection",
      "Coba Chromecast di TV lain untuk isolasi masalah",
    ],
    actionType: "System",
    priority: "Medium",
    slug: "chromecast-black-screen",
  },
  {
    id: 11,
    category: "Kategori-11",
    device: "Channel",
    issue: "Channel Not Found",
    solutions: [
      "LAN Out Terpasang bukan LAN In",
      "Verify correct cable connection (LAN In vs LAN Out)",
      "Refresh channel list or rescan channels",
      "Check IGMP configuration",
    ],
    detailedSteps: [
      "Periksa bagian belakang set-top box atau TV",
      "Cari port yang berlabel 'LAN IN' atau 'ETHERNET IN'",
      "Pastikan kabel LAN terpasang di port IN, bukan OUT",
      "Port OUT biasanya digunakan untuk daisy-chain ke device lain",
      "Lepaskan kabel dari port OUT jika salah pasang",
      "Pasang kabel ke port LAN IN dengan benar",
      "Tunggu beberapa saat hingga koneksi tersambung",
      "Restart aplikasi channel atau reboot set-top box",
    ],
    troubleshooting: [
      "Jika masih tidak ada channel, periksa konfigurasi IPTV",
      "Pastikan subscription channel masih aktif",
      "Hubungi technical support untuk verifikasi channel list",
    ],
    actionType: "System",
    priority: "Low",
    slug: "channel-not-found",
  },
];

// ==================== STATUS GENERATION FUNCTIONS ====================
function generateDummyChannelStatus() {
  const isOnline = Math.random() < CHANNEL_STATUS_CONFIG.ONLINE_PROBABILITY;

  if (!isOnline) {
    return {
      status: "offline",
      responseTime: null,
      error: ["Stream source unavailable", "Multicast timeout", "Encoder offline"][Math.floor(Math.random() * 3)],
      signalLevel: null,
      bitrate: null,
      networkStats: null
    };
  }

  const signalLevel = Math.floor(Math.random() *
    (CHANNEL_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.max - CHANNEL_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min + 1))
    + CHANNEL_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min;

  const responseTime = Math.floor(Math.random() *
    (CHANNEL_STATUS_CONFIG.RESPONSE_TIME_RANGE.max - CHANNEL_STATUS_CONFIG.RESPONSE_TIME_RANGE.min + 1))
    + CHANNEL_STATUS_CONFIG.RESPONSE_TIME_RANGE.min;

  const bitrate = Math.floor(Math.random() *
    (CHANNEL_STATUS_CONFIG.BITRATE_RANGE.max - CHANNEL_STATUS_CONFIG.BITRATE_RANGE.min + 1))
    + CHANNEL_STATUS_CONFIG.BITRATE_RANGE.min;

  return {
    status: "online",
    responseTime: responseTime,
    error: null,
    signalLevel: signalLevel,
    bitrate: bitrate,
    networkStats: {
      sent: (Math.random() * 15 + 5).toFixed(2), // 5-20 GB
      received: (Math.random() * 12 + 3).toFixed(2), // 3-15 GB  
      latency: Math.floor(Math.random() * 30) + 10, // 10-40ms
      jitter: Math.floor(Math.random() * 12) + 2, // 2-14ms
      ttl: Math.floor(Math.random() * 10) + 58, // 58-67
      packetLoss: parseFloat((Math.random() * 0.8).toFixed(2)), // 0-0.8%
      bandwidth: Math.floor(Math.random() * 80) + 40, // 40-120 Mbps
      hops: Math.floor(Math.random() * 18) + 8, // 8-25 hops
      signalStrength: signalLevel,
      bitrate: bitrate
    }
  };
}

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

  const signalLevel = isOnline ? Math.floor(Math.random() * 30) + 70 : null; // 70-100%
  const model = ["Samsung Hospitality"][Math.floor(Math.random() * 3)];

  return {
    status: isOnline ? "online" : "offline",
    responseTime,
    error: isOnline ? null : ["Device unreachable", "Network timeout", "Connection refused"][Math.floor(Math.random() * 3)],
    signalLevel,
    model,
    lastChecked: new Date().toISOString(),

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

function generateHistoricalNetworkData(timeRange, isOnline) {
  const now = new Date();
  const data = [];

  let points;
  let intervalMs;

  switch (timeRange) {
    case "1h":
      points = 60;
      intervalMs = 60000; // 1 minute intervals
      break;
    case "24h":
      points = 24;
      intervalMs = 3600000; // 1 hour intervals
      break;
    case "7d":
      points = 7;
      intervalMs = 86400000; // 1 day intervals
      break;
    default:
      points = 24;
      intervalMs = 3600000;
  }

  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * intervalMs);
    const timeStr =
      timeRange === "24h"
        ? `${String(time.getHours()).padStart(2, "0")}:00`
        : timeRange === "7d"
          ? time.toLocaleDateString()
          : `${String(time.getHours()).padStart(2, "0")}:${String(
            time.getMinutes()
          ).padStart(2, "0")}`;

    data.push({
      time: timeStr,
      latency: isOnline ? Math.floor(Math.random() * 20) + 10 : 0,
      bandwidth: isOnline ? Math.floor(Math.random() * 80) + 40 : 0,
      jitter: isOnline ? Math.floor(Math.random() * 8) + 1 : 0,
      packetLoss: isOnline ? parseFloat((Math.random() * 0.6).toFixed(2)) : 0,
      sent: isOnline ? parseFloat((Math.random() * 6 + 2).toFixed(2)) : 0,
      received: isOnline ? parseFloat((Math.random() * 5 + 1).toFixed(2)) : 0,
      hops: isOnline ? Math.floor(Math.random() * 10) + 8 : 0,
      signalStrength: isOnline ? Math.floor(Math.random() * 25) + 75 : 0,
      bitrate: isOnline ? Math.floor(Math.random() * 4000) + 3500 : 0,
    });
  }

  return data;
}

// ==================== CONNECTIVITY CHECK FUNCTIONS ====================
async function checkMulticastConnectivity(ipAddress, timeout = 5000) {
  if (CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 500 + 200)
    );
    return generateDummyChannelStatus();
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

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
          signalLevel: null,
          bitrate: null,
          networkStats: null
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
          signalLevel: Math.floor(Math.random() * 30) + 70, // 70-100%
          bitrate: Math.floor(Math.random() * 5000) + 3000, // 3000-8000 kbps
          networkStats: {
            sent: (Math.random() * 12 + 5).toFixed(2),
            received: (Math.random() * 10 + 3).toFixed(2),
            latency: responseTime,
            jitter: Math.floor(Math.random() * 8) + 1,
            ttl: Math.floor(Math.random() * 10) + 55,
            packetLoss: parseFloat((Math.random() * 0.8).toFixed(2)),
            bandwidth: Math.floor(Math.random() * 100) + 50,
            hops: Math.floor(Math.random() * 12) + 8,
            signalStrength: Math.floor(Math.random() * 30) + 70,
            bitrate: Math.floor(Math.random() * 5000) + 3000
          }
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
          signalLevel: null,
          bitrate: null,
          networkStats: null
        });
      }
    });
  });
}

async function checkTVConnectivity(ipAddress, timeout = 5000) {
  if (TV_STATUS_CONFIG.USE_DUMMY_STATUS) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 500 + 200)
    );
    return generateDummyTVStatus();
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

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

async function checkChromecastConnectivity(ipAddr, timeout = 5000) {
  if (CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 1000 + 500)
    );
    return generateDummyChromecastStatus();
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

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
        signalLevel: Math.floor(Math.random() * 60) - 80,
        speed: Math.floor(Math.random() * 90) + 10,
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

// ==================== STATUS CHECK FUNCTIONS ====================
async function checkAllChannelsStatus() {
  try {
    const allChannels = await getAllChannelsFromDB();
    const offlineNotifications = [];
    let onlineCount = 0;

    for (const channel of allChannels) {
      try {
        const previousStatus = channelStatus.get(channel.id)?.status;
        const result = await checkMulticastConnectivity(channel.ipMulticast);

        channelStatus.set(channel.id, {
          ...result,
          lastChecked: new Date().toISOString(),
        });

        if (result.status === "online") {
          onlineCount++;
        }

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

    if (offlineNotifications.length > 0 && telegramBot) {
      await telegramBot.sendOfflineNotification(offlineNotifications);
    }

    const offlineCount = allChannels.length - onlineCount;
    console.log(`Channel Status: ${onlineCount}/${allChannels.length} online, ${offlineCount} offline${CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS ? " (dummy)" : ""}`);
  } catch (error) {
    console.error("Error checking channels status:", error);
  }
}

async function checkAllTVsStatus() {
  try {
    const allTVs = await getHospitalityTVs();
    const offlineNotifications = [];
    let onlineCount = 0;

    for (const tv of allTVs) {
      try {
        const previousStatus = tvStatus.get(tv.roomNo)?.status;
        const result = await checkTVConnectivity(tv.ipAddress);

        tvStatus.set(tv.roomNo, {
          ...result,
          lastChecked: new Date().toISOString(),
          roomNo: tv.roomNo,
          ipAddress: tv.ipAddress,
        });

        if (result.status === "online") {
          onlineCount++;
        }

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

    if (offlineNotifications.length > 0 && telegramBot) {
      try {
        await telegramBot.sendOfflineNotification(offlineNotifications);
      } catch (telegramError) {
        console.error("Failed to send Telegram notifications:", telegramError.message);
      }
    }

    const offlineCount = allTVs.length - onlineCount;
    console.log(`TV Status: ${onlineCount}/${allTVs.length} online, ${offlineCount} offline${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? " (dummy)" : ""}`);

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

async function checkAllChromecastsStatus() {
  try {
    const allDevices = await getChromecastDevices();
    const offlineNotifications = [];
    let onlineCount = 0;

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
      }
    }

    if (offlineNotifications.length > 0 && telegramBot) {
      try {
        await telegramBot.sendOfflineNotification(offlineNotifications);
      } catch (telegramError) {
        console.error("Failed to send Telegram notifications:", telegramError.message);
      }
    }

    const offlineCount = allDevices.length - onlineCount;
    console.log(`Chromecast Status: ${onlineCount}/${allDevices.length} online, ${offlineCount} offline${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? " (dummy)" : ""}`);

    return {
      success: true,
      summary: {
        total: allDevices.length,
        online: onlineCount,
        offline: offlineCount,
        notificationsTriggered: offlineNotifications.length
      },
      notifications: offlineNotifications,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("Error in checkAllChromecastsStatus:", error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// ==================== AUTH ENDPOINTS ====================
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("=== LOGIN REQUEST START ===");
    console.log("Headers:", req.headers);
    console.log("Body:", {
      identifier: req.body.identifier,
      passwordLength: req.body.password ? req.body.password.length : 0
    });

    const { identifier, password } = req.body;

    if (!identifier || !password) {
      console.log("Missing credentials");
      return res.status(400).json({
        success: false,
        error: "Email/username and password are required",
      });
    }

    console.log("Authenticating user...");
    const result = await authenticateUser(identifier, password);
    console.log("Authentication result:", {
      success: result.success,
      userId: result.user?.id,
      username: result.user?.username,
      error: result.error
    });

    if (result.success && result.user) {
      const tokenPayload = {
        userId: result.user.id || result.user.userId,
        email: result.user.email,
        username: result.user.username,
        iat: Math.floor(Date.now() / 1000)
      };

      console.log("Creating token with payload:", tokenPayload);

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/"
      };

      console.log("Setting cookie with options:", cookieOptions);
      res.cookie("token", token, cookieOptions);

      const userResponse = {
        id: result.user.id || result.user.userId,
        username: result.user.username,
        email: result.user.email,
      };

      console.log("Login successful for user:", userResponse.username);
      console.log("=== LOGIN REQUEST END ===");

      res.json({
        success: true,
        user: userResponse,
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
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    console.log("Registration attempt:", {
      username: req.body.username,
      email: req.body.email,
    });

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Username, email, and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: "Username must be at least 3 characters long",
      });
    }

    const result = await createUser({ username, email, password });
    console.log("User creation result:", {
      success: result.success,
      userId: result.userId,
    });

    if (result.success && result.userId) {
      const token = jwt.sign(
        {
          userId: result.userId,
          email: email,
          username: username,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

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

app.post("/api/auth/logout", (req, res) => {
  try {
    console.log("=== LOGOUT REQUEST START ===");
    console.log("Current cookies:", req.cookies);

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

    console.log("All cookie configurations cleared");
    console.log("=== LOGOUT REQUEST END ===");

    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.json({
      success: true,
      message: "Logged out successfully",
      authenticated: false
    });
  }
});

// ==================== LIVE CHAT QUERY ENDPOINT ====================

app.post("/api/chat/query", authenticateToken, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    const lowerMsg = message.toLowerCase();

    // Status query detection (tetap seperti sebelumnya)
    const isSimpleStatusQuery = (
      (lowerMsg.includes('cek') || lowerMsg.includes('status') ||
        lowerMsg.includes('mana saja') || lowerMsg.includes('berapa')) &&
      !lowerMsg.includes('cara') && !lowerMsg.includes('bagaimana') &&
      !lowerMsg.includes('solusi') && !lowerMsg.includes('mengatasi') &&
      !lowerMsg.includes('masalah') && !lowerMsg.includes('perbaiki')
    );

    const systemContext = await getSystemContext();

    if (isSimpleStatusQuery) {
      let quickResponse = '';

      if (lowerMsg.includes('chromecast')) {
        quickResponse = `Saat ini ada ${systemContext.chromecastOffline} Chromecast offline dari total ${systemContext.totalChromecasts} device. Detail lengkap ada di dashboard.`;
      } else if (lowerMsg.includes('channel')) {
        quickResponse = `Saat ini ada ${systemContext.channelOffline} Channel offline dari total ${systemContext.totalChannels} channel.`;
      } else if (lowerMsg.includes('tv')) {
        quickResponse = `Saat ini ada ${systemContext.tvOffline} TV offline dari total ${systemContext.totalTVs} TV.`;
      } else {
        quickResponse = `Status: Channels ${systemContext.channelOnline}/${systemContext.totalChannels} online, TVs ${systemContext.tvOnline}/${systemContext.totalTVs} online, Chromecasts ${systemContext.chromecastOnline}/${systemContext.totalChromecasts} online`;
      }

      return res.json({
        success: true,
        response: quickResponse,
        detailedInfo: null,
        relatedFAQs: [],
        systemContext: systemContext,
        timestamp: new Date().toISOString()
      });
    }

    // Semua troubleshooting → ke AI
    const relatedFAQs = findRelevantFAQs(message.trim(), 3);
    const contextPrompt = buildGeminiPrompt(message, relatedFAQs, systemContext, conversationHistory);

    let aiResponse = '';
    let detailedInfo = null;

    try {
      aiResponse = await callGeminiAPI(contextPrompt);

      // TETAP attach detailed info untuk tombol "Lihat Detail Lengkap"
      if (relatedFAQs.length > 0 && relatedFAQs[0].score > 5) {
        const topFAQ = relatedFAQs[0];
        detailedInfo = {
          detailedSteps: topFAQ.detailedSteps || [],
          troubleshooting: topFAQ.troubleshooting || [],
          actionType: topFAQ.actionType,
          priority: topFAQ.priority
        };
      }
    } catch (aiError) {
      console.error('Gemini API error:', aiError);

      // Fallback natural (BUKAN format list)
      if (relatedFAQs.length > 0) {
        const topFAQ = relatedFAQs[0];
        aiResponse = `Untuk masalah ${topFAQ.device} ini, biasanya bisa dicoba: ${topFAQ.solutions.slice(0, 2).join(', atau ')}. Kalau masih belum solve, coba langkah lainnya di tombol Detail Lengkap.`;

        detailedInfo = {
          detailedSteps: topFAQ.detailedSteps || [],
          troubleshooting: topFAQ.troubleshooting || [],
          actionType: topFAQ.actionType,
          priority: topFAQ.priority
        };
      } else {
        aiResponse = 'Hmm, tidak ada solusi spesifik untuk kasus ini. Coba restart device dulu, atau hubungi technical support kalau masih bermasalah.';
      }
    }

    res.json({
      success: true,
      response: aiResponse,
      detailedInfo: detailedInfo,
      relatedFAQs: relatedFAQs.slice(0, 3).map(faq => ({
        id: faq.id,
        issue: faq.issue,
        device: faq.device,
        priority: faq.priority,
        slug: faq.slug,
        solutions: faq.solutions
      })),
      systemContext: systemContext,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint tambahan untuk get detailed FAQ
app.get("/api/chat/faq/:id", authenticateToken, async (req, res) => {
  try {
    const faqId = parseInt(req.params.id);
    const faq = FAQ_DATA.find(f => f.id === faqId);

    if (!faq) {
      return res.status(404).json({
        success: false,
        error: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      data: faq
    });
  } catch (error) {
    console.error('FAQ fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/chat/notification-query", authenticateToken, async (req, res) => {
  try {
    const { message, notificationId } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Jika ada notificationId, ambil detail notifikasi tersebut
    let notificationContext = '';
    if (notificationId) {
      // Di sini Anda bisa fetch detail notifikasi dari database
      // Untuk sekarang, kita gunakan info dari request
      notificationContext = `User sedang melihat notifikasi spesifik dengan ID: ${notificationId}. `;
    }

    const lowerMsg = message.toLowerCase();
    const relatedFAQs = findRelevantFAQs(message.trim(), 3);
    const systemContext = await getSystemContext();

    // Build prompt khusus untuk notification context
    let prompt = `${notificationContext}Kamu teknisi IPTV yang membantu analisis notifikasi sistem.

Pertanyaan: "${message}"

DATA SISTEM:
- Channels: ${systemContext?.channelOnline}/${systemContext?.totalChannels} online
- TVs: ${systemContext?.tvOnline}/${systemContext?.totalTVs} online
- Chromecasts: ${systemContext?.chromecastOnline}/${systemContext?.totalChromecasts} online

`;

    if (relatedFAQs.length > 0 && relatedFAQs[0].score > 3) {
      const faq = relatedFAQs[0];
      prompt += `\nSOLUSI YANG RELEVAN:
${faq.device} - ${faq.issue}
Biasanya: ${faq.solutions.slice(0, 2).join(', ')}

`;
    }

    prompt += `Jawab dengan natural dan langsung. Fokus pada:
1. Analisis masalah dari notifikasi
2. Root cause yang mungkin
3. Solusi praktis yang bisa dicoba
4. Preventive action

Maksimal 4-5 kalimat, to the point.

Jawab:`;

    const aiResponse = await callGeminiAPI(prompt);

    let detailedInfo = null;
    if (relatedFAQs.length > 0 && relatedFAQs[0].score > 5) {
      const topFAQ = relatedFAQs[0];
      detailedInfo = {
        detailedSteps: topFAQ.detailedSteps || [],
        troubleshooting: topFAQ.troubleshooting || [],
        actionType: topFAQ.actionType,
        priority: topFAQ.priority
      };
    }

    res.json({
      success: true,
      response: aiResponse,
      detailedInfo: detailedInfo,
      relatedFAQs: relatedFAQs.slice(0, 3).map(faq => ({
        id: faq.id,
        issue: faq.issue,
        device: faq.device,
        priority: faq.priority,
        slug: faq.slug
      })),
      systemContext: systemContext,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Notification query error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Gagal memproses query notifikasi'
    });
  }
});

// ==================== GEMINI AI FUNCTIONS ====================

function buildGeminiPrompt(userMessage, relatedFAQs, systemContext, conversationHistory) {
  const lowerMsg = userMessage.toLowerCase();

  // Detect TV/Chromecast/Channel analysis query
  const isDeviceAnalysis =
    lowerMsg.includes('analisis kondisi') ||
    lowerMsg.includes('trend network') ||
    (lowerMsg.includes('status online') && (lowerMsg.includes('tv') || lowerMsg.includes('chromecast'))) ||
    (lowerMsg.includes('status offline') && (lowerMsg.includes('tv') || lowerMsg.includes('chromecast'))) ||
    (lowerMsg.includes('channel') && lowerMsg.includes('status online')) ||
    (lowerMsg.includes('channel') && lowerMsg.includes('status offline'));

  if (isDeviceAnalysis) {
    const isOnline = lowerMsg.includes('status online');

    if (isOnline) {
      return `Kamu teknisi IPTV senior yang sedang review device monitoring data.

  ${userMessage}

  Berikan analisis mendalam dengan struktur:
  1. Assessment trend network (latency/bandwidth/packet loss naik/turun signifikan atau tidak)
  2. Evaluasi signal strength dan response time (bagus/concern/critical)
  3. Identifikasi potential bottleneck atau degradation pattern
  4. Rekomendasi preventive atau corrective action yang spesifik

  Jawab dalam 5-7 kalimat yang insightful, fokus ke interpretasi data bukan repeat angka. Kalau ada concern wajib sebut apa risikonya.`;
    } else {
      return `Kamu teknisi IPTV senior yang troubleshooting device offline.

  ${userMessage}

  Berikan analisis troubleshooting dengan struktur:
  1. Identifikasi most likely root cause dari symptoms yang ada
  2. Prioritas troubleshooting steps (mulai dari simplest/quickest)
  3. Expected result dari tiap step
  4. Escalation path kalau basic troubleshooting gagal

  Jawab dalam 6-8 kalimat yang actionable, fokus ke diagnostic logic dan practical steps.`;
    }
  }

  // Standard troubleshooting query
  let knowledgeContext = '';
  if (relatedFAQs.length > 0) {
    const faq = relatedFAQs[0];
    knowledgeContext = `\nContext: Issue ${faq.issue} biasanya solved dengan ${faq.solutions[0]}.`;
  }

  return `Kamu teknisi IPTV yang ngobrol santai tapi informatif.

  ${knowledgeContext}

  Pertanyaan: "${userMessage}"

  Jawab natural 3-4 kalimat, langsung kasih solusi praktis tanpa format list atau bold berlebihan.`;
}

async function callGeminiAPI(prompt) {
  const apiKey = GEMINI_CONFIG.apiKey;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured in environment variables');
  }

  try {
    const response = await axios.post(
      `${GEMINI_CONFIG.endpoint}?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 detik timeout
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('Invalid Gemini API response structure');
  } catch (error) {
    if (error.response) {
      console.error('Gemini API error response:', error.response.data);
      throw new Error(`Gemini API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new Error('Gemini API no response received - check internet connection');
    } else {
      throw error;
    }
  }
}

// ==================== CHANNEL ENDPOINTS ====================
app.get("/api/channels", trackRequestMetrics('channels'), authenticateToken, async (req, res) => {
  try {
    const {
      type,
      sortBy = "channelNumber",
      sortOrder = "asc",
      search,
      status,
      category
    } = req.query;

    let channels = [];

    if (type === "international") {
      channels = await getInternationalChannels();
    } else if (type === "local") {
      channels = await getLocalChannels();
    } else {
      channels = await getAllChannelsFromDB();
    }

    if (!Array.isArray(channels)) {
      console.error("Channels is not an array:", typeof channels);
      return res.status(500).json({
        success: false,
        message: "Invalid channels data structure",
        error: "INVALID_DATA_STRUCTURE"
      });
    }

    const channelsWithStatus = channels.map((channel) => {
      const statusData = channelStatus.get(channel.id) || {
        status: "offline",
        responseTime: null,
        lastChecked: null,
        error: "Not checked",
        signalLevel: null,
        bitrate: null,
        networkStats: null
      };

      const generateSlug = (name) => {
        if (!name) return null;
        return name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/--+/g, '-')
          .replace(/^-|-$/g, '');
      };

      let channelType = "unknown";
      try {
        if (type === "international") {
          channelType = "international";
        } else if (type === "local") {
          channelType = "local";
        } else {
          channelType = "local";
        }
      } catch (error) {
        console.error("Error determining channel type:", error);
        channelType = "unknown";
      }

      return {
        ...channel,
        ...statusData,
        type: channelType,
        isOnline: statusData.status === "online",
        isPingable: statusData.status === "online",
        statusText: statusData.status === "online" ? "Online" : "Offline",
        slug: generateSlug(channel.channelName),
        urlSlug: generateSlug(channel.channelName) || channel.id.toString()
      };
    });

    let filteredChannels = channelsWithStatus;

    if (status && status !== "all") {
      if (status === "online") {
        filteredChannels = filteredChannels.filter(c => c.status === "online");
      } else if (status === "offline") {
        filteredChannels = filteredChannels.filter(c => c.status === "offline");
      }
    }

    if (category && category !== "all") {
      filteredChannels = filteredChannels.filter(c =>
        c.category && c.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (search) {
      const searchTerm = search.toLowerCase();
      filteredChannels = filteredChannels.filter(channel =>
        (channel.channelName && channel.channelName.toLowerCase().includes(searchTerm)) ||
        (channel.channelNumber && channel.channelNumber.toString().includes(searchTerm)) ||
        (channel.category && channel.category.toLowerCase().includes(searchTerm)) ||
        (channel.ipMulticast && channel.ipMulticast.toLowerCase().includes(searchTerm))
      );
    }

    filteredChannels.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === "channelNumber") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
        }
      }

      if (sortBy === "responseTime") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === "desc") {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    const summary = {
      totalCount: filteredChannels.length,
      onlineCount: filteredChannels.filter(c => c.status === "online").length,
      offlineCount: filteredChannels.filter(c => c.status === "offline").length,
      avgResponseTime: filteredChannels.filter(c => c.responseTime && c.status === "online")
        .reduce((sum, c) => sum + c.responseTime, 0) /
        Math.max(1, filteredChannels.filter(c => c.responseTime && c.status === "online").length),
      categoryBreakdown: filteredChannels.reduce((acc, channel) => {
        const category = channel.category || "Unknown";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: filteredChannels,
      summary,
      ...summary,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channels",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/channels/:id", authenticateToken, async (req, res) => {
  try {
    const rawChannelId = req.params.id;

    console.log('Fetching channel with ID:', rawChannelId);

    if (!rawChannelId || rawChannelId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel identifier is required",
        error: "INVALID_CHANNEL_ID"
      });
    }

    const allChannels = await getAllChannelsFromDB();
    const channel = await findChannelByIdentifier(allChannels, rawChannelId);

    if (!channel) {
      const suggestions = allChannels.slice(0, 5).map(c => ({
        id: c.id,
        channelNumber: c.channelNumber,
        channelName: c.channelName,
        slug: c.channelName ? c.channelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : null
      }));

      return res.status(404).json({
        success: false,
        message: `Channel not found for identifier: "${rawChannelId}"`,
        error: "CHANNEL_NOT_FOUND",
        details: {
          searchedFor: rawChannelId,
          suggestions: suggestions,
          totalChannels: allChannels.length,
          searchHint: "You can search by: Channel Number (5), Channel Name ('CGTN News HD'), or URL slug ('cgtn-news-hd')"
        }
      });
    }

    const status = channelStatus.get(channel.id) || {
      status: "offline",
      responseTime: null,
      lastChecked: null,
      error: "Not checked",
      signalLevel: null,
      bitrate: null,
      networkStats: null
    };

    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(
      (c) => c.id === channel.id
    ) ? "international" : "local";

    const enhancedChannel = {
      ...channel,
      ...status,
      type: channelType,
      slug: channel.channelName ? channel.channelName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') : null,
      isOnline: status.status === "online",
      isPingable: status.status === "online",
      statusText: status.status === "online" ? "Online" : "Offline"
    };

    res.json({
      success: true,
      data: enhancedChannel,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching channel:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/channels/:id/check", authenticateToken, async (req, res) => {
  try {
    const rawChannelId = req.params.id;

    if (!rawChannelId || rawChannelId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel identifier is required",
        error: "INVALID_CHANNEL_ID"
      });
    }

    const allChannels = await getAllChannelsFromDB();
    const channel = await findChannelByIdentifier(allChannels, rawChannelId);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: `Channel not found`,
        error: "CHANNEL_NOT_FOUND",
        details: {
          searchedFor: rawChannelId
        }
      });
    }

    if (!channel.ipMulticast) {
      return res.status(400).json({
        success: false,
        message: "Channel IP Multicast not available for connectivity check",
        error: "NO_IP_MULTICAST"
      });
    }

    console.log(`Checking connectivity for channel: ${channel.channelName || channel.channelNumber} (${channel.ipMulticast})`);

    const result = await checkMulticastConnectivity(channel.ipMulticast);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    channelStatus.set(channel.id, statusInfo);

    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(
      (c) => c.id === channel.id
    ) ? "international" : "local";

    console.log(`Channel check completed: ${channel.channelName || channel.channelNumber} - ${result.status}`);

    const enhancedResponse = {
      ...channel,
      ...statusInfo,
      type: channelType,
      isOnline: result.status === "online",
      isPingable: result.status === "online",
      statusText: result.status === "online" ? "Online" : "Offline"
    };

    res.json({
      success: true,
      message: "Channel status checked successfully",
      data: enhancedResponse,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking channel status:", error);

    let errorMessage = "Internal server error while checking channel status";
    let statusCode = 500;

    if (error.message.includes("timeout")) {
      errorMessage = "Channel connection timeout";
      statusCode = 408;
    } else if (error.message.includes("unreachable")) {
      errorMessage = "Channel unreachable";
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

app.get("/api/channels/:id/metrics", authenticateToken, async (req, res) => {
  try {
    const rawChannelId = req.params.id;

    if (!rawChannelId || rawChannelId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel identifier is required",
        error: "INVALID_CHANNEL_ID"
      });
    }

    const allChannels = await getAllChannelsFromDB();
    const channel = await findChannelByIdentifier(allChannels, rawChannelId);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
        error: "CHANNEL_NOT_FOUND"
      });
    }

    const status = channelStatus.get(channel.id) || {
      status: "offline",
      networkStats: null
    };

    if (!status.networkStats) {
      const fallbackMetrics = {
        sent: "0.0",
        received: "0.0",
        latency: 0,
        jitter: 0,
        ttl: 0,
        packetLoss: 0,
        bandwidth: 0,
        hops: 0,
        signalStrength: 0,
        bitrate: 0
      };

      return res.json({
        success: true,
        data: fallbackMetrics,
        message: "Using fallback metrics data",
        fetchedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: status.networkStats,
      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching channel metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channel metrics",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/channels/:id/history", authenticateToken, async (req, res) => {
  try {
    const rawChannelId = req.params.id;
    const { timeRange = "24h" } = req.query;

    if (!rawChannelId || rawChannelId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel identifier is required",
        error: "INVALID_CHANNEL_ID"
      });
    }

    const allChannels = await getAllChannelsFromDB();
    const channel = await findChannelByIdentifier(allChannels, rawChannelId);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
        error: "CHANNEL_NOT_FOUND"
      });
    }

    const status = channelStatus.get(channel.id) || { status: "offline" };
    const isOnline = status.status === "online";
    const historicalData = generateHistoricalNetworkData(timeRange, isOnline);

    res.json({
      success: true,
      data: historicalData,
      timeRange: timeRange,
      channelId: channel.id,
      channelName: channel.channelName,
      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching channel history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching channel history",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get(
  "/api/channels/dashboard/stats",
  trackRequestMetrics('channels'),
  authenticateToken,
  async (req, res) => {
    try {
      const allChannels = await getAllChannelsFromDB();
      const internationalChannels = await getInternationalChannels();
      const localChannels = await getLocalChannels();

      const totalChannels = allChannels.length;

      let onlineChannels = 0;
      let offlineChannels = 0;

      allChannels.forEach(channel => {
        const status = channelStatus.get(channel.id);
        if (status && status.status === "online") {
          onlineChannels++;
        } else {
          offlineChannels++;
        }
      });

      const uptime =
        totalChannels > 0
          ? ((onlineChannels / totalChannels) * 100).toFixed(1)
          : "0.0";

      const categoryStats = {};
      allChannels.forEach((channel) => {
        const category = channel.category || "Unknown";
        if (!categoryStats[category]) {
          categoryStats[category] = { total: 0, online: 0, offline: 0 };
        }
        categoryStats[category].total++;

        const status = channelStatus.get(channel.id);
        if (status && status.status === "online") {
          categoryStats[category].online++;
        } else {
          categoryStats[category].offline++;
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
app.get("/api/hospitality/tvs", trackRequestMetrics('hospitality'), authenticateToken, async (req, res) => {
  try {
    const {
      status,
      search,
      sortBy = "roomNo",
      sortOrder = "asc",
    } = req.query;

    let tvs = await getHospitalityTVs();


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
        statusText: tvStatusData.status === "online" ? "Online" : "Offline",
        signalQuality: tvStatusData.signalLevel ?
          (tvStatusData.signalLevel > 85 ? "Excellent" :
            tvStatusData.signalLevel > 70 ? "Good" :
              tvStatusData.signalLevel > 50 ? "Fair" : "Poor") : null,
        lastCheckedFormatted: tvStatusData.lastChecked ?
          new Date(tvStatusData.lastChecked).toLocaleString() : "Never"
      };
    });

    let filteredTVs = tvsWithStatus;
    if (status && status !== "all") {
      if (status === "online") {
        filteredTVs = tvsWithStatus.filter((tv) => tv.status === "online");
      } else if (status === "offline") {
        filteredTVs = tvsWithStatus.filter((tv) => tv.status === "offline");
      }
    }

    if (search) {
      const searchTerm = search.toLowerCase();
      filteredTVs = filteredTVs.filter(
        (tv) =>
          (tv.roomNo && tv.roomNo.toLowerCase().includes(searchTerm)) ||
          (tv.ipAddress && tv.ipAddress.toLowerCase().includes(searchTerm)) ||
          (tv.model && tv.model.toLowerCase().includes(searchTerm))
      );
    }

    filteredTVs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === "roomNo") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
        }
      }

      if (sortBy === "responseTime") {
        const aNum = parseInt(aValue) || 0;
        const bNum = parseInt(bValue) || 0;
        return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
      }

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
      ...summary,
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

    for (const searchTerm of uniqueStrategies) {
      if (tv) break;

      console.log(`Trying search term: "${searchTerm}"`);

      tv = allTVs.find(d => d.roomNo === searchTerm);
      if (tv) {
        console.log('Found by exact room match');
        break;
      }

      tv = allTVs.find(d =>
        d.roomNo && d.roomNo.toLowerCase() === searchTerm.toLowerCase()
      );
      if (tv) {
        console.log('Found by case-insensitive room match');
        break;
      }

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

      if (/^\d+$/.test(searchTerm)) {
        tv = allTVs.find(d => d.id && d.id.toString() === searchTerm);
        if (tv) {
          console.log('Found by ID match');
          break;
        }
      }
      if (/^[0-9a-fA-F]{24}$/.test(searchTerm)) {
        try {
          tv = await getHospitalityTVByRoomNo(searchTerm);
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

    const tvStatusData = tvStatus.get(tv.roomNo) || {
      status: "offline",
      responseTime: null,
      error: "Not checked",
      lastChecked: null,
    };

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

    const result = await checkTVConnectivity(tv.ipAddress);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    tvStatus.set(tv.roomNo, statusInfo);

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

      const uptime = totalTVs > 0 ? ((onlineTVs / totalTVs) * 100).toFixed(1) : "0.0";

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

      const onlineStatusList = statusArray.filter(s => s.status === "online");
      const avgResponseTime = onlineStatusList.length > 0
        ? (onlineStatusList.reduce((sum, s) => sum + (s.responseTime || 0), 0) / onlineStatusList.length).toFixed(1)
        : null;

      const avgSignalLevel = onlineStatusList.length > 0
        ? (onlineStatusList.reduce((sum, s) => sum + (s.signalLevel || 0), 0) / onlineStatusList.length).toFixed(1)
        : null;

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
app.get("/api/chromecast", trackRequestMetrics('chromecast'), authenticateToken, async (req, res) => {
  try {
    const {
      status,
      search,
      sortBy = "deviceName",
      sortOrder = "asc",
    } = req.query;

    let devices = await getChromecastDevices();

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

    if (search) {
      const searchTerm = search.toLowerCase();
      filteredDevices = filteredDevices.filter(
        (device) =>
          (device.deviceName &&
            device.deviceName.toLowerCase().includes(searchTerm)) ||
          (device.ipAddr && device.ipAddr.toLowerCase().includes(searchTerm))
      );
    }

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
      onlineCount: filteredDevices.filter((d) => d.isOnline).length,
      offlineCount: filteredDevices.filter((d) => !d.isOnline).length,
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

    for (const searchTerm of uniqueStrategies) {
      if (device) break;

      console.log(`Trying search term: "${searchTerm}"`);

      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) {
        console.log('Found by exact name match');
        break;
      }

      device = allDevices.find(d =>
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) {
        console.log('Found by case-insensitive name match');
        break;
      }

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

      if (/^\d+$/.test(searchTerm)) {
        device = allDevices.find(d => d.idCast.toString() === searchTerm);
        if (device) {
          console.log('Found by ID match');
          break;
        }
      }

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

    const enhancedDevice = {
      ...device,
      ...deviceStatus,
      id: device.idCast,
      type: device.type || "Chromecast",
      model: device.model || "Google Chromecast",
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

    const result = await checkChromecastConnectivity(device.ipAddr);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
      checkDuration: Date.now() - Date.now()
    };

    chromecastStatus.set(device.idCast, statusInfo);
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

app.get("/api/chromecast/:id/metrics", authenticateToken, async (req, res) => {
  try {
    const rawDeviceId = req.params.id;

    if (!rawDeviceId || rawDeviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Chromecast device identifier is required",
        error: "INVALID_DEVICE_ID"
      });
    }

    let device = null;
    const allDevices = await getChromecastDevices();

    // Enhanced search strategies similar to channel and hospitality endpoints
    const decodingStrategies = [
      rawDeviceId,
      decodeURIComponent(rawDeviceId),
      rawDeviceId.replace(/%20/g, ' '),
      rawDeviceId.replace(/\+/g, ' '),
      rawDeviceId.replace(/_/g, ' '),
      rawDeviceId.replace(/-/g, ' '),
    ];

    const uniqueStrategies = [...new Set(decodingStrategies)];

    for (const searchTerm of uniqueStrategies) {
      if (device) break;

      // Exact match by device name
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) {
        break;
      }

      // Case-insensitive match by device name
      device = allDevices.find(d =>
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) {
        break;
      }

      // Partial match by device name
      device = allDevices.find(d =>
        d.deviceName && (
          d.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(d.deviceName.toLowerCase())
        )
      );
      if (device) {
        break;
      }

      // Numeric search by idCast
      if (/^\d+$/.test(searchTerm)) {
        const numericSearch = parseInt(searchTerm);
        device = allDevices.find(d => d.idCast === numericSearch);
        if (device) {
          break;
        }
        device = allDevices.find(d => d.id && d.id.toString() === searchTerm);
        if (device) {
          break;
        }
      }
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: `Chromecast device "${rawDeviceId}" not found`,
        error: "DEVICE_NOT_FOUND"
      });
    }

    if (!device.ipAddr) {
      return res.status(400).json({
        success: false,
        message: "Chromecast device IP address not available for connectivity check",
        error: "NO_IP_ADDRESS"
      });
    }

    // Perform real-time connectivity check
    const result = await checkChromecastConnectivity(device.ipAddr);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString(),
    };

    // Update device status in memory
    chromecastStatus.set(device.idCast, statusInfo);

    // Enhanced response with network stats integration
    let networkStats = null;

    if (result.isOnline && CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
      // Generate realistic network stats when device is online
      networkStats = {
        sent: (Math.random() * 8 + 2).toFixed(2), // 2-10 GB
        received: (Math.random() * 6 + 1).toFixed(2), // 1-7 GB
        latency: result.responseTime || Math.floor(Math.random() * 40) + 8, // 8-48ms
        jitter: Math.floor(Math.random() * 15) + 1, // 1-16ms
        ttl: Math.floor(Math.random() * 8) + 60, // 60-67
        packetLoss: parseFloat((Math.random() * 1.5).toFixed(2)), // 0-1.5%
        bandwidth: Math.floor(Math.random() * 60) + 30, // 30-90 Mbps
        hops: Math.floor(Math.random() * 15) + 12, // 12-26 hops
        signalStrength: result.signalLevel || Math.floor(Math.random() * 50) - 70, // -70 to -20 dBm
        speed: result.speed || Math.max(1, (result.signalLevel || -50) + Math.floor(Math.random() * 20) - 10)
      };
    }

    const enhancedResponse = {
      ...device,
      ...statusInfo,
      id: device.idCast,
      deviceName: device.deviceName,
      isOnline: result.isOnline,
      isPingable: result.isPingable,
      statusText: result.isOnline ? "Online" : "Offline",
      networkStats: networkStats
    };

    res.json({
      success: true,
      message: "Chromecast device metrics retrieved successfully",
      data: enhancedResponse,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching chromecast device metrics:", error);

    let errorMessage = "Internal server error while checking chromecast device";
    let statusCode = 500;

    if (error.message.includes("timeout")) {
      errorMessage = "Chromecast device connection timeout";
      statusCode = 408;
    } else if (error.message.includes("unreachable") || error.message.includes("ENOTFOUND")) {
      errorMessage = "Chromecast device unreachable";
      statusCode = 503;
    } else if (error.name === 'NetworkError' || error.code === 'ECONNREFUSED') {
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

app.get("/api/chromecast/:id/history", authenticateToken, async (req, res) => {
  try {
    const rawDeviceId = req.params.id;
    const { timeRange = '24h' } = req.query;

    if (!rawDeviceId || rawDeviceId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Chromecast device identifier is required",
        error: "INVALID_DEVICE_ID"
      });
    }

    let device = null;
    const allDevices = await getChromecastDevices();

    // Enhanced search strategies consistent with metrics endpoint
    const decodingStrategies = [
      rawDeviceId,
      decodeURIComponent(rawDeviceId),
      rawDeviceId.replace(/%20/g, ' '),
      rawDeviceId.replace(/\+/g, ' '),
      rawDeviceId.replace(/_/g, ' '),
      rawDeviceId.replace(/-/g, ' '),
    ];

    const uniqueStrategies = [...new Set(decodingStrategies)];

    for (const searchTerm of uniqueStrategies) {
      if (device) break;

      // Exact match by device name
      device = allDevices.find(d => d.deviceName === searchTerm);
      if (device) {
        break;
      }

      // Case-insensitive match by device name
      device = allDevices.find(d =>
        d.deviceName && d.deviceName.toLowerCase() === searchTerm.toLowerCase()
      );
      if (device) {
        break;
      }

      // Partial match by device name
      device = allDevices.find(d =>
        d.deviceName && (
          d.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(d.deviceName.toLowerCase())
        )
      );
      if (device) {
        break;
      }

      // Numeric search by idCast
      if (/^\d+$/.test(searchTerm)) {
        const numericSearch = parseInt(searchTerm);
        device = allDevices.find(d => d.idCast === numericSearch);
        if (device) {
          break;
        }
        device = allDevices.find(d => d.id && d.id.toString() === searchTerm);
        if (device) {
          break;
        }
      }
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: `Chromecast device "${rawDeviceId}" not found`,
        error: "DEVICE_NOT_FOUND"
      });
    }

    const deviceStatus = chromecastStatus.get(device.idCast);
    const isOnline = deviceStatus?.isOnline || false;

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

        const variation = 0.3;
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
      onlineCount: devicesWithStatus.filter((d) => d.isOnline).length,
      offlineCount: devicesWithStatus.filter((d) => !d.isOnline).length,
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

      const uptime =
        totalDevices > 0
          ? ((onlineDevices / totalDevices) * 100).toFixed(1)
          : "0.0";

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

// ==================== TELEGRAM BOT ENDPOINTS ====================
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

// ==================== INTERNAL ENDPOINTS (FOR TELEGRAM BOT) ====================
app.get("/api/internal/channels", async (req, res) => {
  try {
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

// ==================== NETWORK TRAFFIC ENDPOINTS ====================
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

// ==================== CONFIGURATION ENDPOINTS ====================
app.get("/api/config", authenticateToken, async (req, res) => {
  res.json({
    success: true,
    data: {
      channelStatus: {
        useDummyStatus: CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS,
        onlineProbability: CHANNEL_STATUS_CONFIG.ONLINE_PROBABILITY,
        responseTimeRange: CHANNEL_STATUS_CONFIG.RESPONSE_TIME_RANGE,
        signalLevelRange: CHANNEL_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
        bitrateRange: CHANNEL_STATUS_CONFIG.BITRATE_RANGE,
        updateInterval: CHANNEL_STATUS_CONFIG.UPDATE_INTERVAL,
      },
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

app.post("/api/config/tv-status-mode", async (req, res) => {
  try {
    const { useDummyStatus } = req.body;

    if (typeof useDummyStatus === "boolean") {
      TV_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;
      tvStatus.clear();
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

app.post("/api/config/channel-status-mode", async (req, res) => {
  try {
    const { useDummyStatus } = req.body;

    if (typeof useDummyStatus === "boolean") {
      CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;
      channelStatus.clear();
      await checkAllChannelsStatus();

      res.json({
        success: true,
        message: `Channel status mode changed to ${useDummyStatus ? "dummy" : "real"} connectivity checks`,
        config: {
          useDummyStatus: CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS,
          onlineProbability: CHANNEL_STATUS_CONFIG.ONLINE_PROBABILITY,
          responseTimeRange: CHANNEL_STATUS_CONFIG.RESPONSE_TIME_RANGE,
          signalLevelRange: CHANNEL_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
          bitrateRange: CHANNEL_STATUS_CONFIG.BITRATE_RANGE,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid parameter. useDummyStatus must be a boolean",
      });
    }
  } catch (error) {
    console.error("Error updating channel status mode:", error);
    res.status(500).json({
      success: false,
      message: "Error updating channel status mode",
      error: error.message,
    });
  }
});

app.post("/api/config/chromecast-status-mode", async (req, res) => {
  try {
    const { useDummyStatus } = req.body;

    if (typeof useDummyStatus === "boolean") {
      CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;
      chromecastStatus.clear();
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

// ==================== HEALTH & DEBUG ENDPOINTS ====================
app.get("/api/health", authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "IPTV Monitoring API is running",
      timestamp: new Date().toISOString(),
      config: {
        channelDummyStatus: CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS,
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

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

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

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  if (res.headersSent) {
    return next(error);
  }

  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(isDevelopment && { details: error.message, stack: error.stack })
  });
});

// ==================== PERIODIC TASKS ====================
const startPeriodicChecks = () => {
  // Status checks with improved logging
  if (typeof checkAllChannelsStatus === 'function' &&
    typeof checkAllTVsStatus === 'function' &&
    typeof checkAllChromecastsStatus === 'function') {

    setInterval(() => {
      if (CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS ||
        TV_STATUS_CONFIG.USE_DUMMY_STATUS ||
        CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {

        Promise.all([
          checkAllChannelsStatus().catch(error => {
            console.error("Error in channel status check:", error)
          }),
          checkAllTVsStatus().catch(error => {
            console.error("Error in TV status check:", error);
          }),
          checkAllChromecastsStatus().catch(error => {
            console.error("Error in Chromecast status check:", error);
          })
        ]);
      }
    }, Math.min(
      CHANNEL_STATUS_CONFIG.UPDATE_INTERVAL,
      TV_STATUS_CONFIG.UPDATE_INTERVAL,
      CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL
    ));
  }

  // Cleanup Telegram bot subscribers every hour
  if (telegramBot) {
    setInterval(() => {
      try {
        telegramBot.cleanupSubscribers();
      } catch (error) {
        console.error("Error cleaning up Telegram subscribers:", error);
      }
    }, 3600000);
  }

  // Reset network stats every hour
  setInterval(() => {
    Object.keys(networkStats).forEach(service => {
      networkStats[service].requests = 0;
      networkStats[service].lastReset = new Date();
    });
  }, 3600000);
};

// ==================== SERVER STARTUP ====================
app.listen(port, async () => {
  console.log(`Server starting on port ${port}`);

  // Optional database connection check
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.warn("Database connection failed, but server will continue running");
  }

  console.log("Starting initial status checks...");
  console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log(`Channel Status Mode: ${CHANNEL_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);

  // Optional status checks without crashing server
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
  } catch (error) {
    console.error("Error during initial status checks:", error);
  }

  setTimeout(startPeriodicChecks, 5000);
  console.log(`Server is running on port ${port}`);
});

// ==================== GRACEFUL SHUTDOWN ====================
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down server gracefully...");
  process.exit(0);
});

module.exports = app;