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
        staff: db.collection('staff'),
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
        staff: db.collection('staff'),
        client: client
      };
    }
  }

  try {
    isConnecting = true;
    console.log('Connecting to MongoDB (Staff)...');

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
    console.log('Connected to MongoDB successfully (Staff)');

    const db = client.db('iptv');

    // Create indexes
    await createIndexes(db);

    return {
      staff: db.collection('staff'),
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
    await db.collection('staff').createIndex({ email: 1 }, { unique: true });
    await db.collection('staff').createIndex({ userId: 1 }); // Link to login_page
    await db.collection('staff').createIndex({ department: 1 });
    await db.collection('staff').createIndex({ isActive: 1 });
    await db.collection('staff').createIndex({ createdAt: -1 });

    console.log('Staff database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

// ==================== STAFF CRUD FUNCTIONS ====================

/**
 * Create new staff record
 */
async function createStaff(staffData) {
  try {
    const { staff } = await connectDB();

    // Check if email already exists
    const existingStaff = await staff.findOne({ email: staffData.email });
    if (existingStaff) {
      return {
        success: false,
        error: 'Staff with this email already exists'
      };
    }

    const staffDoc = {
      name: staffData.name,
      email: staffData.email,
      phone: staffData.phone || null,
      department: staffData.department || null,
      position: staffData.position || null,
      userId: staffData.userId || null, // Link to login_page user
      employeeId: staffData.employeeId || generateEmployeeId(),
      isActive: true,
      joinedDate: staffData.joinedDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: staffData.createdBy || null // User ID who created this staff
    };

    const result = await staff.insertOne(staffDoc);
    console.log(`Staff created: ${result.insertedId}`);

    return {
      success: true,
      staffId: result.insertedId.toString(),
      staff: { ...staffDoc, _id: result.insertedId }
    };
  } catch (error) {
    console.error('Error creating staff:', error);
    return {
      success: false,
      error: error.message || 'Failed to create staff'
    };
  }
}

/**
 * Calculate stats for a staff member
 * NOTE: This function is kept for backward compatibility but should NOT be used
 * Stats are now stored in the database and updated in real-time by notificationUtil.js
 * Use getAllStaff() which returns the stored stats directly
 */
async function calculateStaffStats(staffId) {
  try {
    const { connectDB } = require('./autofix-db');
    const db = await connectDB();

    // Get notification stats for this staff (db.notifications is already a collection)
    const notifications = db.notifications;

    const totalAssigned = await notifications.countDocuments({
      assignedStaffId: new ObjectId(staffId)
    });

    const totalResolved = await notifications.countDocuments({
      assignedStaffId: new ObjectId(staffId),
      reportStatus: { $in: ['resolved', 'closed'] }
    });

    // Calculate success rate (capped at 100%)
    const successRate = totalAssigned > 0
      ? Math.min(Math.round((totalResolved / totalAssigned) * 100), 100)
      : 100; // Default to 100% if no assignments

    // NOTE: avgResolutionTime removed - not needed anymore
    return {
      totalAssigned,
      totalResolved,
      successRate
    };
  } catch (error) {
    console.error('Error calculating staff stats:', error);
    // Return default stats on error
    return {
      totalAssigned: 0,
      totalResolved: 0,
      successRate: 100
    };
  }
}

/**
 * Get all staff members with stats
 */
async function getAllStaff(filters = {}) {
  try {
    const { staff } = await connectDB();

    const query = {};

    // Apply filters
    if (filters.department) {
      query.department = filters.department;
    }

    const staffList = await staff.find(query).sort({ createdAt: -1 }).toArray();

    // Add stats to each staff member - use stored stats if available, otherwise use defaults
    const staffWithStats = staffList.map((member) => {
      // Use stored stats if available, otherwise use defaults
      const stats = member.stats || {
        totalAssigned: 0,
        totalResolved: 0,
        successRate: 0
      };

      return {
        _id: member._id.toString(),
        userId: member.userId ? member.userId.toString() : null,
        name: member.name,
        email: member.email,
        phone: member.phone,
        department: member.department,
        position: member.position,
        isActive: member.isActive,
        avatar: member.avatar || null,
        employeeId: member.employeeId || null,
        joinedDate: member.joinedDate,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        stats
      };
    });

    return {
      success: true,
      staff: staffWithStats,
      count: staffWithStats.length
    };
  } catch (error) {
    console.error('Error fetching staff:', error);
    return {
      success: false,
      error: 'Failed to fetch staff',
      staff: []
    };
  }
}

/**
 * Get staff by ID
 */
async function getStaffById(staffId) {
  try {
    const { staff } = await connectDB();

    const staffMember = await staff.findOne({
      _id: new ObjectId(staffId),
      isActive: { $ne: false }
    });

    if (!staffMember) {
      return {
        success: false,
        error: 'Staff not found'
      };
    }

    return {
      success: true,
      staff: staffMember
    };
  } catch (error) {
    console.error('Error fetching staff:', error);
    return {
      success: false,
      error: 'Failed to fetch staff'
    };
  }
}

/**
 * Get staff by user ID (linked from login_page)
 */
async function getStaffByUserId(userId) {
  try {
    const { staff } = await connectDB();

    const staffMember = await staff.findOne({
      userId: userId,
      isActive: { $ne: false }
    });

    if (!staffMember) {
      return null;
    }

    return staffMember;
  } catch (error) {
    console.error('Error fetching staff by user ID:', error);
    return null;
  }
}

/**
 * Update staff information
 */
async function updateStaff(staffId, updateData) {
  try {
    const { staff } = await connectDB();

    const updateDoc = {
      updatedAt: new Date()
    };

    if (updateData.name) updateDoc.name = updateData.name;
    if (updateData.email) updateDoc.email = updateData.email;
    if (updateData.phone !== undefined) updateDoc.phone = updateData.phone;
    if (updateData.department !== undefined) updateDoc.department = updateData.department;
    if (updateData.position !== undefined) updateDoc.position = updateData.position;
    if (updateData.userId !== undefined) updateDoc.userId = updateData.userId;
    if (updateData.isActive !== undefined) updateDoc.isActive = updateData.isActive;
    if (updateData.updatedBy) updateDoc.updatedBy = updateData.updatedBy;

    const result = await staff.updateOne(
      { _id: new ObjectId(staffId) },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'Staff not found'
      };
    }

    console.log(`Staff updated: ${staffId}`);

    // Get updated staff
    const updatedStaff = await getStaffById(staffId);

    return {
      success: true,
      staff: updatedStaff.staff
    };
  } catch (error) {
    console.error('Error updating staff:', error);

    if (error.code === 11000) {
      return {
        success: false,
        error: 'Email already exists'
      };
    }

    return {
      success: false,
      error: 'Failed to update staff'
    };
  }
}

/**
 * Delete/deactivate staff (soft delete)
 */
async function deleteStaff(staffId, deletedBy) {
  try {
    const { staff } = await connectDB();

    const result = await staff.updateOne(
      { _id: new ObjectId(staffId) },
      {
        $set: {
          isActive: false,
          deletedAt: new Date(),
          deletedBy: deletedBy
        }
      }
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'Staff not found'
      };
    }

    console.log(`Staff deactivated: ${staffId}`);

    return {
      success: true,
      message: 'Staff deactivated successfully'
    };
  } catch (error) {
    console.error('Error deleting staff:', error);
    return {
      success: false,
      error: 'Failed to delete staff'
    };
  }
}

/**
 * Get staff statistics by department
 */
async function getStaffStats() {
  try {
    const { staff } = await connectDB();

    const totalStaff = await staff.countDocuments({ isActive: { $ne: false } });

    const departmentStats = await staff.aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    return {
      success: true,
      total: totalStaff,
      byDepartment: departmentStats
    };
  } catch (error) {
    console.error('Error getting staff stats:', error);
    return {
      success: false,
      error: 'Failed to get staff statistics',
      total: 0,
      byDepartment: []
    };
  }
}

/**
 * Helper function to generate employee ID
 */
function generateEmployeeId() {
  const prefix = 'STF';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ==================== CONNECTION MANAGEMENT ====================

async function closeConnection() {
  if (client) {
    try {
      await client.close();
      client = null;
      console.log('MongoDB connection closed (Staff)');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
}

/**
 * Get all active staff available for assignment
 * NOTE: This function uses stored stats from database, not calculated stats
 * The workload is determined by current active assignments, not historical stats
 */
async function getActiveStaffForAssignment() {
  try {
    const { staff } = await connectDB();

    const activeStaff = await staff
      .find({ isActive: true })
      .toArray();

    // Return staff with their stored stats
    // Stats are updated in real-time by notificationUtil.js
    const staffWithStats = activeStaff.map(staffMember => ({
      ...staffMember,
      stats: staffMember.stats || {
        totalAssigned: 0,
        totalResolved: 0,
        successRate: 100
      }
    }));

    return staffWithStats;
  } catch (error) {
    console.error('Error getting active staff for assignment:', error);
    return [];
  }
}

/**
 * Update staff statistics based on action
 * NOTE: This function is kept for backward compatibility but is NOT actively used
 * The actual staff stats updates are handled by updateStaffStatsOnResolution() in notificationUtil.js
 * @param {string} staffId - Staff ID
 * @param {string} action - Action type: 'assigned', 'resolved', 'failed'
 */
async function updateStaffStats(staffId, action) {
  try {
    const { staff } = await connectDB();
    const { ObjectId } = require('mongodb');

    const updateFields = {
      updatedAt: new Date()
    };

    switch (action) {
      case 'assigned':
        // Increment total assigned counter
        await staff.updateOne(
          { _id: new ObjectId(staffId) },
          {
            $inc: {
              'stats.totalAssigned': 1
            },
            $set: updateFields
          }
        );
        console.log(`Staff ${staffId} assigned - totalAssigned incremented`);
        break;

      case 'resolved':
        // Increment total resolved and update success rate
        const staffMember = await staff.findOne({ _id: new ObjectId(staffId) });

        if (staffMember && staffMember.stats) {
          const totalAssigned = staffMember.stats.totalAssigned || 0;
          const totalResolved = (staffMember.stats.totalResolved || 0) + 1;
          const newSuccessRate = totalAssigned > 0
            ? Math.min(Math.round((totalResolved / totalAssigned) * 100), 100)
            : 100;

          await staff.updateOne(
            { _id: new ObjectId(staffId) },
            {
              $set: {
                'stats.totalResolved': totalResolved,
                'stats.successRate': newSuccessRate,
                ...updateFields
              }
            }
          );
          console.log(`Staff ${staffId} resolved - totalResolved: ${totalResolved}, successRate: ${newSuccessRate}%`);
        }
        break;

      case 'failed':
        // Just update timestamp, don't decrement anything
        await staff.updateOne(
          { _id: new ObjectId(staffId) },
          {
            $set: updateFields
          }
        );
        console.log(`Staff ${staffId} fix failed - timestamp updated`);
        break;

      default:
        console.log(`Unknown action: ${action}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating staff stats:', error);
    return { success: false, error: error.message };
  }
}

process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);
process.on('beforeExit', closeConnection);

// ==================== EXPORTS ====================

module.exports = {
  connectDB,
  createStaff,
  getAllStaff,
  getStaffById,
  getStaffByUserId,
  updateStaff,
  deleteStaff,
  getStaffStats,
  calculateStaffStats,
  getActiveStaffForAssignment,
  updateStaffStats,
  closeConnection
};
