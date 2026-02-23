const { ObjectId } = require('mongodb');
const { connectDB } = require('../autofix-db');

/**
 * Save notification to database
 * This ensures all notifications are stored for ML auto-fix processing
 */
async function saveNotificationToDB(notificationData) {
  try {
    const db = await connectDB();
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
    const db = await connectDB();
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
    const db = await connectDB();
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

module.exports = {
  saveNotificationToDB,
  saveNotificationsBatch,
  triggerMLPrediction,
  createAutoFixFromNotification
};
