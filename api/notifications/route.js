const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../autofix-db');
const { generateLabeledMetrics, generateRandomMetrics } = require('../../utils/metricCalculator');

/**
 * Get suggested solutions based on error category
 * Maps categories to predefined solutions
 */
function getSuggestedSolutionsForCategory(category, notification) {
  const solutionsMap = {
    'Kategori-1': [
      'Deactive White list profile',
      'Restart Chromecast & WIFI',
      'Radisson Guest Must Be Login',
      'Forget WIFI Radisson Guest',
      'Logout WIFI (log-out.me)'
    ],
    'Kategori-2': [
      'Periksa koneksi LAN pada TV',
      'Pastikan sumber HDMI diatur ke HDMI-1',
      'Restart perangkat IPTV',
      'Periksa indikator LED pada box IPTV'
    ],
    'Kategori-3': [
      'Periksa koneksi LAN (pastikan terpasang di LAN IN)',
      'Posisikan kabel LAN dengan benar',
      'Pastikan tidak terpasang di LAN OUT',
      'Test koneksi dengan kabel LAN lain'
    ],
    'Kategori-4': [
      'Install Google Home app',
      'Pastikan perangkat dalam satu jaringan WiFi',
      'Allow local network access pada iPhone',
      'Follow setup wizard di aplikasi'
    ],
    'Kategori-5': [
      'Channel issue dari Biznet (Testing VIA VLC)'
    ],
    'Kategori-6': [
      'Hbrowser & Widget Solution incorrect',
      'Channel issue Biznet (Testing VLC)'
    ],
    'Kategori-7': [
      'Reinstall Widget Solution',
      'Reload IGCMP',
      'Confirmed IP conflict, changed IP, issue resolved'
    ],
    'Kategori-8': [
      'Restart Chromecast',
      'Reset Chromecast dibawa ke ruang server pencet tombol power 10 Detik'
    ],
    'Kategori-9': [
      'Pastikan Allow local Network pada Setingan Iphone',
      'Check VPN and Cast settings'
    ],
    'Kategori-10': [
      'Chromecast Power Adaptor Rusak',
      'Check Adaptor Chromecast'
    ],
    'Kategori-11': [
      'LAN Out Terpasang bukan LAN In'
    ],
    'Kategori-12': [
      'Check WiFi connection strength',
      'Restart Chromecast device',
      'Verify router settings',
      'Check for IP conflicts'
    ],
    'Kategori-13': [
      'Restart IPTV set-top box',
      'Check system firmware version',
      'Reinitialize system settings',
      'Contact technical support if persists'
    ],
    'Kategori-14': [
      'Verify user authentication status',
      'Check device registration',
      'Re-login to Google account',
      'Clear cast cache and retry'
    ]
  };

  return solutionsMap[category] || [];
}

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
    const chromecastDeviceNames = new Set();
    notifications.forEach(notif => {
      if (notif.reportedByStaffId) staffIds.add(notif.reportedByStaffId.toString());
      if (notif.assignedStaffId) staffIds.add(notif.assignedStaffId.toString());
      if (notif.handledByStaffId) staffIds.add(notif.handledByStaffId.toString());

      // Collect chromecast device names that need roomNr enrichment
      if (notif.source === 'chromecast' && (!notif.roomNo || notif.roomNo === 'N/A')) {
        chromecastDeviceNames.add(notif.deviceName);
      }
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

    // Fetch chromecast room numbers for devices with missing roomNo
    const chromecastRoomMap = {};
    if (chromecastDeviceNames.size > 0) {
      const chromecasts = await db.chromecast
        .find({ deviceName: { $in: Array.from(chromecastDeviceNames) } })
        .toArray();

      chromecasts.forEach(cc => {
        if (cc.roomNr) {
          chromecastRoomMap[cc.deviceName] = cc.roomNr;
        }
      });
    }

    // Generate metrics using the same logic as server.js STATUS GENERATION FUNCTIONS
    // This ensures consistency with Channels/TV/Chromecast pages
    const notificationsNeedingMetrics = notifications.filter(notif =>
      !notif.metrics || !notif.labeledMetrics
    );

    const metricsMap = {}; // Store metrics by notification ID

    if (notificationsNeedingMetrics.length > 0) {
      // Import status generation functions from server.js
      // These are the same functions used by /api/channels, /api/hospitality/tvs, /api/chromecast
      const CHANNEL_STATUS_CONFIG = {
        USE_DUMMY_STATUS: true,
        ONLINE_PROBABILITY: 0.94,
        RESPONSE_TIME_RANGE: { min: 8, max: 120 },
        SIGNAL_LEVEL_RANGE: { min: 60, max: 95 },
        BITRATE_RANGE: { min: 2500, max: 8000 }
      };

      const TV_STATUS_CONFIG = {
        USE_DUMMY_STATUS: true,
        ONLINE_PROBABILITY: 0.96,
        RESPONSE_TIME_RANGE: { min: 5, max: 150 }
      };

      const CHROMECAST_STATUS_CONFIG = {
        USE_DUMMY_STATUS: true,
        ONLINE_PROBABILITY: 0.96,
        SIGNAL_LEVEL_RANGE: { min: -70, max: -20 },
        SPEED_RANGE: { min: 10, max: 100 },
        RESPONSE_TIME_RANGE: { min: 10, max: 200 }
      };

      // Helper function to generate dummy channel metrics (same as server.js line 987-1063)
      const generateDummyChannelMetrics = () => {
        // Always generate realistic metrics (no online/offline check)
        // This matches the behavior of ChannelsPage where all channels have metrics
        const networkStats = {
          latency: Math.floor(Math.random() * 30) + 10,
          jitter: Math.floor(Math.random() * 12) + 2,
          packetLoss: parseFloat((Math.random() * 0.8).toFixed(2)),
          error: parseFloat((Math.random() * 2).toFixed(2)),
          recoveryTime: parseFloat((Math.random() * 6 + 1).toFixed(1))
        };

        const metrics = {
          packetLoss: networkStats.packetLoss,
          latency: networkStats.latency,
          jitter: networkStats.jitter,
          error: networkStats.error,
          recoveryTime: networkStats.recoveryTime
        };

        return {
          metrics: metrics,
          labeledMetrics: generateLabeledMetrics(metrics, false)
        };
      };

      // Helper function to generate dummy TV metrics (same as server.js line 1065-1134)
      const generateDummyTVMetrics = () => {
        // Always generate realistic metrics (no online/offline check)
        // This matches the behavior of HospitalityTVsPage where all TVs have metrics
        const networkStats = {
          latency: Math.floor(Math.random() * 40) + 8,
          jitter: Math.floor(Math.random() * 15) + 1,
          packetLoss: parseFloat((Math.random() * 1.5).toFixed(2)),
          error: parseFloat((Math.random() * 3).toFixed(2)),
          recoveryTime: parseFloat((Math.random() * 8 + 1).toFixed(1))
        };

        const metrics = {
          packetLoss: networkStats.packetLoss,
          latency: networkStats.latency,
          jitter: networkStats.jitter,
          error: networkStats.error,
          recoveryTime: networkStats.recoveryTime
        };

        return {
          metrics: metrics,
          labeledMetrics: generateLabeledMetrics(metrics, false)
        };
      };

      // Helper function to generate dummy chromecast metrics (same as server.js line 1136+)
      const generateDummyChromecastMetrics = () => {
        // Always generate realistic metrics (no online/offline check)
        // This matches the behavior of ChromecastPage where all chromecasts have metrics
        const networkStats = {
          latency: Math.floor(Math.random() * 50) + 15,
          jitter: Math.floor(Math.random() * 20) + 5,
          packetLoss: parseFloat((Math.random() * 1.2).toFixed(2)),
          error: parseFloat((Math.random() * 2.5).toFixed(2)),
          recoveryTime: parseFloat((Math.random() * 7 + 1).toFixed(1))
        };

        const metrics = {
          packetLoss: networkStats.packetLoss,
          latency: networkStats.latency,
          jitter: networkStats.jitter,
          error: networkStats.error,
          recoveryTime: networkStats.recoveryTime
        };

        return {
          metrics: metrics,
          labeledMetrics: generateLabeledMetrics(metrics, false)
        };
      };

      // Generate metrics for each notification that needs them
      notificationsNeedingMetrics.forEach(notif => {
        let generatedMetrics;

        if (notif.source === 'channel') {
          generatedMetrics = generateDummyChannelMetrics();
        } else if (notif.source === 'chromecast') {
          generatedMetrics = generateDummyChromecastMetrics();
        } else if (notif.source === 'tv') {
          generatedMetrics = generateDummyTVMetrics();
        } else {
          // Fallback for unknown sources
          const offlineMetrics = {
            packetLoss: 0,
            latency: 0,
            jitter: 0,
            error: 0,
            recoveryTime: 0
          };
          generatedMetrics = {
            metrics: offlineMetrics,
            labeledMetrics: generateLabeledMetrics(offlineMetrics, true)
          };
        }

        metricsMap[notif._id.toString()] = generatedMetrics;
      });
    }

    const populatedNotifications = notifications.map(notif => {
      // Calculate suggestedSolutions if not present but errorCategory exists
      let suggestedSolutions = notif.suggestedSolutions || [];

      // If no suggestedSolutions but we have errorCategory, try to match with FAQ
      if (!suggestedSolutions.length && notif.errorCategory) {
        suggestedSolutions = getSuggestedSolutionsForCategory(notif.errorCategory, notif);
      }

      // Enrich roomNo from chromecast collection for chromecast devices with N/A
      let enrichedRoomNo = notif.roomNo;
      if (notif.source === 'chromecast' && (!notif.roomNo || notif.roomNo === 'N/A') && chromecastRoomMap[notif.deviceName]) {
        enrichedRoomNo = chromecastRoomMap[notif.deviceName];
      }

      // Use metrics from notification or from pre-fetched source metrics
      // This ensures consistency with Channels/TV/Chromecast pages
      let metrics = notif.metrics;
      let labeledMetrics = notif.labeledMetrics;

      if (!metrics || !labeledMetrics) {
        // Use pre-fetched metrics from source collections
        const fetchedMetrics = metricsMap[notif._id.toString()];
        if (fetchedMetrics) {
          metrics = fetchedMetrics.metrics;
          labeledMetrics = fetchedMetrics.labeledMetrics;
          console.log(`[DEBUG] Using generated metrics for ${notif.notificationId}:`, {
            packetLoss: metrics.packetLoss,
            latency: metrics.latency
          });
        } else {
          console.log(`[DEBUG] No generated metrics found for ${notif.notificationId}, notification might already have metrics`);
        }
      }

      // Handle handledByStaff for resolved notifications
      // If notification is resolved but has no handledByStaff, use assignedStaff
      let handledByStaff = notif.handledByStaffId ? staffMap[notif.handledByStaffId.toString()] : null;

      if (!handledByStaff && notif.reportStatus === 'resolved' && notif.assignedStaffId) {
        // For resolved notifications without handledByStaff, assign it to assignedStaff
        handledByStaff = staffMap[notif.assignedStaffId.toString()];

        // Optionally update the database to persist this
        // (commented out to avoid excessive DB writes, can be enabled via a script)
        // db.collection('notifications').updateOne(
        //   { notificationId: notif.notificationId },
        //   { $set: { handledByStaffId: notif.assignedStaffId, handledByStaff: handledByStaff } }
        // );
      }

      const responseObj = {
        ...notif,
        roomNo: enrichedRoomNo, // Use enriched roomNo
        suggestedSolutions,
        metrics, // Add metrics
        labeledMetrics, // Add labeledMetrics
        reportedByStaff: notif.reportedByStaffId ? staffMap[notif.reportedByStaffId.toString()] : null,
        assignedStaff: notif.assignedStaffId ? staffMap[notif.assignedStaffId.toString()] : null,
        handledByStaff: handledByStaff, // Use our computed handledByStaff
      };

      return responseObj;
    });

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

    // Enrich roomNo from chromecast collection for chromecast devices with N/A
    let enrichedRoomNo = notification.roomNo;
    if (notification.source === 'chromecast' && (!notification.roomNo || notification.roomNo === 'N/A')) {
      const chromecast = await db.chromecast.findOne({ deviceName: notification.deviceName });
      if (chromecast && chromecast.roomNr) {
        enrichedRoomNo = chromecast.roomNr;
      }
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
      roomNo: enrichedRoomNo, // Use enriched roomNo
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
