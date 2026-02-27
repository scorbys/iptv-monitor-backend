const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../autofix-db');
const autoFixService = require('../../services/autoFixService');
const { Logger } = require('../../utils/logger.util');

const logger = new Logger('AutoFixAPI');

// Get database instance
async function getDatabase() {
  const db = await connectDB();
  return db;
}

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

// ==================== AUTO FIX HISTORY API ENDPOINTS ====================

/**
 * GET /api/auto-fix/history
 * Get auto fix history with filters (with pagination, staff & notification details)
 */
router.get('/history', async (req, res) => {
  try {
    const {
      notificationId,
      status,
      category,
      fixType,
      staffId,
      limit = 50,
      skip = 0
    } = req.query;

    const db = await getDatabase();
    const query = {};

    if (notificationId) query.notificationId = notificationId;
    if (status) query.status = status;
    if (category) query.category = category;
    if (fixType) query.fixType = fixType;
    if (staffId) {
      query.$or = [
        { triggeredBy: new ObjectId(staffId) },
        { approvedBy: new ObjectId(staffId) },
        { executedBy: new ObjectId(staffId) }
      ];
    }

    const autoFixLogs = await db.autoFixLogs
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    // Populate staff details
    const staffIds = new Set();
    autoFixLogs.forEach(log => {
      if (log.triggeredBy) staffIds.add(log.triggeredBy.toString());
      if (log.approvedBy) staffIds.add(log.approvedBy.toString());
      if (log.executedBy && log.executedBy !== 'system') staffIds.add(log.executedBy.toString());
    });

    const staffMap = {};
    if (staffIds.size > 0) {
      const staffMembers = await db.staff
        .find({ _id: { $in: Array.from(staffIds).map(id => new ObjectId(id)) } })
        .toArray();

      staffMembers.forEach(staff => {
        staffMap[staff._id.toString()] = {
          id: staff._id.toString(),
          name: staff.name,
          email: staff.email,
          department: staff.department,
          position: staff.position
        };
      });
    }

    // Populate notification details
    const notificationIds = [...new Set(autoFixLogs.map(log => log.notificationId))];
    const notificationMap = {};
    if (notificationIds.length > 0) {
      const notifications = await db.notifications
        .find({ notificationId: { $in: notificationIds } })
        .toArray();

      notifications.forEach(notif => {
        notificationMap[notif.notificationId] = {
          id: notif.notificationId,
          title: notif.title,
          source: notif.source,
          deviceName: notif.deviceName,
          roomNo: notif.roomNo
        };
      });
    }

    const populatedLogs = autoFixLogs.map(log => ({
      ...log,
      triggeredByStaff: log.triggeredBy ? staffMap[log.triggeredBy.toString()] : null,
      approvedByStaff: log.approvedBy ? staffMap[log.approvedBy.toString()] : null,
      executedByStaff: log.executedBy && log.executedBy !== 'system' ? staffMap[log.executedBy.toString()] : null,
      notification: notificationMap[log.notificationId] || null
    }));

    const total = await db.autoFixLogs.countDocuments(query);

    res.json({
      success: true,
      data: populatedLogs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > parseInt(skip) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching auto fix history:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/auto-fix/stats
 * Get auto fix statistics (with aggregation and period filtering)
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = '30', timeseries = 'false' } = req.query; // days

    const db = await getDatabase();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const stats = await db.autoFixLogs.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const statusStats = {
      pending: 0,
      executing: 0,
      success: 0,
      failed: 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      statusStats[stat._id] = stat.count;
    });

    // Category breakdown - using notifications collection for accurate categories
    const categoryStats = await db.notifications.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          errorCategory: { $ne: null, $exists: true }
        }
      },
      {
        $group: {
          _id: '$errorCategory',
          count: { $sum: 1 },
          success: {
            $sum: {
              $cond: [
                { $in: ['$reportStatus', ['resolved', 'closed']] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 14 // Limit to top 14 categories
      }
    ]).toArray();

    // Fix type breakdown
    const fixTypeStats = await db.autoFixLogs.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$fixType',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const total = Object.values(statusStats).reduce((a, b) => a + b, 0);
    const successRate = total > 0 ? ((statusStats.success / total) * 100).toFixed(2) : '0.00';

    const response = {
      success: true,
      data: {
        total,
        successRate: `${successRate}%`,
        byStatus: statusStats,
        byCategory: categoryStats,
        byFixType: fixTypeStats,
        period: `${period} days`
      }
    };

    // Add timeseries data if requested
    if (timeseries === 'true') {
      const days = parseInt(period);
      const timeSeriesData = [];

      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayStats = await db.autoFixLogs.aggregate([
          {
            $match: {
              createdAt: { $gte: dayStart, $lte: dayEnd }
            }
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]).toArray();

        const dayStatusStats = {
          success: 0,
          failed: 0
        };

        dayStats.forEach(stat => {
          if (stat._id === 'success') dayStatusStats.success = stat.count;
          if (stat._id === 'failed') dayStatusStats.failed = stat.count;
        });

        const dayTotal = dayStatusStats.success + dayStatusStats.failed;
        const daySuccessRate = dayTotal > 0 ? (dayStatusStats.success / dayTotal * 100) : 0;

        timeSeriesData.push({
          date: dayStart.toISOString().split('T')[0], // YYYY-MM-DD
          displayDate: dayStart.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
          success: dayStatusStats.success,
          failed: dayStatusStats.failed,
          total: dayTotal,
          successRate: daySuccessRate
        });
      }

      response.data.timeseries = timeSeriesData;
    }

    res.json(response);
  } catch (error) {
    console.error("Error fetching auto fix stats:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ML INTEGRATED AUTO FIX ENDPOINTS ====================

/**
 * GET /api/auto-fix/dashboard
 * Get ML-integrated auto-fix dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    logger.info('Fetching ML-integrated auto-fix dashboard stats');

    const stats = await autoFixService.getAutoFixDashboardStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting auto-fix dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get auto-fix dashboard statistics'
    });
  }
});

/**
 * GET /api/auto-fix/notification/:notificationId
 * Get notification with ML predictions and auto-fix history
 */
router.get('/notification/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;

    logger.info(`Fetching ML-integrated auto-fix history for notification: ${notificationId}`);

    const data = await autoFixService.getNotificationWithFixHistory(notificationId);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error getting notification fix history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get notification fix history'
    });
  }
});

/**
 * POST /api/auto-fix/trigger
 * Manually trigger auto-fix for a notification
 */
router.post('/trigger', async (req, res) => {
  try {
    const { notificationId, action } = req.body;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        error: 'notificationId is required'
      });
    }

    logger.info(`Manual ML-integrated auto-fix trigger for notification: ${notificationId}, action: ${action || 'all'}`);

    const result = await autoFixService.manualTriggerAutoFix(notificationId, action);

    res.status(200).json({
      success: true,
      data: result,
      message: 'ML-integrated auto-fix triggered successfully'
    });
  } catch (error) {
    logger.error('Error triggering ML-integrated auto-fix:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger auto-fix'
    });
  }
});

