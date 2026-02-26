/**
 * Batch resolve notifications to update staff stats
 * Simulates multiple resolutions for testing
 */

const { updateStaffStatsOnResolution } = require('../utils/notificationUtil');
const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

async function batchResolveNotifications() {
  console.log('=== Batch Resolving Notifications ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get pending notifications with assigned staff
    const notifications = await db.collection('notifications').find({
      assignedStaffId: { $exists: true, $ne: null },
      reportStatus: { $in: ['pending', 'investigating'] }
    }).limit(10).toArray();

    if (notifications.length === 0) {
      console.log('No pending notifications with assigned staff found.');
      return;
    }

    console.log(`Found ${notifications.length} pending notifications to resolve\n`);

    let successCount = 0;

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const progress = ((i + 1) / notifications.length * 100).toFixed(1);

      process.stdout.write(`\rResolving: ${progress}% (${i + 1}/${notifications.length})`);

      try {
        // Get staff before
        const staffBefore = await db.collection('staff').findOne({
          _id: new ObjectId(notification.assignedStaffId)
        });

        // Resolve notification
        await db.collection('notifications').updateOne(
          { notificationId: notification.notificationId },
          {
            $set: {
              reportStatus: 'resolved',
              handlingEndTime: new Date(),
              resolvedReason: 'Batch resolution for testing',
              updatedAt: new Date()
            }
          }
        );

        // Update staff stats
        await updateStaffStatsOnResolution({
          ...notification,
          reportStatus: 'resolved',
          handlingEndTime: new Date()
        });

        // Get staff after
        const staffAfter = await db.collection('staff').findOne({
          _id: new ObjectId(notification.assignedStaffId)
        });

        successCount++;

      } catch (error) {
        console.error(`\nError processing ${notification.notificationId}:`, error.message);
      }
    }

    console.log('\n\n=== Resolution Complete ===');
    console.log(`Total processed: ${notifications.length}`);
    console.log(`Successfully resolved: ${successCount}\n`);

    // Show final staff stats
    console.log('=== UPDATED STAFF STATS ===');
    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).toArray();

    const staffStats = await Promise.all(
      staff.map(async (s) => {
        const activeCount = await db.collection('notifications').countDocuments({
          assignedStaffId: s._id.toString(),
          reportStatus: { $in: ['pending', 'investigating'] }
        });
        return {
          name: s.name,
          totalAssigned: s.stats?.totalAssigned || 0,
          totalResolved: s.stats?.totalResolved || 0,
          successRate: s.stats?.successRate || 0,
          avgResolutionTime: s.stats?.avgResolutionTime || 0,
          activeAssignments: activeCount
        };
      })
    );

    staffStats.forEach(s => {
      if (s.totalAssigned > 0) {
        console.log(`\n${s.name}:`);
        console.log(`  Total Assigned: ${s.totalAssigned}`);
        console.log(`  Total Resolved: ${s.totalResolved}`);
        console.log(`  Active: ${s.activeAssignments}`);
        console.log(`  Success Rate: ${s.successRate.toFixed(1)}%`);
        console.log(`  Avg Resolution Time: ${s.avgResolutionTime} minutes`);
      }
    });

    console.log('\n✅ Staff performance statistics are now visible in StaffPage!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the batch resolution
batchResolveNotifications()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
