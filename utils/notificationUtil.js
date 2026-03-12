const { ObjectId } = require('mongodb');
const { connectDB } = require('../autofix-db');

/**
 * Get priority level from ML category
 * Maps categories to priority levels based on severity
 */
function getPriorityFromCategory(category) {
  const priorityMap = {
    'Kategori-1': 'high',      // No device found - critical
    'Kategori-2': 'high',      // Weak signal - affects service
    'Kategori-3': 'high',      // Unplug LAN - critical
    'Kategori-4': 'medium',    // Setup issue - can wait
    'Kategori-5': 'medium',    // Error playing - moderate
    'Kategori-6': 'high',      // Player error - critical
    'Kategori-7': 'high',      // Connection failure - critical
    'Kategori-8': 'low',       // Reset config - low priority
    'Kategori-9': 'high',      // No device logged - critical
    'Kategori-10': 'high',     // Black screen - critical
    'Kategori-11': 'medium',   // Channel not found - moderate
    'Kategori-12': 'high',     // Network failed - critical
    'Kategori-13': 'high',     // System error - critical
    'Kategori-14': 'medium',   // Logined issue - moderate
  };

  return priorityMap[category] || 'medium';
}

// Configuration
const NOTIFICATION_CONFIG = {
  // Cooldown period before creating new notification for same device (minutes)
  NOTIFICATION_COOLDOWN: 30,

  // Auto-resolve notifications after device is online for X minutes
  AUTO_RESOLVE_DELAY: 5,

  // Auto-close old resolved notifications after X days
  AUTO_CLOSE_AFTER_DAYS: 7,

  // Maximum notifications to keep per device
  MAX_NOTIFICATIONS_PER_DEVICE: 100
};

/**
 * Check if notification already exists for this device recently
 * Prevents duplicate notifications for the same ongoing issue
 */
