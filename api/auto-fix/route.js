const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../autofix-db');

// Get database instance - autofix-db returns object with collections
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

// Get auto fix history with filters
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

// Get auto fix statistics
router.get('/stats', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

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

    // Category breakdown
    const categoryStats = await db.autoFixLogs.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { count: -1 }
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

    res.json({
      success: true,
      data: {
        total,
        successRate: `${successRate}%`,
        byStatus: statusStats,
        byCategory: categoryStats,
        byFixType: fixTypeStats,
        period: `${period} days`
      }
    });
  } catch (error) {
    console.error("Error fetching auto fix stats:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
