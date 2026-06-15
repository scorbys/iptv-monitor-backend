/**
 * Test full staff stats update with resolution time
 */

const { updateStaffStatsOnResolution } = require('../utils/notificationUtil');
const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

const APPLY = process.argv.includes('--apply');

async function testFullStaffStats() {
  console.log('=== Testing Full Staff Stats Update ===\n');
  console.log(`Mode: ${APPLY ? 'APPLY (will write to MongoDB)' : 'DRY-RUN (no writes)'}`);
  console.log('Use --apply only in a controlled test database or after taking a backup.\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Find pending notifications with assigned staff
    const notification = await db.collection('notifications').findOne({
      assignedStaffId: { $exists: true, $ne: null },
      reportStatus: { $in: ['pending', 'investigating'] },
      handlingStartTime: { $exists: true }
    });

    if (!notification) {
      if (!APPLY) {
        console.log('No suitable notification found. DRY-RUN stopped before creating test data.');
        return;
      }

      console.log('No suitable notification found. Creating one...');

      // Create a test notification
      const testResult = await db.collection('notifications').insertOne({
        notificationId: `test-${Date.now()}`,
        source: 'tv',
        title: 'Test Notification',
        message: 'Test notification for staff stats',
        deviceName: 'Test Device',
        roomNo: '999',
        error: 'Test error',
        errorCategory: 'Kategori-1',
        currentStatus: 'offline',
        reportStatus: 'pending',
        priority: 'high',
        assignedStaffId: (await db.collection('staff').findOne({}))._id.toString(),
        handlingStartTime: new Date(Date.now() - 30 * 60000), // 30 minutes ago
        createdAt: new Date(Date.now() - 30 * 60000),
        updatedAt: new Date()
      });

      const inserted = await db.collection('notifications').findOne({ _id: testResult.insertedId });

      console.log('Created test notification');
      console.log(`  Notification ID: ${inserted.notificationId}`);
      console.log(`  Staff ID: ${inserted.assignedStaffId}`);
      console.log(`  Handling Start Time: ${inserted.handlingStartTime}\n`);

      // Get staff before
      const staffBefore = await db.collection('staff').findOne({
        _id: new ObjectId(inserted.assignedStaffId)
      });

      console.log('=== STAFF STATS BEFORE ===');
      console.log(`${staffBefore.name}:`);
      console.log(`  Total Assigned: ${staffBefore.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${staffBefore.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(staffBefore.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  Avg Resolution Time: ${staffBefore.stats?.avgResolutionTime || 0} minutes\n`);

      if (!APPLY) {
        console.log('DRY-RUN complete. Re-run with --apply to resolve this notification and update staff stats.');
        return;
      }

      // Resolve notification
      await db.collection('notifications').updateOne(
        { notificationId: inserted.notificationId },
        {
          $set: {
            reportStatus: 'resolved',
            handlingEndTime: new Date(),
            resolvedReason: 'Test resolution',
            updatedAt: new Date()
          }
        }
      );

      // Update staff stats
      await updateStaffStatsOnResolution(inserted);

      // Get staff after
      const staffAfter = await db.collection('staff').findOne({
        _id: new ObjectId(inserted.assignedStaffId)
      });

      console.log('=== STAFF STATS AFTER ===');
      console.log(`${staffAfter.name}:`);
      console.log(`  Total Assigned: ${staffAfter.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${staffAfter.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(staffAfter.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  Avg Resolution Time: ${staffAfter.stats?.avgResolutionTime || 0} minutes\n`);

      console.log('✅ Test complete! Now check StaffPage in browser.');

    } else {
      console.log(`Found notification: ${notification.notificationId}`);
      console.log(`  Created: ${notification.createdAt}`);
      console.log(`  Handling Start: ${notification.handlingStartTime}\n`);

      // Get staff before
      const staffBefore = await db.collection('staff').findOne({
        _id: new ObjectId(notification.assignedStaffId)
      });

      console.log('=== STAFF STATS BEFORE ===');
      console.log(`${staffBefore.name}:`);
      console.log(`  Total Assigned: ${staffBefore.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${staffBefore.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(staffBefore.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  Avg Resolution Time: ${staffBefore.stats?.avgResolutionTime || 0} minutes\n`);

      if (!APPLY) {
        console.log('DRY-RUN complete. Re-run with --apply to resolve this notification and update staff stats.');
        return;
      }

      // Resolve notification
      await db.collection('notifications').updateOne(
        { notificationId: notification.notificationId },
        {
          $set: {
            reportStatus: 'resolved',
            handlingEndTime: new Date(),
            resolvedReason: 'Test resolution',
            updatedAt: new Date()
          }
        }
      );

      // Update staff stats
      await updateStaffStatsOnResolution(notification);

      // Get staff after
      const staffAfter = await db.collection('staff').findOne({
        _id: new ObjectId(notification.assignedStaffId)
      });

      console.log('=== STAFF STATS AFTER ===');
      console.log(`${staffAfter.name}:`);
      console.log(`  Total Assigned: ${staffAfter.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${staffAfter.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(staffAfter.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  Avg Resolution Time: ${staffAfter.stats?.avgResolutionTime || 0} minutes\n`);

      console.log('✅ Test complete! Now check StaffPage in browser.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

testFullStaffStats().catch((error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});
