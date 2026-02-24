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
  console.log('[Channels] System startup period complete, notifications now enabled');
  systemStartupComplete = true;
}, 5 * 60 * 1000); // 5 minutes

// Get all channels with status
router.get('/', async (req, res) => {
  try {
    const db = await connectDB();

    // For demo, return mock channel data
    // In real implementation, this would fetch from a channels collection
    const channels = [
      {
        id: 1,
        channelName: 'RCTI',
        channelNumber: 1,
        ipMulticast: '239.1.1.1',
        status: 'online',
        lastChecked: new Date().toISOString(),
        error: null,
        responseTime: 45,
        signalLevel: 85,
        bitrate: 4000,
        networkStats: {
          sent: '1.2 GB',
          received: '1.1 GB',
          latency: 15,
          jitter: 2,
          ttl: 64,
          packetLoss: 0.01,
          bandwidth: 4500,
          hops: 5,
          signalStrength: 85,
          bitrate: 4000
        }
      },
      {
        id: 2,
        channelName: 'SCTV',
        channelNumber: 2,
        ipMulticast: '239.1.1.2',
        status: 'offline',
        lastChecked: new Date().toISOString(),
        error: 'Stream timeout - no signal received',
        responseTime: null,
        signalLevel: null,
        bitrate: 0,
        networkStats: null
      },
      {
        id: 3,
        channelName: 'Indosiar',
        channelNumber: 3,
        ipMulticast: '239.1.1.3',
        status: 'online',
        lastChecked: new Date().toISOString(),
        error: null,
        responseTime: 52,
        signalLevel: 78,
        bitrate: 3800,
        networkStats: {
          sent: '950 MB',
          received: '920 MB',
          latency: 18,
          jitter: 3,
          ttl: 64,
          packetLoss: 0.05,
          bandwidth: 4200,
          hops: 6,
          signalStrength: 78,
          bitrate: 3800
        }
      },
      {
        id: 4,
        channelName: 'ANTV',
        channelNumber: 4,
        ipMulticast: '239.1.1.4',
        status: 'online',
        lastChecked: new Date().toISOString(),
        error: null,
        responseTime: 48,
        signalLevel: 82,
        bitrate: 3900,
        networkStats: {
          sent: '880 MB',
          received: '860 MB',
          latency: 16,
          jitter: 2,
          ttl: 64,
          packetLoss: 0.02,
          bandwidth: 4100,
          hops: 5,
          signalStrength: 82,
          bitrate: 3900
        }
      },
      {
        id: 5,
        channelName: 'MNCTV',
        channelNumber: 5,
        ipMulticast: '239.1.1.5',
        status: 'offline',
        lastChecked: new Date().toISOString(),
        error: 'Connection failure - ICMP timeout',
        responseTime: null,
        signalLevel: null,
        bitrate: 0,
        networkStats: null
      }
    ];

    // Process notifications for each channel
    for (const channel of channels) {
      const deviceId = `channel-${channel.id}`;
      const previousStatus = deviceStatusCache.get(deviceId);
      const currentStatus = channel.status;

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

    res.json({
      success: true,
      data: channels
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
