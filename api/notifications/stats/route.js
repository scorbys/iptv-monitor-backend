const express = require('express');
const router = express.Router();

const { getNotificationStats, NOTIFICATION_CONFIG } = require('../../../utils/notificationUtil');

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
    const stats = await getNotificationStats();

    res.json({
      success: true,
      data: {
        ...stats.data,
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

module.exports = router;