async function checkExistingNotification(deviceIdentifier) {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Check for pending notification for same device within cooldown period
    const cooldownDate = new Date();
    cooldownDate.setMinutes(cooldownDate.getMinutes() - NOTIFICATION_CONFIG.NOTIFICATION_COOLDOWN);

    const existingNotification = await notifications.findOne({
      $or: [
        { ipAddr: deviceIdentifier },
        { deviceName: deviceIdentifier },
        { roomNo: deviceIdentifier }
      ],
      reportStatus: { $in: ['pending', 'investigating'] },
      createdAt: { $gte: cooldownDate }
    });

    if (existingNotification) {
      console.log(`[Notification] Existing notification found: ${existingNotification.notificationId}`);
      return {
        exists: true,
        notificationId: existingNotification.notificationId,
        message: 'Notification already exists for this device'
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('[Notification] Error checking existing notification:', error);
    return { exists: false };
  }
}

/**
 * Save notification to database with deduplication
 * Only creates notification if one doesn't exist for same device recently
 */
async function saveNotificationToDB(notificationData) {
  try {
    // Check for existing notification first
    const deviceIdentifier = notificationData.ipAddr ||
                           notificationData.deviceName ||
                           notificationData.roomNo;

    if (!deviceIdentifier) {
      console.warn('[Notification] No device identifier provided');
      return { success: false, error: 'No device identifier' };
    }

    const existing = await checkExistingNotification(deviceIdentifier);
    if (existing.exists) {
      return {
        success: true,
        skipped: true,
        notificationId: existing.notificationId,
        message: existing.message
      };
    }

    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Generate notification ID
    const notificationId = `${notificationData.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare notification document
    const notification = {
      notificationId: notificationId,
      title: notificationData.title || `${notificationData.source.charAt(0).toUpperCase() + notificationData.source.slice(1)} Offline`,
      message: notificationData.message,
      source: notificationData.source, // channel, tv, chromecast
      type: 'offline',
      deviceName: notificationData.deviceName || null,
      roomNo: notificationData.roomNo || null,
      ipAddr: notificationData.ipAddr || null,
      error: notificationData.error || null,
      errorCategory: null, // Will be filled by ML prediction
      currentStatus: notificationData.currentStatus || 'offline',
      reportStatus: 'pending', // pending, investigating, resolved, closed
      priority: 'medium', // low, medium, high, critical (will be updated by ML)

      // Device identifier for deduplication
      deviceIdentifier: deviceIdentifier,

      // Flag to identify startup notifications (created during system startup)
      isStartup: notificationData.isStartup || false,

      // Staff tracking (will be populated later)
      reportedByStaffId: null,
      assignedStaffId: null,
      handledByStaffId: null,
      handlingStartTime: null,
      handlingEndTime: null,

      // Notes array
      notes: [],

      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Insert to database
    const result = await notifications.insertOne(notification);

    console.log(`[Notification] Saved to DB: ${notificationId} - ${notification.message}`);

    // Trigger ML prediction, auto-fix, and staff assignment asynchronously (don't wait)
    setImmediate(async () => {
      try {
        console.log(`[Notification] Starting async processing for: ${notificationId}`);

        // 1. Get ML prediction for this notification
        console.log(`[Notification] Step 1: Triggering ML prediction for ${notificationId}...`);
        const mlResult = await triggerMLPrediction(notificationId);
        console.log(`[Notification] ML prediction result:`, mlResult.success ? 'SUCCESS' : 'FAILED');

        // 2. Create auto-fix log based on ML prediction
        if (mlResult.success) {
          console.log(`[Notification] Step 2: Creating auto-fix for ${notificationId}...`);
          await createAutoFixFromNotification(notificationId, 'automatic');
          console.log(`[Notification] ML prediction and auto-fix created for: ${notificationId}`);
        } else {
          console.log(`[Notification] Skipping auto-fix creation due to ML prediction failure`);
        }

        // 3. Assign staff automatically (based on workload balancing)
        console.log(`[Notification] Step 3: Assigning staff to ${notificationId}...`);
        const staffResult = await assignStaffToNotification(notificationId);
        if (staffResult.success) {
          console.log(`[Notification] Staff assigned: ${staffResult.assignedStaffName} (workload: ${staffResult.workload})`);
        } else {
          console.error(`[Notification] Staff assignment FAILED:`, staffResult.error);
        }

        console.log(`[Notification] ✅ Async processing completed for: ${notificationId}`);
      } catch (error) {
        console.error(`[Notification] ❌ Error in ML/AutoFix/Staff processing for ${notificationId}:`, error);
      }
    });

    return {
      success: true,
      notificationId: notificationId,
      _id: result.insertedId
    };
  } catch (error) {
    console.error('[Notification] Error saving to DB:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Batch save notifications to database
 * Used when multiple notifications occur at once
 */
async function saveNotificationsBatch(notificationsArray) {
  try {
    const results = await Promise.all(
      notificationsArray.map(notification => saveNotificationToDB(notification))
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[Notification] Batch save: ${successCount} success, ${failCount} failed`);

    return {
      success: true,
      total: notificationsArray.length,
      successCount,
      failCount,
      results
    };
  } catch (error) {
    console.error('[Notification] Error in batch save:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Trigger ML prediction for a notification
 * This will categorize the error and suggest auto-fix
 */
async function triggerMLPrediction(notificationId) {
  try {
    // Import ML service utility
    const { predict } = require('./mlService.util');

    // Get notification details
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notification = await db.collection('notifications')
      .findOne({ notificationId: notificationId });

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Prepare text for ML prediction
    const predictionText = `${notification.message} ${notification.error || ''} ${notification.deviceName || ''}`;

    // Call ML prediction
    const mlResult = await predict(predictionText);

    // Update notification with ML results
    await db.collection('notifications').updateOne(
      { notificationId: notificationId },
      {
        $set: {
          errorCategory: mlResult.predicted_label,
          mlConfidence: mlResult.probabilities ? mlResult.probabilities[0]?.probability : null,
          updatedAt: new Date()
        }
      }
    );

    console.log(`[Notification] ML prediction for ${notificationId}: ${mlResult.predicted_label}`);

    return {
      success: true,
      notificationId,
      prediction: mlResult
    };
  } catch (error) {
    console.error('[Notification] Error triggering ML prediction:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create auto-fix log from notification
 */
async function createAutoFixFromNotification(notificationId, fixType = 'automatic') {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notification = await db.collection('notifications')
      .findOne({ notificationId: notificationId });

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Check if ML service is available and trained
    const mlService = require('./mlService.util');
    let mlPrediction = null;

    try {
      const predictionText = `${notification.message} ${notification.error || ''} ${notification.deviceName || ''}`;
      mlPrediction = await mlService.predict(predictionText);
    } catch (mlError) {
      console.log('[AutoFix] ML service not available, using category from notification');
    }

    const category = mlPrediction?.predicted_label || notification.errorCategory || 'unknown';

    // Create auto-fix log
    const autoFixLog = {
      fixId: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      notificationId: notificationId,
      mlPredictionId: mlPrediction?.predictionId || null,
      fixType: fixType,
      category: category,
      action: 'analyze',
      description: `Auto-fix triggered for ${notification.source} offline: ${notification.deviceName || notification.roomNo}`,
      status: 'pending',
      confidence: mlPrediction?.probabilities?.[0]?.probability || null,

      // Staff tracking
      createdBy: 'system',
      triggeredBy: null,
      approvedBy: null,
      executedBy: null,

      createdAt: new Date(),
      executedAt: null,
      completedAt: null
    };

    const result = await db.collection('auto_fix_logs').insertOne(autoFixLog);

    // Update notification with suggested solutions from ML
    if (mlPrediction?.suggestedSolutions && mlPrediction.suggestedSolutions.length > 0) {
      await db.collection('notifications').updateOne(
        { notificationId: notificationId },
        {
          $set: {
            suggestedSolutions: mlPrediction.suggestedSolutions,
            errorCategory: mlPrediction.predicted_label,
            priority: getPriorityFromCategory(mlPrediction.predicted_label),
            updatedAt: new Date()
          }
        }
      );
      console.log(`[Notification] Updated ${notificationId} with ${mlPrediction.suggestedSolutions.length} suggested solutions`);
    }

    console.log(`[AutoFix] Created auto-fix log: ${autoFixLog.fixId} for notification: ${notificationId}`);

    return {
      success: true,
      fixId: autoFixLog.fixId,
      _id: result.insertedId,
      autoFixLog
    };
  } catch (error) {
    console.error('[AutoFix] Error creating auto-fix from notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update staff statistics when notification is resolved
 * Increases totalResolved and recalculates success rate
 */
/**
 * Calculate credit weight based on staff position and department
 * Returns a value between 0 and 1 indicating how much credit to give for a fix
 *
 * Full credit (1.0):
 *   - Finance department (Admin, IT Staff)
 *   - Vendor department (Admin, IT Staff, Vendor Staff)
 *
 * Moderate credit (0.5):
 *   - Engineering department (Technician)
 *
 * Minimal credit (0.2):
 *   - Other department (Staff)
 *   - Front Office department (Staff)
 */
function calculateStaffCreditWeight(staff) {
  const position = staff.position?.toLowerCase() || '';
  const department = staff.department?.toLowerCase() || '';

  // Full credit for Finance department with Admin or IT Staff position
  if (department === 'finance' && (position === 'admin' || position === 'it staff')) {
    console.log(`[StaffStats] Full credit (1.0) for ${staff.name}: Finance department with ${staff.position} position`);
    return 1.0;
  }

  // Full credit for Vendor department with Admin, IT Staff, or Vendor Staff position
  if (department === 'vendor' && (position === 'admin' || position === 'it staff' || position === 'vendor staff')) {
    console.log(`[StaffStats] Full credit (1.0) for ${staff.name}: Vendor department with ${staff.position} position`);
    return 1.0;
  }

  // Moderate credit for Engineering department with Technician position
  if (department === 'engineering' && position === 'technician') {
    console.log(`[StaffStats] Moderate credit (0.5) for ${staff.name}: Engineering department with Technician position`);
    return 0.5;
  }

  // Minimal credit for Other department with Staff position
  if (department === 'other' && position === 'staff') {
    console.log(`[StaffStats] Minimal credit (0.2) for ${staff.name}: Other department with Staff position`);
    return 0.2;
  }

  // Minimal credit for Front Office department with Staff position
  if (department === 'front office' && position === 'staff') {
    console.log(`[StaffStats] Minimal credit (0.2) for ${staff.name}: Front Office department with Staff position`);
    return 0.2;
  }

  // Default to moderate credit for other combinations
  console.log(`[StaffStats] Moderate credit (0.5) for ${staff.name}: department="${staff.department}", position="${staff.position}"`);
  return 0.5;
}

async function updateStaffStatsOnResolution(notification) {
  try {
    if (!notification.assignedStaffId) {
      return { success: true, noStaff: true };
    }

    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get current staff stats
    const staff = await db.collection('staff').findOne({
      _id: new ObjectId(notification.assignedStaffId)
    });

    if (!staff) {
      console.warn(`[StaffStats] Staff not found: ${notification.assignedStaffId}`);
      return { success: false, error: 'Staff not found' };
    }

    // Calculate credit weight based on position and department
    const creditWeight = calculateStaffCreditWeight(staff);

    // Calculate resolution time if available
    let resolutionTime = 0;
    if (notification.handlingStartTime) {
      const endTime = notification.handlingEndTime || new Date();
      resolutionTime = new Date(endTime).getTime() - new Date(notification.handlingStartTime).getTime();
      resolutionTime = Math.floor(resolutionTime / 1000 / 60); // Convert to minutes
    }

    // Update staff stats with weighted credit
    const currentTotalResolved = staff.stats?.totalResolved || 0;
    const newTotalResolved = currentTotalResolved + creditWeight;
    const newTotalAssigned = staff.stats?.totalAssigned || 0;

    // Calculate new success rate (resolved / assigned * 100), capped at 100%
    const newSuccessRate = newTotalAssigned > 0
      ? Math.min((newTotalResolved / newTotalAssigned) * 100, 100)
      : 0;

    // Calculate new average resolution time
    let newAvgResolutionTime = staff.stats?.avgResolutionTime || 0;
    if (resolutionTime > 0) {
      const currentTotal = newAvgResolutionTime * currentTotalResolved;
      newAvgResolutionTime = Math.floor((currentTotal + resolutionTime) / (currentTotalResolved + 1));
    }

    await db.collection('staff').updateOne(
      { _id: new ObjectId(notification.assignedStaffId) },
      {
        $set: {
          'stats.totalResolved': parseFloat(newTotalResolved.toFixed(2)),
          'stats.successRate': parseFloat(newSuccessRate.toFixed(2)),
          'stats.avgResolutionTime': newAvgResolutionTime,
          updatedAt: new Date()
        }
      }
    );

    console.log(`[StaffStats] Updated stats for ${staff.name}: resolved=${newTotalResolved.toFixed(2)} (weight=${creditWeight}), successRate=${newSuccessRate.toFixed(1)}%`);

    return {
      success: true,
      staffId: notification.assignedStaffId,
      newTotalResolved,
      newSuccessRate,
      creditWeight
    };
  } catch (error) {
    console.error('[StaffStats] Error updating staff stats:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Auto-resolve notifications when device comes back online
 * Called when device status changes from offline to online
 */
async function autoResolveNotification(deviceIdentifier) {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Find pending notifications for this device BEFORE updating
    const pendingNotifications = await notifications.find({
      $or: [
        { ipAddr: deviceIdentifier },
        { deviceName: deviceIdentifier },
        { roomNo: deviceIdentifier }
      ],
      reportStatus: { $in: ['pending', 'investigating'] },
      currentStatus: 'offline'
    }).toArray();

    if (pendingNotifications.length === 0) {
      return { success: true, matchedCount: 0, modifiedCount: 0 };
    }

    // Update notifications to resolved
    const result = await notifications.updateMany(
      {
        $or: [
          { ipAddr: deviceIdentifier },
          { deviceName: deviceIdentifier },
          { roomNo: deviceIdentifier }
        ],
        reportStatus: { $in: ['pending', 'investigating'] },
        currentStatus: 'offline'
      },
      {
        $set: {
          currentStatus: 'online',
          reportStatus: 'resolved',
          handlingEndTime: new Date(),
          updatedAt: new Date(),
          resolvedReason: 'Device recovered automatically'
        }
      }
    );

    if (result.matchedCount > 0) {
      console.log(`[Notification] Auto-resolved ${result.matchedCount} notification(s) for device: ${deviceIdentifier}`);

      // Update staff stats for each resolved notification
      for (const notification of pendingNotifications) {
        await updateStaffStatsOnResolution(notification);
      }
    }

    return {
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error('[Notification] Error auto-resolving notifications:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Auto-close old resolved notifications
 * Should be run periodically (e.g., daily)
 */
async function autoCloseOldNotifications() {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - NOTIFICATION_CONFIG.AUTO_CLOSE_AFTER_DAYS);

    const result = await notifications.updateMany(
      {
        reportStatus: 'resolved',
        updatedAt: { $lt: cutoffDate }
      },
      {
        $set: {
          reportStatus: 'closed',
          updatedAt: new Date()
        }
      }
    );

    console.log(`[Notification] Auto-closed ${result.modifiedCount} old notifications`);

    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error('[Notification] Error auto-closing old notifications:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean up very old notifications to prevent database bloat
 * Deletes notifications older than X days
 */
async function cleanupOldNotifications() {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Delete notifications older than 7 days (matches frontend cleanup)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    // Find old notifications first (for logging)
    const oldNotifications = await notifications.find({
      createdAt: { $lt: cutoffDate }
    }).toArray();

    if (oldNotifications.length > 0) {
      // Delete old notifications
      const deleteResult = await notifications.deleteMany({
        createdAt: { $lt: cutoffDate }
      });

      console.log(`[Notification] Cleaned up ${deleteResult.deletedCount} old notifications (older than 7 days)`);

      return {
        success: true,
        deletedCount: deleteResult.deletedCount
      };
    }

    return { success: true, deletedCount: 0 };
  } catch (error) {
    console.error('[Notification] Error cleaning up old notifications:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Assign staff to notification automatically
 * Selects staff based on priority, workload, and availability
 */
async function assignStaffToNotification(notificationId) {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // Get notification details
    const notification = await db.collection('notifications')
      .findOne({ notificationId: notificationId });

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Don't reassign if already assigned
    if (notification.assignedStaffId) {
      return {
        success: true,
        alreadyAssigned: true,
        assignedStaffId: notification.assignedStaffId
      };
    }

    // Get available staff (not deleted, active)
    const availableStaff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    if (availableStaff.length === 0) {
      console.log('[StaffAssignment] No available staff found');
      return { success: false, error: 'No available staff' };
    }

    // Get current workload for each staff member
    const staffWithWorkload = await Promise.all(
      availableStaff.map(async (staff) => {
        const activeAssignments = await db.collection('notifications').countDocuments({
          assignedStaffId: staff._id.toString(),
          reportStatus: { $in: ['pending', 'investigating'] }
        });

        return {
          ...staff,
          currentWorkload: activeAssignments
        };
      })
    );

    // Sort by workload (ascending) - assign to staff with least workload
    staffWithWorkload.sort((a, b) => a.currentWorkload - b.currentWorkload);

    // Get staff with minimum workload
    const minWorkload = staffWithWorkload[0].currentWorkload;
    const availableStaffWithMinWorkload = staffWithWorkload.filter(
      staff => staff.currentWorkload === minWorkload
    );

    // Randomly select from staff with minimum workload
    const selectedStaff = availableStaffWithMinWorkload[
      Math.floor(Math.random() * availableStaffWithMinWorkload.length)
    ];

    // Assign staff to notification
    await db.collection('notifications').updateOne(
      { notificationId: notificationId },
      {
        $set: {
          assignedStaffId: selectedStaff._id.toString(),
          handlingStartTime: new Date(), // Start tracking resolution time
          updatedAt: new Date()
        }
      }
    );

    // Update staff stats
    await db.collection('staff').updateOne(
      { _id: selectedStaff._id },
      {
        $inc: {
          'stats.totalAssigned': 1
        },
        $set: {
          updatedAt: new Date()
        }
      }
    );

    console.log(`[StaffAssignment] Assigned ${selectedStaff.name} to notification ${notificationId}`);

    return {
      success: true,
      assignedStaffId: selectedStaff._id.toString(),
      assignedStaffName: selectedStaff.name,
      workload: selectedStaff.currentWorkload
    };
  } catch (error) {
    console.error('[StaffAssignment] Error assigning staff:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get notification statistics
 */
async function getNotificationStats() {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    const stats = await notifications.aggregate([
      {
        $group: {
          _id: '$reportStatus',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const total = await notifications.countDocuments();

    return {
      success: true,
      total,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('[Notification] Error getting stats:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  NOTIFICATION_CONFIG,
  saveNotificationToDB,
  saveNotificationsBatch,
  triggerMLPrediction,
  createAutoFixFromNotification,
  assignStaffToNotification,
  updateStaffStatsOnResolution,
  autoResolveNotification,
  autoCloseOldNotifications,
  cleanupOldNotifications,
  getNotificationStats
};
