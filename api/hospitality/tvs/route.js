const express = require('express');
const router = express.Router();
const { connectDB } = require('../../../autofix-db');
const { saveNotificationToDB, autoResolveNotification } = require('../../../utils/notificationUtil');

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
  console.log('[Hospitality TVs] System startup period complete, notifications now enabled');
  systemStartupComplete = true;
}, 5 * 60 * 1000); // 5 minutes

// Get all hospitality TV devices with status
router.get('/', async (req, res) => {
  try {
    const connection = await connectDB();
    // Get the MongoDB client directly
    const client = connection.client;
    const db = client.db('iptv');

    const tvs = await db.collection('tv_hospitality')
      .find({})
      .sort({ id: 1 })
      .toArray();

    // Transform data to match frontend expectations
    const transformedData = await Promise.all(tvs.map(async (tv) => {
      // Simulate status check - in real implementation, this would ping the device
      const isOnline = Math.random() > 0.2; // 80% online for demo

      const deviceId = `tv-${tv.id}`;
      const previousStatus = deviceStatusCache.get(deviceId);
      const currentStatus = isOnline ? 'online' : 'offline';

      // Check for status changes
      if (previousStatus && previousStatus !== currentStatus) {
        if (currentStatus === 'offline' && previousStatus === 'online') {
          // Device went offline - create notification
          if (systemStartupComplete) {
            await saveNotificationToDB({
              source: 'tv',
              title: 'TV Device Offline',
              message: `Room ${tv.roomNo || 'Unknown'} TV is offline - TV not responding`,
              deviceName: `Room ${tv.roomNo}`,
              roomNo: tv.roomNo,
              ipAddr: tv.ipAddress,
              error: 'TV not responding',
              currentStatus: 'offline',
              isStartup: false, // Not a startup notification
            });
          }
        } else if (currentStatus === 'online' && previousStatus === 'offline') {
          // Device recovered - auto-resolve existing notifications
          await autoResolveNotification(tv.ipAddress || tv.roomNo);
        }
      } else if (!previousStatus && currentStatus === 'offline' && systemStartupComplete) {
        // First check and device is offline - create startup notification
        await saveNotificationToDB({
          source: 'tv',
          title: 'TV Device Offline',
          message: `Room ${tv.roomNo || 'Unknown'} TV is offline - TV not responding`,
          deviceName: `Room ${tv.roomNo}`,
          roomNo: tv.roomNo,
          ipAddr: tv.ipAddress,
          error: 'TV not responding',
          currentStatus: 'offline',
          isStartup: true, // Mark as startup notification
        });
      }

      // Update cache
      deviceStatusCache.set(deviceId, currentStatus);

      return {
        id: tv.id,
        roomNo: tv.roomNo,
        ipAddress: tv.ipAddress,
        macAddress: tv.macAddress,
        tvType: tv.tvType,
        firmwareVer: tv.firmwareVer,
        tvModel: tv.tvModel,
        softapID: tv.softapID,
        softapKey: tv.softapKey,
        // Add computed fields for frontend
        status: currentStatus,
        lastChecked: new Date().toISOString(),
        error: isOnline ? null : 'TV not responding',
        responseTime: isOnline ? Math.floor(Math.random() * 300) + 50 : null,
        signalLevel: isOnline ? Math.floor(Math.random() * 40) + 60 : null,
      };
    }));

    res.json({
      success: true,
      data: transformedData
    });
  } catch (error) {
    console.error("Error fetching hospitality TVs:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
