/**
 * EXAMPLE: How to integrate sync wrapper dengan db.js functions
 * Copy-paste dan modify sesuai dengan kebutuhan Anda
 */

// ==================== IMPORTS ====================
const { insertWithSync, updateWithSync, deleteWithSync, bulkInsertWithSync } = require('./utils/dbSyncWrapper');

// ==================== CONTOH: INSERTS DENGAN SYNC ====================

/**
 * BEFORE:
 * async function insertUser(userData) {
 *   try {
 *     const { users } = await connectDB();
 *     const userDoc = { ...userData, createdAt: new Date(), updatedAt: new Date() };
 *     const result = await users.insertOne(userDoc);
 *     return result.insertedId;
 *   } catch (error) {
 *     throw error;
 *   }
 * }
 */

// AFTER:
async function insertUser(userData) {
  try {
    const { users } = await connectDB();
    const userDoc = { ...userData, createdAt: new Date(), updatedAt: new Date() };
    
    // Gunakan insertWithSync untuk auto-backup ke Supabase
    const result = await insertWithSync(users, userDoc, 'login_page');
    return result.insertedId;
  } catch (error) {
    throw error;
  }
}

// ==================== CONTOH: UPDATES DENGAN SYNC ====================

/**
 * BEFORE:
 * async function updateUserPassword(userId, newPassword) {
 *   const { users } = await connectDB();
 *   const hashedPassword = await hashPassword(newPassword);
 *   const result = await users.updateOne(
 *     { _id: new ObjectId(userId) },
 *     { $set: { password: hashedPassword, updatedAt: new Date() } }
 *   );
 *   return result;
 * }
 */

// AFTER:
async function updateUserPassword(userId, newPassword) {
  const { users } = await connectDB();
  const hashedPassword = await hashPassword(newPassword);
  
  // Gunakan updateWithSync untuk auto-backup
  const result = await updateWithSync(
    users,
    { _id: new ObjectId(userId) },
    { password: hashedPassword, updatedAt: new Date() },
    'login_page'
  );
  return result;
}

// ==================== CONTOH: DELETES DENGAN SYNC ====================

/**
 * BEFORE:
 * async function deleteHospitalityTV(roomNo) {
 *   const { hospitality } = await connectDB();
 *   const result = await hospitality.deleteOne({ roomNo: roomNo });
 *   return result;
 * }
 */

// AFTER:
async function deleteHospitalityTV(roomNo) {
  const { hospitality } = await connectDB();
  
  // Gunakan deleteWithSync untuk backup deleted document
  const result = await deleteWithSync(
    hospitality,
    { roomNo: roomNo },
    'tv_hospitality'
  );
  return result;
}

// ==================== CONTOH: BULK OPERATIONS DENGAN SYNC ====================

/**
 * BEFORE:
 * async function bulkInsertHospitalityTVs(tvData) {
 *   const { hospitality } = await connectDB();
 *   const tvsWithTimestamps = tvData.map(tv => ({
 *     ...tv,
 *     createdAt: new Date(),
 *     lastUpdated: new Date()
 *   }));
 *   const result = await hospitality.insertMany(tvsWithTimestamps);
 *   return result;
 * }
 */

// AFTER:
async function bulkInsertHospitalityTVs(tvData) {
  const { hospitality } = await connectDB();
  const tvsWithTimestamps = tvData.map(tv => ({
    ...tv,
    createdAt: new Date(),
    lastUpdated: new Date()
  }));
  
  // Gunakan bulkInsertWithSync untuk batch backup
  const result = await bulkInsertWithSync(hospitality, tvsWithTimestamps, 'tv_hospitality');
  return result;
}

// ==================== CONTOH: SAFE UPDATE (CAN FAIL) ====================

/**
 * Jika operasi bisa fail tapi Anda tetap ingin sync yang berhasil
 */
