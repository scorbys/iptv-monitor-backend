// Alternative script that uses existing autofix-db module
const path = require('path');

async function fixStaffStats() {
  try {
    // Load the autofix-db module
    const db = require('../autofix-db');

    console.log('🔗 Connecting to MongoDB...');
    const connection = await db.connectDB();
    console.log('✅ Connected to MongoDB');

    const staffCollection = connection.staff;
    const notificationsCollection = connection.notifications;

    // Get all active staff
    const staff = await staffCollection.find({ isActive: { $ne: false } }).toArray();

    console.log(`📊 Found ${staff.length} staff members to fix\n`);

    for (const member of staff) {
      // Convert ObjectId to string for matching (notifications store assignedStaffId as string)
      const staffIdString = member._id.toString();

      // Calculate actual stats from notifications
      const totalAssigned = await notificationsCollection.countDocuments({
        assignedStaffId: staffIdString
      });

      const totalResolved = await notificationsCollection.countDocuments({
        assignedStaffId: staffIdString,
        reportStatus: { $in: ['resolved', 'closed'] }
      });

      // Calculate success rate (capped at 100%)
      const successRate = totalAssigned > 0
        ? Math.min(Math.round((totalResolved / totalAssigned) * 100), 100)
        : 100; // Default to 100% if no assignments

      // Update staff stats
      await staffCollection.updateOne(
        { _id: member._id },
        {
          $set: {
            'stats.totalAssigned': totalAssigned,
            'stats.totalResolved': totalResolved,
            'stats.successRate': successRate,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✓ ${member.name}:`);
      console.log(`  - Assigned: ${totalAssigned}`);
      console.log(`  - Resolved: ${totalResolved}`);
      console.log(`  - Success Rate: ${successRate}%`);
      console.log('');
    }

    console.log('✅ All staff stats have been fixed successfully!');

    await connection.client.close();
  } catch (error) {
    console.error('❌ Error fixing staff stats:', error.message);
    process.exit(1);
  }
}

fixStaffStats();
