const { ObjectId } = require('mongodb');
const { connectDB } = require('../autofix-db');

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
 * Auto-resolve notifications when device comes back online
 * Called when device status changes from offline to online
 */
async function autoResolveNotification(deviceIdentifier) {
  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Find pending notifications for this device
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
  autoResolveNotification,
  autoCloseOldNotifications,
  cleanupOldNotifications,
  getNotificationStats
};