async function updateHospitalityTVStatus(roomNo, statusData) {
  try {
    const { hospitality } = await connectDB();
    
    // Try update
    const result = await updateWithSync(
      hospitality,
      { roomNo: roomNo },
      { ...statusData, lastUpdated: new Date() },
      'tv_hospitality'
    );

    if (result.matchedCount === 0) {
      console.log(`TV for room ${roomNo} not found`);
      return null;
    }

    console.log(`Updated status for room ${roomNo}`);
    return result;
  } catch (error) {
    console.error(`Error updating status for room ${roomNo}:`, error);
    // Sync failure tidak throw error, hanya log
    return null;
  }
}

// ==================== CONTOH: CUSTOM WRAPPER UNTUK SPECIFIC LOGIC ====================

/**
 * Contoh wrapper custom untuk operasi yang lebih complex
 */
async function updateNotificationStatus(notificationId, newStatus, staffId) {
  try {
    const { notifications } = await connectDB();
    
    const updateData = {
      status: newStatus,
      assignedStaffId: staffId,
      updatedAt: new Date()
    };

    // Add resolution timestamp jika status resolved
    if (newStatus === 'resolved') {
      updateData.resolvedAt = new Date();
    }

    // Use updateWithSync
    const result = await updateWithSync(
      notifications,
      { _id: new ObjectId(notificationId) },
      updateData,
      'notifications'
    );

    if (result.modifiedCount === 0) {
      console.log(`Notification ${notificationId} not found`);
      return null;
    }

    console.log(`Notification ${notificationId} status updated to ${newStatus}`);
    return result;
  } catch (error) {
    console.error('Error updating notification status:', error);
    throw error;
  }
}

// ==================== CONTOH: BATCH WITH MIXED OPERATIONS ====================

/**
 * Contoh: Update multiple docs dengan conditional logic
 */
async function markMultipleNotificationsAsResolved(notificationIds, staffId) {
  try {
    const { notifications } = await connectDB();
    const ObjectIds = notificationIds.map(id => new ObjectId(id));

    const updateData = {
      status: 'resolved',
      resolvedBy: staffId,
      resolvedAt: new Date()
    };

    // Update multiple
    const result = await notifications.updateMany(
      { _id: { $in: ObjectIds } },
      { $set: updateData }
    );

    // Manual sync untuk batch operation
    if (result.modifiedCount > 0) {
      const updatedDocs = await notifications.find(
        { _id: { $in: ObjectIds } }
      ).toArray();

      // Queue manual sync
      const { queueSync } = require('./utils/dbSyncWrapper');
      queueSync(updatedDocs, 'notifications', 'update', true);
    }

    console.log(`Marked ${result.modifiedCount} notifications as resolved`);
    return result;
  } catch (error) {
    console.error('Error marking notifications as resolved:', error);
    throw error;
  }
}

// ==================== NOTES ====================

/**
 * KEY POINTS:
 * 
 * 1. SYNC OPERATIONS TIDAK BLOCKING
 *    - insertWithSync() tetap fast
 *    - Sync happens async di background via queue
 * 
 * 2. ERROR HANDLING
 *    - Sync error tidak throw ke client
 *    - Check logs untuk debug
 *    - API endpoint /api/backup/status untuk monitor
 * 
 * 3. PERFORMANCE
 *    - Queue diproses 50 items/second
 *    - Suitable untuk high-traffic apps
 * 
 * 4. DISABLED SYNC
 *    - Jika ENABLE_SUPABASE_SYNC=false, functions tetap work
 *    - Just no sync happening
 * 
 * 5. TWO-WAY SYNC
 *    - Enable ENABLE_TWO_WAY_SYNC untuk restore dari Supabase
 *    - Use endpoint POST /api/backup/restore
 */

module.exports = {
  insertUser,
  updateUserPassword,
  deleteHospitalityTV,
  bulkInsertHospitalityTVs,
  updateHospitalityTVStatus,
  updateNotificationStatus,
  markMultipleNotificationsAsResolved
};
