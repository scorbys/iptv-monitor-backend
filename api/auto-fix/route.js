const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../autofix-db');
const autoFixService = require('../../services/autoFixService');
const { Logger } = require('../../utils/logger.util');

const logger = new Logger('AutoFixAPI');

// Parse a legacy synthetic notificationId such as "chromecast-<id>-<ts>",
// "channel-<id>-<ts>" or "tv-<id>-<ts>" to recover device info for old logs.
function inferDeviceFromNotificationId(notificationId) {
  if (typeof notificationId !== 'string') return {};
  const m = notificationId.match(/^(chromecast|channel|tv)-(.+)-\d+$/);
  if (!m) return {};
  return { deviceType: m[1], deviceId: m[2] };
}

// Get database instance
async function getDatabase() {
  const db = await connectDB();
  return db;
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');
const { requireAdmin } = require('../../middleware/authMiddleware');

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
router.get('/history', requireAdmin, async (req, res) => {
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
      if (!ObjectId.isValid(staffId)) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }
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

    // Resolve device metadata for each log with layered fallbacks:
    //   1) the log's own device fields (new logs)
    //   2) the linked notification (deviceName/roomNo/source)
    //   3) the legacy synthetic notificationId prefix (deviceType/deviceId)
    const resolved = autoFixLogs.map(log => {
      const notif = notificationMap[log.notificationId] || null;
      const inferred = inferDeviceFromNotificationId(log.notificationId);
      const deviceType = log.deviceType || inferred.deviceType || null;
      const deviceId = log.deviceId || inferred.deviceId || null;
      const roomNo = log.roomNo != null ? log.roomNo : (notif && notif.roomNo != null ? notif.roomNo : null);
      const deviceName =
        log.deviceName ||
        (notif && notif.deviceName) ||
        (roomNo != null ? `Room ${roomNo}` : null);
      const source = log.source || (notif && notif.source) || null;
      return { log, deviceType, deviceId, roomNo, deviceName, source };
    });

    // Secondary fallback: resolve still-missing device names from device collections.
    // Bounded by the (usually small) set of ids that are still unnamed.
    const missingIds = { chromecast: new Set(), tv: new Set() };
    resolved.forEach(r => {
      if (!r.deviceName && r.deviceId && missingIds[r.deviceType] && ObjectId.isValid(r.deviceId)) {
        missingIds[r.deviceType].add(r.deviceId);
      }
    });
    const nameById = { chromecast: {}, tv: {} };
    const loadNames = async (ids, collection, builder) => {
      if (!ids.size) return;
      const docs = await collection
        .find({ _id: { $in: Array.from(ids).map(id => new ObjectId(id)) } })
        .toArray();
      docs.forEach(builder);
    };
    await loadNames(missingIds.chromecast, db.chromecast, d => {
      nameById.chromecast[d._id.toString()] = d.deviceName || (d.roomNo != null ? `Room ${d.roomNo}` : null);
    });
    await loadNames(missingIds.tv, db.tvHospitality, d => {
      nameById.tv[d._id.toString()] = d.roomNo != null ? `Room ${d.roomNo}` : (d.deviceName || null);
    });

    const populatedLogs = resolved.map(r => {
      const log = r.log;
      const fallbackName =
        r.deviceName ||
        (r.deviceType && nameById[r.deviceType] ? nameById[r.deviceType][r.deviceId] : null) ||
        null;
      return {
        ...log,
        deviceType: r.deviceType,
        deviceId: r.deviceId,
        deviceName: fallbackName,
        roomNo: r.roomNo,
        source: r.source,
        triggeredByStaff: log.triggeredBy ? staffMap[log.triggeredBy.toString()] : null,
        approvedByStaff: log.approvedBy ? staffMap[log.approvedBy.toString()] : null,
        executedByStaff: log.executedBy && log.executedBy !== 'system' ? staffMap[log.executedBy.toString()] : null,
        notification: notificationMap[log.notificationId] || null
      };
    });

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
router.get('/stats', requireAdmin, async (req, res) => {
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

    // Category breakdown - from auto_fix_logs.category (authoritative source for auto-fix)
    const categoryStats = await db.autoFixLogs.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          category: { $ne: null, $exists: true }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          success: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'success'] },
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

    // Device-type breakdown (channel / tv / chromecast / null)
    const deviceTypeStats = await db.autoFixLogs.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    // Per-device breakdown (top devices by auto-fix count)
    const deviceStats = await db.autoFixLogs.aggregate([
      { $match: { createdAt: { $gte: startDate }, deviceId: { $ne: null } } },
      {
        $group: {
          _id: { deviceType: '$deviceType', deviceId: '$deviceId' },
          deviceName: { $first: '$deviceName' },
          roomNo: { $first: '$roomNo' },
          count: { $sum: 1 },
          success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
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
        byDeviceType: deviceTypeStats,
        byDevice: deviceStats,
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
router.get('/dashboard', requireAdmin, async (req, res) => {
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
router.post('/trigger', requireAdmin, async (req, res) => {
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
router.post('/process-pending', requireAdmin, async (req, res) => {
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
router.post('/process-notification', requireAdmin, async (req, res) => {
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
