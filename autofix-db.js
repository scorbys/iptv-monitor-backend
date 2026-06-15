require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const uri = process.env.MONGO_URL;

let client = null;
let isConnecting = false;

async function connectDB() {
  if (client && client.topology?.isConnected()) {
    try {
      await client.db('iptv').admin().ping();
      const db = client.db('iptv');
      return {
        notifications: db.collection('notifications'),
        autoFixLogs: db.collection('auto_fix_logs'),
        mlPredictions: db.collection('ml_predictions'),
        mlFeedback: db.collection('ml_feedback'),
        staff: db.collection('staff'),
        telegramSubscribers: db.collection('telegram_subscribers'),
        chromecast: db.collection('chromecast'),
        internationalChannels: db.collection('international_channels'),
        localChannels: db.collection('local_channels'),
        tvHospitality: db.collection('tv_hospitality'),
        client: client
      };
    } catch (error) {
      console.log('Connection test failed, reconnecting...');
      client = null;
    }
  }

  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (client && client.topology?.isConnected()) {
      const db = client.db('iptv');
      return {
        notifications: db.collection('notifications'),
        autoFixLogs: db.collection('auto_fix_logs'),
        mlPredictions: db.collection('ml_predictions'),
        mlFeedback: db.collection('ml_feedback'),
        staff: db.collection('staff'),
        telegramSubscribers: db.collection('telegram_subscribers'),
        chromecast: db.collection('chromecast'),
        internationalChannels: db.collection('international_channels'),
        localChannels: db.collection('local_channels'),
        tvHospitality: db.collection('tv_hospitality'),
        client: client
      };
    }
  }

  try {
    isConnecting = true;
    console.log('Connecting to MongoDB (AutoFix)...');

    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.log('Error closing existing client:', closeError.message);
      }
    }

    client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 20000,
      connectTimeoutMS: 15000,
      retryWrites: true,
      retryReads: true,
      maxIdleTimeMS: 30000,
      heartbeatFrequencyMS: 10000
    });

    await client.connect();
    console.log('Connected to MongoDB successfully (AutoFix)');

    const db = client.db('iptv');

    // Create indexes for better performance
    await createIndexes(db);

    return {
      notifications: db.collection('notifications'),
      autoFixLogs: db.collection('auto_fix_logs'),
      mlPredictions: db.collection('ml_predictions'),
      mlFeedback: db.collection('ml_feedback'),
      staff: db.collection('staff'),
      telegramSubscribers: db.collection('telegram_subscribers'),
      chromecast: db.collection('chromecast'),
      internationalChannels: db.collection('international_channels'),
      localChannels: db.collection('local_channels'),
      tvHospitality: db.collection('tv_hospitality'),
      client: client
    };
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    client = null;
    throw new Error('Database connection failed');
  } finally {
    isConnecting = false;
  }
}

