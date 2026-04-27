const express = require('express');
const router = express.Router();

const { getNotificationStats, NOTIFICATION_CONFIG } = require('../../../utils/notificationUtil');
const { connectDB } = require('../../../autofix-db');

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

// Get notification statistics
router.get('/', async (req, res) => {
  try {
    // Check if this is an analytics request
    if (req.query.analytics === 'true') {
      const { period = '30' } = req.query; // days

      const db = await connectDB();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      // Get top devices with issues
      const topDevices = await db.notifications.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            deviceName: { $ne: null, $exists: true }
          }
        },
        {
          $group: {
            _id: '$deviceName',
            count: { $sum: 1 },
            roomNr: { $first: '$roomNo' }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        },
        {
          $project: {
            device: '$_id',
            count: 1,
            roomNr: 1
          }
        }
      ]).toArray();

      // Get top rooms with issues (exclude null/N/A/undefined)
      const topRooms = await db.notifications.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            roomNo: {
              $ne: null,
              $ne: 'N/A',
              $ne: 'null',
              $ne: '',
              $exists: true,
              $type: 'string'
            }
          }
        },
        {
          $group: {
            _id: '$roomNo',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        },
        {
          $project: {
            room: '$_id',
            count: 1
          }
        }
      ]).toArray();

      return res.json({
        success: true,
        data: {
          topDevices,
          topRooms,
          period: `${period} days`
        }
      });
    }

    // Regular stats request
    const stats = await getNotificationStats();

    res.json({
      success: stats.success,
      data: {
        total: stats.total,
        totalNotifications: stats.total,
        byStatus: stats.byStatus,
        config: {
          notificationCooldown: `${NOTIFICATION_CONFIG.NOTIFICATION_COOLDOWN} minutes`,
          autoResolveDelay: `${NOTIFICATION_CONFIG.AUTO_RESOLVE_DELAY} minutes`,
          autoCloseAfterDays: NOTIFICATION_CONFIG.AUTO_CLOSE_AFTER_DAYS,
          maxNotificationsPerDevice: NOTIFICATION_CONFIG.MAX_NOTIFICATIONS_PER_DEVICE
        }
      }
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get total notification count (lightweight, used for stats cards)
router.get('/count/total', async (req, res) => {
  try {
    const db = await connectDB();
    const total = await db.notifications.countDocuments();

    res.json({
      success: true,
      data: {
        total,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Error fetching notification count:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
