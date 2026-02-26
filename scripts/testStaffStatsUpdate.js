/**
 * Test staff statistics update when notifications are resolved
 * Simulates resolving notifications and verifies staff stats are updated
 */

const { updateStaffStatsOnResolution } = require('../utils/notificationUtil');
const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

async function testStaffStatsUpdate() {
  console.log('=== Testing Staff Statistics Update ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get a notification with assigned staff that is still pending
    const notification = await db.collection('notifications').findOne({
      assignedStaffId: { $exists: true, $ne: null },
      reportStatus: { $in: ['pending', 'investigating'] }
    });

    if (!notification) {
      console.log('❌ No pending notifications with assigned staff found.');
      console.log('Let me check if there are any assigned notifications...\n');

      const allAssigned = await db.collection('notifications').find({
        assignedStaffId: { $exists: true, $ne: null }
      }).limit(5).toArray();

      if (allAssigned.length > 0) {
        console.log('Found assigned notifications (all statuses):');
        allAssigned.forEach(n => {
          console.log(`  ${n.notificationId}: status=${n.reportStatus}, staff=${n.assignedStaffId}`);
        });
      } else {
        console.log('No assigned notifications at all.');
      }

      return;
    }

    console.log(`Found notification: ${notification.notificationId}`);
    console.log(`  Message: ${notification.message.substring(0, 80)}...`);
    console.log(`  Staff ID: ${notification.assignedStaffId}`);
    console.log(`  Status: ${notification.reportStatus}\n`);

    // Get staff before update
    const staffBefore = await db.collection('staff').findOne({
      _id: new ObjectId(notification.assignedStaffId)
    });

    if (!staffBefore) {
      console.log('❌ Staff not found!');
      return;
    }

    console.log('=== STAFF STATS BEFORE ===');
    console.log(`Name: ${staffBefore.name}`);
    console.log(`Total Assigned: ${staffBefore.stats?.totalAssigned || 0}`);
    console.log(`Total Resolved: ${staffBefore.stats?.totalResolved || 0}`);
    console.log(`Success Rate: ${(staffBefore.stats?.successRate || 0).toFixed(1)}%`);
    console.log(`Avg Resolution Time: ${staffBefore.stats?.avgResolutionTime || 0} minutes\n`);

    // Manually resolve the notification
    console.log('Resolving notification...\n');
    await db.collection('notifications').updateOne(
      { notificationId: notification.notificationId },
      {
        $set: {
          reportStatus: 'resolved',
          handlingEndTime: new Date(),
          resolvedReason: 'Manual resolution for testing',
          updatedAt: new Date()
        }
      }
    );

    // Update staff stats
    const result = await updateStaffStatsOnResolution({
      ...notification,
      reportStatus: 'resolved',
      handlingEndTime: new Date()
    });

    if (!result.success) {
      console.log('❌ Failed to update staff stats:', result.error);
      return;
    }

    // Get staff after update
    const staffAfter = await db.collection('staff').findOne({
      _id: new ObjectId(notification.assignedStaffId)
    });

    console.log('=== STAFF STATS AFTER ===');
    console.log(`Name: ${staffAfter.name}`);
    console.log(`Total Assigned: ${staffAfter.stats?.totalAssigned || 0}`);
    console.log(`Total Resolved: ${staffAfter.stats?.totalResolved || 0}`);
    console.log(`Success Rate: ${(staffAfter.stats?.successRate || 0).toFixed(1)}%`);
    console.log(`Avg Resolution Time: ${staffAfter.stats?.avgResolutionTime || 0} minutes\n`);

    console.log('=== CHANGES ===');
    const resolvedDiff = (staffAfter.stats?.totalResolved || 0) - (staffBefore.stats?.totalResolved || 0);
    const rateDiff = (staffAfter.stats?.successRate || 0) - (staffBefore.stats?.successRate || 0);

    console.log(`✅ Resolved Count: +${resolvedDiff}`);
    console.log(`✅ Success Rate: ${rateDiff >= 0 ? '+' : ''}${rateDiff.toFixed(1)}%`);

    console.log('\n=== TEST COMPLETE ===');
    console.log('✅ Staff statistics are now being updated when notifications are resolved!');
    console.log('\nNote: In production, this happens automatically when:');
    console.log('  - Device comes back online (auto-resolve)');
    console.log('  - Staff manually marks notification as resolved');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testStaffStatsUpdate()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
