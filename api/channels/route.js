const express = require('express');
const router = express.Router();
const { connectDB } = require('../../autofix-db');
const { saveNotificationToDB, autoResolveNotification } = require('../../utils/notificationUtil');
const { getAllChannelsFromDB } = require('../../db');

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
  console.log('[Channels] System startup period complete, notifications now enabled');
  systemStartupComplete = true;
}, 5 * 60 * 1000); // 5 minutes

// Get all channels with status
router.get('/', async (req, res) => {
  try {
    // Fetch channels from database using the existing function
    const channels = await getAllChannelsFromDB();

    if (!Array.isArray(channels) || channels.length === 0) {
      console.log('[Channels] No channels found in database');
      return res.json({
        success: true,
        data: [],
        summary: {
          totalCount: 0,
          onlineCount: 0,
          offlineCount: 0
        },
        fetchedAt: new Date().toISOString()
      });
    }

    console.log(`[Channels] Fetched ${channels.length} channels from database`);

    // Process notifications for each channel
    for (const channel of channels) {
      const deviceId = `channel-${channel.id}`;
      const previousStatus = deviceStatusCache.get(deviceId);
      const currentStatus = channel.status || 'offline';

      // Check for status changes
      if (previousStatus && previousStatus !== currentStatus) {
        if (currentStatus === 'offline' && previousStatus === 'online') {
          // Device went offline - create notification
          if (systemStartupComplete) {
            await saveNotificationToDB({
              source: 'channel',
              title: 'Channel Offline',
              message: `${channel.channelName} (Channel ${channel.channelNumber}) is offline - ${channel.error || 'Unknown error'}`,
              deviceName: channel.channelName,
              ipAddr: channel.ipMulticast,
              error: channel.error,
              currentStatus: 'offline',
              isStartup: false, // Not a startup notification
            });
          }
        } else if (currentStatus === 'online' && previousStatus === 'offline') {
          // Device recovered - auto-resolve existing notifications
          await autoResolveNotification(channel.ipMulticast || channel.channelName);
        }
      } else if (!previousStatus && currentStatus === 'offline' && systemStartupComplete) {
        // First check and device is offline - create startup notification
        await saveNotificationToDB({
          source: 'channel',
          title: 'Channel Offline',
          message: `${channel.channelName} (Channel ${channel.channelNumber}) is offline - ${channel.error || 'Unknown error'}`,
          deviceName: channel.channelName,
          ipAddr: channel.ipMulticast,
          error: channel.error,
          currentStatus: 'offline',
          isStartup: true, // Mark as startup notification
        });
      }

      // Update cache
      deviceStatusCache.set(deviceId, currentStatus);
    }

    // Calculate summary
    const onlineCount = channels.filter(c => c.status === 'online').length;
    const offlineCount = channels.filter(c => c.status === 'offline').length;

    res.json({
      success: true,
      data: channels,
      summary: {
        totalCount: channels.length,
        onlineCount,
        offlineCount
      },
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
