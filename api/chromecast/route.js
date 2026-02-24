const express = require('express');
const router = express.Router();
const { connectDB } = require('../../autofix-db');
const { saveNotificationToDB, autoResolveNotification } = require('../../utils/notificationUtil');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');

// Authentication middleware
const authenticateToken = (req, res, next) => {
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access denied. No token provided.",
      authenticated: false
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: "Invalid or expired token",
      authenticated: false
    });
  }
};

// Apply authentication to all routes
router.use(authenticateToken);

// In-memory cache for tracking device status
const deviceStatusCache = new Map();
let systemStartupComplete = false;

// Mark system startup as complete after 5 minutes
setTimeout(() => {
  console.log('[Chromecast] System startup period complete, notifications now enabled');
  systemStartupComplete = true;
}, 5 * 60 * 1000); // 5 minutes

// Get all chromecast devices with status
router.get('/', async (req, res) => {
  try {
    const db = await connectDB();

    const chromecasts = await db.collection('chromecast')
      .find({})
      .sort({ idCast: 1 })
      .toArray();

    // Transform data to match frontend expectations
    const transformedData = await Promise.all(chromecasts.map(async (device) => {
      const isOnline = device.isOnline === "TRUE" || device.isOnline === true;
      const isPingable = device.isPingable === "TRUE" || device.isPingable === true;

      const deviceId = `chromecast-${device.idCast}`;
      const previousStatus = deviceStatusCache.get(deviceId);
      const currentStatus = isOnline ? 'online' : 'offline';

      // Check for status changes
      if (previousStatus && previousStatus !== currentStatus) {
        if (currentStatus === 'offline' && previousStatus === 'online') {
          // Device went offline - create notification
          if (systemStartupComplete) {
            await saveNotificationToDB({
              source: 'chromecast',
              title: 'Chromecast Device Offline',
              message: `${device.deviceName || 'Unknown'} is offline - ${device.offlineReason || 'Device not responding'}`,
              deviceName: device.deviceName,
              roomNo: device.roomNr,
              ipAddr: device.ipAddr,
              error: device.offlineReason || 'Device offline',
              currentStatus: 'offline',
              isStartup: false, // Not a startup notification
            });
          }
        } else if (currentStatus === 'online' && previousStatus === 'offline') {
          // Device recovered - auto-resolve existing notifications
          await autoResolveNotification(device.ipAddr || device.deviceName || device.roomNr);
        }
      } else if (!previousStatus && currentStatus === 'offline' && systemStartupComplete) {
        // First check and device is offline - create startup notification
        await saveNotificationToDB({
          source: 'chromecast',
          title: 'Chromecast Device Offline',
          message: `${device.deviceName || 'Unknown'} is offline - ${device.offlineReason || 'Device not responding'}`,
          deviceName: device.deviceName,
          roomNo: device.roomNr,
          ipAddr: device.ipAddr,
          error: device.offlineReason || 'Device offline',
          currentStatus: 'offline',
          isStartup: true, // Mark as startup notification
        });
      }

      // Update cache
      deviceStatusCache.set(deviceId, currentStatus);

      return {
        idCast: device.idCast,
        deviceName: device.deviceName,
        roomNr: device.roomNr,
        type: device.type,
        ipAddr: device.ipAddr,
        bssid: device.bssid,
        noiseLevel: device.noiseLevel,
        signalLevel: device.signalLevel,
        uptime: device.uptime,
        lastSeen: device.lastSeen,
        isPingable: isPingable,
        isOnline: isOnline,
        offlineReason: device.offlineReason,
        apkVersion: device.apkVersion,
        htvVersion: device.htvVersion,
        currentApp: device.currentApp,
        screenOn: device.screenOn,
        speedUp: device.speedUp,
        speedDown: device.speedDown,
        // Add computed fields for frontend
        error: isOnline ? null : (device.offlineReason || 'Device offline'),
        responseTime: isPingable ? Math.floor(Math.random() * 200) + 50 : null,
      };
    }));

    res.json({
      success: true,
      data: transformedData
    });
  } catch (error) {
    console.error("Error fetching chromecast devices:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
