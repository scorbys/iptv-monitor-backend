/**
 * Script to delete oldest 3000 notifications and reset staff statistics
 * Run with: node backend/scripts/cleanup-old-notifications.js
 */

const { connectDB } = require('../autofix-db');

async function cleanupOldData() {
  console.log('🧹 Starting cleanup of old data...\n');

  try {
    const collections = await connectDB();
    const notifications = collections.notifications;
    const staff = collections.staff;

    // 1. Get total count before cleanup
    const totalCount = await notifications.countDocuments({});
    console.log(`📊 Total notifications before cleanup: ${totalCount}`);

    // 2. Find and delete oldest 3000 notifications
    const oldestNotifications = await notifications
      .find({})
      .sort({ createdAt: 1 }) // 1 = ascending (oldest first)
      .limit(3000)
      .toArray();

    if (oldestNotifications.length === 0) {
      console.log('✅ No old notifications to delete');
      return;
    }

    const oldestIds = oldestNotifications.map(n => n._id);
    const oldestDate = oldestNotifications[0].createdAt;
    const newestDate = oldestNotifications[oldestNotifications.length - 1].createdAt;

    console.log(`\n📅 Date range of notifications to delete:`);
    console.log(`   Oldest: ${new Date(oldestDate).toISOString()}`);
    console.log(`   Newest: ${new Date(newestDate).toISOString()}`);

    // Delete the notifications
    const deleteResult = await notifications.deleteMany({
      _id: { $in: oldestIds }
    });

    console.log(`\n🗑️  Deleted ${deleteResult.deletedCount} notifications`);

    // 3. Reset staff statistics
    // Get all staff
    const allStaff = await staff.find({}).toArray();

    console.log(`\n👥 Found ${allStaff.length} staff members`);

    let totalResetStats = 0;

    for (const staffMember of allStaff) {
      // Reset their statistics
      const updateResult = await staff.updateOne(
        { _id: staffMember._id },
        {
          $set: {
            'stats.totalAssigned': 0,
            'stats.totalResolved': 0,
            'stats.avgResolutionTime': 0,
            'stats.successRate': 0,
            'stats.recentActivity': []
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        totalResetStats++;
        console.log(`   ✅ Reset stats for: ${staffMember.name || staffMember.email}`);
      }
    }

    console.log(`\n🔄 Reset statistics for ${totalResetStats} staff members`);

    // 4. Verify cleanup
    const remainingCount = await notifications.countDocuments({});
    console.log(`\n📊 Total notifications after cleanup: ${remainingCount}`);
    console.log(`📉 Removed: ${totalCount - remainingCount} notifications`);

    // 5. Show breakdown by source
    const pipeline = [
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];

    const breakdown = await notifications.aggregate(pipeline).toArray();
    console.log('\n📈 Remaining notifications by source:');
    breakdown.forEach(item => {
      console.log(`   ${item._id}: ${item.count}`);
    });

    console.log('\n✅ Cleanup completed successfully!\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the cleanup
cleanupOldData();