/**
 * POST /api/auto-fix/process-pending
 * Process all pending auto-fixes (cron endpoint with ML)
 */
router.post('/process-pending', async (req, res) => {
  try {
    // Verify cron authorization (add your auth check here)
    const authHeader = req.headers.authorization;

    logger.info('Processing ML-integrated pending auto-fixes (cron job)');

    const result = await autoFixService.processPendingAutoFixes();

    res.status(200).json({
      success: true,
      data: result,
      message: `Processed ${result.processed} ML-integrated pending fixes out of ${result.total} total`
    });
  } catch (error) {
    logger.error('Error processing ML-integrated pending fixes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process pending fixes'
    });
  }
});

/**
 * POST /api/auto-fix/process-notification
 * Process a notification with ML prediction and auto-fix
 */
router.post('/process-notification', async (req, res) => {
  try {
    const { notification, mlPrediction } = req.body;

    if (!notification || !mlPrediction) {
      return res.status(400).json({
        success: false,
        error: 'notification and mlPrediction are required'
      });
    }

    logger.info(`Processing notification with ML: ${notification.id}`);

    const result = await autoFixService.processNotificationWithML(notification, mlPrediction);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Notification processed with ML successfully'
    });
  } catch (error) {
    logger.error('Error processing notification with ML:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process notification with ML'
    });
  }
});

module.exports = router;