async function createIndexes(db) {
  try {
    // Notifications collection indexes
    await db.collection('notifications').createIndex({ notificationId: 1 }, { unique: true });
    await db.collection('notifications').createIndex({ source: 1 });
    await db.collection('notifications').createIndex({ currentStatus: 1 });
    await db.collection('notifications').createIndex({ createdAt: -1 });
    await db.collection('notifications').createIndex({ errorCategory: 1 });

    // Auto-fix logs indexes
    await db.collection('auto_fix_logs').createIndex({ notificationId: 1 });
    await db.collection('auto_fix_logs').createIndex({ status: 1 });
    await db.collection('auto_fix_logs').createIndex({ executedAt: -1 });
    await db.collection('auto_fix_logs').createIndex({ mlPredictionId: 1 });
    await db.collection('auto_fix_logs').createIndex({ deviceType: 1, deviceId: 1 });
    await db.collection('auto_fix_logs').createIndex({ category: 1 });

    // Telegram subscribers collection indexes
    await db.collection('telegram_subscribers').createIndex({ chatId: 1 }, { unique: true });
    await db.collection('telegram_subscribers').createIndex({ active: 1 });
    await db.collection('telegram_subscribers').createIndex({ updatedAt: -1 });

    // ML predictions indexes
    await db.collection('ml_predictions').createIndex({ notificationId: 1 });
    await db.collection('ml_predictions').createIndex({ predictedCategory: 1 });
    await db.collection('ml_predictions').createIndex({ confidence: -1 });
    await db.collection('ml_predictions').createIndex({ createdAt: -1 });

    // ML feedback indexes
    await db.collection('ml_feedback').createIndex({ feedbackId: 1 }, { unique: true });
    await db.collection('ml_feedback').createIndex({ status: 1 });
    await db.collection('ml_feedback').createIndex({ correctedCategory: 1 });
    await db.collection('ml_feedback').createIndex({ createdAt: -1 });
    await db.collection('ml_feedback').createIndex({ source: 1, sourceId: 1 });

    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================

async function saveNotification(notificationData) {
  try {
    const { notifications } = await connectDB();

    const notificationDoc = {
      notificationId: notificationData.id,
      title: notificationData.title,
      message: notificationData.message,
      source: notificationData.source,
      type: notificationData.type,
      deviceName: notificationData.deviceName || null,
      roomNo: notificationData.roomNo || null,
      ipAddr: notificationData.ipAddr || null,
      error: notificationData.error || null,
      errorCategory: notificationData.errorCategory || null,
      currentStatus: notificationData.currentStatus || 'unknown',
      previousStatus: notificationData.previousStatus || null,
      isStatusChange: notificationData.isStatusChange || false,
      responseTime: notificationData.responseTime || null,
      signalLevel: notificationData.signalLevel || null,
      suggestedSolutions: notificationData.suggestedSolutions || [],
      rawDate: notificationData.rawDate,
      // Staff/Operator tracking for reporting
      reportedByStaffId: notificationData.reportedByStaffId || null, // Staff ID who reported/received this
      assignedStaffId: notificationData.assignedStaffId || null, // Staff ID assigned to handle
      handledByStaffId: notificationData.handledByStaffId || null, // Staff ID who handled the issue
      handlingStartTime: notificationData.handlingStartTime || null,
      handlingEndTime: notificationData.handlingEndTime || null,
      notes: notificationData.notes || [], // Array of {staffId, staffName, note, timestamp}
      reportStatus: notificationData.reportStatus || 'pending', // pending, investigating, resolved, closed
      priority: notificationData.priority || 'medium', // low, medium, high, critical
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await notifications.updateOne(
      { notificationId: notificationData.id },
      { $set: notificationDoc },
      { upsert: true }
    );

    console.log(`Notification saved: ${notificationData.id}`);
    return result;
  } catch (error) {
    console.error('Error saving notification:', error);
    throw error;
  }
}

async function getNotificationById(notificationId) {
  try {
    const { notifications } = await connectDB();
    const notification = await notifications.findOne({ notificationId: notificationId });
    return notification;
  } catch (error) {
    console.error('Error getting notification:', error);
    throw error;
  }
}

async function getNotificationsByStatus(status) {
  try {
    const { notifications } = await connectDB();
    const notifs = await notifications.find({ currentStatus: status }).toArray();
    return notifs;
  } catch (error) {
    console.error('Error getting notifications by status:', error);
    throw error;
  }
}

async function getRecentNotifications(limit = 50) {
  try {
    const { notifications } = await connectDB();
    const notifs = await notifications
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return notifs;
  } catch (error) {
    console.error('Error getting recent notifications:', error);
    throw error;
  }
}

// ==================== ML PREDICTION FUNCTIONS ====================

async function saveMLPrediction(predictionData) {
  try {
    const { mlPredictions } = await connectDB();

    const predictionDoc = {
      predictionId: new ObjectId().toString(),
      notificationId: predictionData.notificationId,
      inputText: predictionData.inputText,
      cleanedText: predictionData.cleanedText,
      predictedCategory: predictionData.predictedCategory,
      confidence: predictionData.confidence,
      probabilities: predictionData.probabilities || [],
      features: predictionData.features || {},
      suggestedSolutions: predictionData.suggestedSolutions || [],
      modelVersion: predictionData.modelVersion || '1.0.0',
      createdAt: new Date()
    };

    const result = await mlPredictions.insertOne(predictionDoc);
    console.log(`ML Prediction saved: ${result.insertedId}`);
    return { ...predictionDoc, _id: result.insertedId };
  } catch (error) {
    console.error('Error saving ML prediction:', error);
    throw error;
  }
}

async function getMLPredictionsByNotification(notificationId) {
  try {
    const { mlPredictions } = await connectDB();
    const predictions = await mlPredictions
      .find({ notificationId })
      .sort({ createdAt: -1 })
      .toArray();
    return predictions;
  } catch (error) {
    console.error('Error getting ML predictions:', error);
    throw error;
  }
}

async function getLatestMLPrediction(notificationId) {
  try {
    const { mlPredictions } = await connectDB();
    const prediction = await mlPredictions
      .find({ notificationId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    return prediction[0] || null;
  } catch (error) {
    console.error('Error getting latest ML prediction:', error);
    throw error;
  }
}

// ==================== AUTO-FIX FUNCTIONS ====================

async function createAutoFixLog(fixData) {
  try {
    const { autoFixLogs } = await connectDB();

    const fixLog = {
      fixId: new ObjectId().toString(),
      notificationId: fixData.notificationId,
      mlPredictionId: fixData.mlPredictionId || null,
      // Device metadata — primary, stable lookup keys for the device-centric UI.
      // notificationId stays supported but is no longer the only lookup key.
      deviceType: fixData.deviceType || null, // 'channel' | 'tv' | 'chromecast'
      deviceId: fixData.deviceId != null ? String(fixData.deviceId) : null, // stable internal id
      deviceName: fixData.deviceName || null, // channel/device name or "Room xxx"
      roomNo: fixData.roomNo != null ? fixData.roomNo : null, // TV/Chromecast only
      source: fixData.source || null, // 'channel'|'hospitality'|'chromecast'|'notification'|'manual'
      fixType: fixData.fixType, // 'automatic', 'manual', 'hybrid'
      category: fixData.category,
      action: fixData.action,
      description: fixData.description,
      command: fixData.command || null,
      status: 'pending', // pending, executing, success, failed, cancelled
      confidence: fixData.confidence || null,
      createdBy: fixData.createdBy || 'system', // 'system', 'user', 'ml' or userId
      // Operator tracking
      triggeredBy: fixData.triggeredBy || null, // User ID who manually triggered
      approvedBy: fixData.approvedBy || null, // User ID who approved (if manual approval required)
      executedBy: fixData.executedBy || null, // User ID or 'system' who executed
      createdAt: new Date(),
      executedAt: null,
      completedAt: null,
      result: null,
      errorMessage: null,
      retryCount: 0,
      maxRetries: 3,
      notes: fixData.notes || [] // Array of {userId, note, timestamp}
    };

    const result = await autoFixLogs.insertOne(fixLog);
    console.log(`Auto-fix log created: ${result.insertedId}`);
    return { ...fixLog, _id: result.insertedId };
  } catch (error) {
    console.error('Error creating auto-fix log:', error);
    throw error;
  }
}

async function executeAutoFix(fixId) {
  try {
    const { autoFixLogs } = await connectDB();

    await autoFixLogs.updateOne(
      { fixId: fixId },
      {
        $set: {
          status: 'executing',
          executedAt: new Date()
        }
      }
    );

    console.log(`Auto-fix execution started: ${fixId}`);
    return { success: true };
  } catch (error) {
    console.error('Error executing auto-fix:', error);
    throw error;
  }
}

async function completeAutoFix(fixId, resultData) {
  try {
    const { autoFixLogs } = await connectDB();

    const updateData = {
      status: resultData.success ? 'success' : 'failed',
      completedAt: new Date(),
      result: resultData.result || null
    };

    if (resultData.errorMessage) {
      updateData.errorMessage = resultData.errorMessage;
    }

    await autoFixLogs.updateOne(
      { fixId: fixId },
      { $set: updateData }
    );

    console.log(`Auto-fix completed: ${fixId} - ${updateData.status}`);
    return { success: true };
  } catch (error) {
    console.error('Error completing auto-fix:', error);
    throw error;
  }
}

async function retryAutoFix(fixId) {
  try {
    const { autoFixLogs } = await connectDB();

    const fix = await autoFixLogs.findOne({ fixId: fixId });

    if (!fix) {
      throw new Error('Auto-fix log not found');
    }

    if (fix.retryCount >= fix.maxRetries) {
      throw new Error('Maximum retry attempts reached');
    }

    await autoFixLogs.updateOne(
      { fixId: fixId },
      {
        $inc: { retryCount: 1 },
        $set: {
          status: 'pending',
          errorMessage: null
        }
      }
    );

    console.log(`Auto-fix retry queued: ${fixId} (attempt ${fix.retryCount + 1})`);
    return { success: true, retryCount: fix.retryCount + 1 };
  } catch (error) {
    console.error('Error retrying auto-fix:', error);
    throw error;
  }
}

async function cancelAutoFix(fixId) {
  try {
    const { autoFixLogs } = await connectDB();

    await autoFixLogs.updateOne(
      { fixId: fixId },
      {
        $set: {
          status: 'cancelled',
          completedAt: new Date()
        }
      }
    );

    console.log(`Auto-fix cancelled: ${fixId}`);
    return { success: true };
  } catch (error) {
    console.error('Error cancelling auto-fix:', error);
    throw error;
  }
}

async function getAutoFixLogsByNotification(notificationId) {
  try {
    const { autoFixLogs } = await connectDB();
    const logs = await autoFixLogs
      .find({ notificationId })
      .sort({ createdAt: -1 })
      .toArray();
    return logs;
  } catch (error) {
    console.error('Error getting auto-fix logs:', error);
    throw error;
  }
}

async function getPendingAutoFixes() {
  try {
    const { autoFixLogs } = await connectDB();
    const logs = await autoFixLogs
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .toArray();
    return logs;
  } catch (error) {
    console.error('Error getting pending auto-fixes:', error);
    throw error;
  }
}

async function getAutoFixStats() {
  try {
    const { autoFixLogs } = await connectDB();

    const total = await autoFixLogs.countDocuments();
    const success = await autoFixLogs.countDocuments({ status: 'success' });
    const failed = await autoFixLogs.countDocuments({ status: 'failed' });
    const pending = await autoFixLogs.countDocuments({ status: 'pending' });
    const executing = await autoFixLogs.countDocuments({ status: 'executing' });

    return {
      total,
      success,
      failed,
      pending,
      executing,
      successRate: total > 0 ? ((success / total) * 100).toFixed(2) : 0
    };
  } catch (error) {
    console.error('Error getting auto-fix stats:', error);
    throw error;
  }
}

// ==================== CLEANUP FUNCTIONS ====================

async function cleanOldNotifications(daysOld = 7) {
  try {
    const { notifications } = await connectDB();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await notifications.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned ${result.deletedCount} old notifications`);
    return result;
  } catch (error) {
    console.error('Error cleaning old notifications:', error);
    throw error;
  }
}

async function cleanOldAutoFixLogs(daysOld = 30) {
  try {
    const { autoFixLogs } = await connectDB();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await autoFixLogs.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['success', 'failed', 'cancelled'] }
    });

    console.log(`Cleaned ${result.deletedCount} old auto-fix logs`);
    return result;
  } catch (error) {
    console.error('Error cleaning old auto-fix logs:', error);
    throw error;
  }
}

async function cleanOldMLPredictions(daysOld = 30) {
  try {
    const { mlPredictions } = await connectDB();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await mlPredictions.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned ${result.deletedCount} old ML predictions`);
    return result;
  } catch (error) {
    console.error('Error cleaning old ML predictions:', error);
    throw error;
  }
}

// ==================== NOTIFICATION WITH STAFF FUNCTIONS ====================

/**
 * Get notification with staff details populated
 * Returns notification with reportedByStaff, assignedStaff, handledByStaff objects
 */
async function getNotificationWithStaffDetails(notificationId) {
  try {
    const { notifications, staff } = await connectDB();

    const notification = await notifications.findOne({ notificationId });

    if (!notification) {
      return null;
    }

    // Get staff details for each staff ID
    const staffIds = [];
    if (notification.reportedByStaffId) staffIds.push(new ObjectId(notification.reportedByStaffId));
    if (notification.assignedStaffId) staffIds.push(new ObjectId(notification.assignedStaffId));
    if (notification.handledByStaffId) staffIds.push(new ObjectId(notification.handledByStaffId));

    let staffMap = {};
    if (staffIds.length > 0) {
      const staffMembers = await staff.find({ _id: { $in: staffIds } }).toArray();
      staffMembers.forEach(s => {
        staffMap[s._id.toString()] = {
          id: s._id.toString(),
          name: s.name,
          email: s.email,
          department: s.department,
          position: s.position,
          phone: s.phone
        };
      });
    }

    return {
      ...notification,
      reportedByStaff: notification.reportedByStaffId ? staffMap[notification.reportedByStaffId.toString()] : null,
      assignedStaff: notification.assignedStaffId ? staffMap[notification.assignedStaffId.toString()] : null,
      handledByStaff: notification.handledByStaffId ? staffMap[notification.handledByStaffId.toString()] : null
    };
  } catch (error) {
    console.error('Error getting notification with staff details:', error);
    throw error;
  }
}

/**
 * Get recent notifications with staff details
 */
async function getRecentNotificationsWithStaff(limit = 50) {
  try {
    const { notifications, staff } = await connectDB();

    const notificationList = await notifications
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // Collect all unique staff IDs
    const staffIds = new Set();
    notificationList.forEach(notif => {
      if (notif.reportedByStaffId) staffIds.add(notif.reportedByStaffId.toString());
      if (notif.assignedStaffId) staffIds.add(notif.assignedStaffId.toString());
      if (notif.handledByStaffId) staffIds.add(notif.handledByStaffId.toString());
    });

    // Fetch all staff members
    let staffMap = {};
    if (staffIds.size > 0) {
      const staffMembers = await staff
        .find({ _id: { $in: Array.from(staffIds).map(id => new ObjectId(id)) } })
        .toArray();

      staffMembers.forEach(s => {
        staffMap[s._id.toString()] = {
          id: s._id.toString(),
          name: s.name,
          email: s.email,
          department: s.department,
          position: s.position,
          phone: s.phone
        };
      });
    }

    // Attach staff details to notifications
    return notificationList.map(notif => ({
      ...notif,
      reportedByStaff: notif.reportedByStaffId ? staffMap[notif.reportedByStaffId.toString()] : null,
      assignedStaff: notif.assignedStaffId ? staffMap[notif.assignedStaffId.toString()] : null,
      handledByStaff: notif.handledByStaffId ? staffMap[notif.handledByStaffId.toString()] : null
    }));
  } catch (error) {
    console.error('Error getting recent notifications with staff:', error);
    return [];
  }
}

/**
 * Assign notification to staff member
 */
async function assignNotificationToStaff(notificationId, staffId, assignedBy) {
  try {
    const { notifications } = await connectDB();

    const result = await notifications.updateOne(
      { notificationId },
      {
        $set: {
          assignedStaffId: staffId,
          assignedAt: new Date(),
          assignedBy: assignedBy,
          reportStatus: 'investigating',
          updatedAt: new Date()
        }
      }
    );

    console.log(`Notification ${notificationId} assigned to staff ${staffId}`);
    return result;
  } catch (error) {
    console.error('Error assigning notification to staff:', error);
    throw error;
  }
}

/**
 * Update notification handling status by staff
 */
async function updateNotificationHandlingByStaff(notificationId, staffId, statusData) {
  try {
    const { notifications } = await connectDB();

    const updateDoc = {
      ...statusData,
      updatedAt: new Date()
    };

    // If marking as resolved/completed, set handling end time
    if (statusData.reportStatus === 'resolved' || statusData.reportStatus === 'closed') {
      updateDoc.handledByStaffId = staffId;
      updateDoc.handlingEndTime = new Date();
    }

    const result = await notifications.updateOne(
      { notificationId },
      { $set: updateDoc }
    );

    console.log(`Notification ${notificationId} updated by staff ${staffId}`);
    return result;
  } catch (error) {
    console.error('Error updating notification handling:', error);
    throw error;
  }
}

/**
 * Add note to notification from staff
 */
async function addNoteToNotification(notificationId, staffId, staffName, note) {
  try {
    const { notifications } = await connectDB();

    const result = await notifications.updateOne(
      { notificationId },
      {
        $push: {
          notes: {
            staffId: staffId,
            staffName: staffName,
            note: note,
            timestamp: new Date()
          }
        },
        $set: { updatedAt: new Date() }
      }
    );

    console.log(`Note added to notification ${notificationId} by staff ${staffName}`);
    return result;
  } catch (error) {
    console.error('Error adding note to notification:', error);
    throw error;
  }
}

// ==================== CONNECTION MANAGEMENT ====================

async function closeConnection() {
  if (client) {
    try {
      await client.close();
      client = null;
      console.log('MongoDB connection closed (AutoFix)');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
}

process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);
process.on('beforeExit', closeConnection);

/**
 * Update notification with handled by staff info
 */
async function updateNotificationStaffHandled(notificationId, staffInfo) {
  try {
    const db = await connectDB();

    const updateData = {
      handledByStaff: {
        id: staffInfo.id,
        name: staffInfo.name,
        email: staffInfo.email,
        department: staffInfo.department
      },
      handledAt: new Date(),
      reportStatus: 'resolved'
    };

    const result = await db.collection('notifications').updateOne(
      { notificationId: notificationId },
      { $set: updateData }
    );

    console.log(`Notification ${notificationId} marked as handled by ${staffInfo.name}`);
    return { success: true, result };

  } catch (error) {
    console.error('Error updating notification staff handled:', error);
    return { success: false, error: error.message };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  connectDB,

  // Notification functions
  saveNotification,
  getNotificationById,
  getNotificationsByStatus,
  getRecentNotifications,
  getNotificationWithStaffDetails,
  getRecentNotificationsWithStaff,
  assignNotificationToStaff,
  updateNotificationHandlingByStaff,
  addNoteToNotification,
  updateNotificationStaffHandled,

  // ML Prediction functions
  saveMLPrediction,
  getMLPredictionsByNotification,
  getLatestMLPrediction,

  // Auto-fix functions
  createAutoFixLog,
  executeAutoFix,
  completeAutoFix,
  retryAutoFix,
  cancelAutoFix,
  getAutoFixLogsByNotification,
  getPendingAutoFixes,
  getAutoFixStats,

  // Cleanup functions
  cleanOldNotifications,
  cleanOldAutoFixLogs,
  cleanOldMLPredictions,

  // Connection management
  closeConnection
};
