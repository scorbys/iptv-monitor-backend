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

// ==================== NOTIFICATION API ENDPOINTS ====================

// Get all notifications with staff details populated
router.get('/', async (req, res) => {
  try {
    const { status, priority, source, limit = 50, skip = 0 } = req.query;

    const db = await getDatabase();
    const query = {};

    if (status) query.reportStatus = status;
    if (priority) query.priority = priority;
    if (source) query.source = source;

    const notifications = await db.notifications
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    // Populate staff details
    const staffIds = new Set();
    notifications.forEach(notif => {
      if (notif.reportedByStaffId) staffIds.add(notif.reportedByStaffId.toString());
      if (notif.assignedStaffId) staffIds.add(notif.assignedStaffId.toString());
      if (notif.handledByStaffId) staffIds.add(notif.handledByStaffId.toString());
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

    const populatedNotifications = notifications.map(notif => ({
      ...notif,
      reportedByStaff: notif.reportedByStaffId ? staffMap[notif.reportedByStaffId.toString()] : null,
      assignedStaff: notif.assignedStaffId ? staffMap[notif.assignedStaffId.toString()] : null,
      handledByStaff: notif.handledByStaffId ? staffMap[notif.handledByStaffId.toString()] : null,
    }));

    const total = await db.notifications.countDocuments(query);

    res.json({
      success: true,
      data: populatedNotifications,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > parseInt(skip) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single notification with details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const db = await getDatabase();
    const notification = await db.notifications
      .findOne({ notificationId: id });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    // Populate staff details
    const staffIds = [
      notification.reportedByStaffId,
      notification.assignedStaffId,
      notification.handledByStaffId
    ].filter(Boolean).map(id => new ObjectId(id));

    let staffMap = {};
    if (staffIds.length > 0) {
      const staffMembers = await db.staff
        .find({ _id: { $in: staffIds } })
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

    // Populate notes with staff details
    const notesWithStaff = await Promise.all((notification.notes || []).map(async (note) => {
      if (note.staffId) {
        const staff = await db.staff.findOne({ _id: new ObjectId(note.staffId) });
        return {
          ...note,
          staff: staff ? {
            id: staff._id.toString(),
            name: staff.name,
            email: staff.email
          } : null
        };
      }
      return note;
    }));

    const populatedNotification = {
      ...notification,
      reportedByStaff: notification.reportedByStaffId ? staffMap[notification.reportedByStaffId.toString()] : null,
      assignedStaff: notification.assignedStaffId ? staffMap[notification.assignedStaffId.toString()] : null,
      handledByStaff: notification.handledByStaffId ? staffMap[notification.handledByStaffId.toString()] : null,
      notes: notesWithStaff
    };

    res.json({
      success: true,
      data: populatedNotification
    });
  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Assign notification to staff
router.post('/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId, priority } = req.body;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: "staffId is required"
      });
    }

    const db = await getDatabase();

    // Verify staff exists
    const staff = await db.staff.findOne({ _id: new ObjectId(staffId) });
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: "Staff not found"
      });
    }

    const updateData = {
      assignedStaffId: new ObjectId(staffId),
      assignedAt: new Date(),
      updatedAt: new Date()
    };

    if (priority) {
      updateData.priority = priority;
    }

    const result = await db.notifications.updateOne(
      { notificationId: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    res.json({
      success: true,
      message: "Notification assigned successfully",
      data: {
        notificationId: id,
        assignedStaff: {
          id: staff._id.toString(),
          name: staff.name,
          email: staff.email
        }
      }
    });
  } catch (error) {
    console.error("Error assigning notification:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add note to notification
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = req.user?.id;

    if (!note || typeof note !== 'string' || note.trim() === '') {
      return res.status(400).json({
        success: false,
        error: "note is required and must be a non-empty string"
      });
    }

    const db = await getDatabase();

    // Get staff profile for current user
    let staffId = null;
    let staffName = null;

    if (userId) {
      const staff = await db.staff.findOne({ userId: new ObjectId(userId) });
      if (staff) {
        staffId = staff._id;
        staffName = staff.name;
      }
    }

    const newNote = {
      staffId: staffId,
      staffName: staffName || req.user?.name || 'Unknown',
      note: note.trim(),
      timestamp: new Date()
    };

    const result = await db.notifications.updateOne(
      { notificationId: id },
      {
        $push: { notes: newNote },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    res.json({
      success: true,
      message: "Note added successfully",
      data: newNote
    });
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update notification status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { reportStatus, currentStatus, handlingStartTime, handlingEndTime } = req.body;

    const db = await getDatabase();

    const updateData = { updatedAt: new Date() };

    if (reportStatus) updateData.reportStatus = reportStatus;
    if (currentStatus) updateData.currentStatus = currentStatus;
    if (handlingStartTime) updateData.handlingStartTime = new Date(handlingStartTime);
    if (handlingEndTime) updateData.handlingEndTime = new Date(handlingEndTime);

    // If status is resolved/closed, set handledByStaffId
    if (reportStatus === 'resolved' || reportStatus === 'closed') {
      const userId = req.user?.id;
      if (userId) {
        const staff = await db.staff.findOne({ userId: new ObjectId(userId) });
        if (staff) {
          updateData.handledByStaffId = staff._id;
        }
      }
      updateData.handlingEndTime = new Date();
    }

    const result = await db.notifications.updateOne(
      { notificationId: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    res.json({
      success: true,
      message: "Notification status updated successfully"
    });
  } catch (error) {
    console.error("Error updating notification status:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
