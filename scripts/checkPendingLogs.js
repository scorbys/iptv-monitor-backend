/**
 * Check pending auto-fix logs and their notification status
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Checking Pending Auto-Fix Logs ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get pending auto-fix logs
    const pendingLogs = await db.collection('auto_fix_logs').find({status: 'pending'}).limit(5).toArray();

    console.log(`Total pending logs: ${await db.collection('auto_fix_logs').countDocuments({status: 'pending'})}`);
    console.log('Showing first 5:\n');

    for (const log of pendingLogs) {
      // Get the notification
      const notif = await db.collection('notifications').findOne({notificationId: log.notificationId});

      console.log(`Notification: ${log.notificationId}`);
      console.log(`  Category: ${log.category}`);
      console.log(`  Created: ${new Date(log.createdAt).toLocaleString()}`);

      if (notif) {
        console.log(`  Notification Status: ${notif.reportStatus}`);
        console.log(`  Assigned Staff: ${notif.assignedStaffId || 'None'}`);
        console.log(`  Handling Start: ${notif.handlingStartTime ? new Date(notif.handlingStartTime).toLocaleString() : 'N/A'}`);

        if (notif.handlingStartTime) {
          const elapsed = Math.floor((new Date() - new Date(notif.handlingStartTime)) / 1000);
          console.log(`  Time Elapsed: ${elapsed}s (needs 10-15s for auto-resolve)`);
        }
      } else {
        console.log(`  Notification: NOT FOUND (may have been deleted)`);
      }
      console.log('');
    }

    // Check notifications that are pending/investigating
    const pendingNotifications = await db.collection('notifications').find({
      reportStatus: { $in: ['pending', 'investigating'] },
      assignedStaffId: { $exists: true, $ne: null },
      handlingStartTime: { $exists: true }
    }).limit(5).toArray();

    console.log('\n=== Pending/Investigating Notifications (Waiting for Auto-Resolve) ===');
    console.log(`Total: ${await db.collection('notifications').countDocuments({
      reportStatus: { $in: ['pending', 'investigating'] },
      assignedStaffId: { $exists: true, $ne: null },
      handlingStartTime: { $exists: true }
    })}\n`);

    for (const notif of pendingNotifications) {
      const elapsed = Math.floor((new Date() - new Date(notif.handlingStartTime)) / 1000);
      console.log(`${notif.notificationId}`);
      console.log(`  Assigned: ${notif.assignedStaffId}`);
      console.log(`  Started: ${new Date(notif.handlingStartTime).toLocaleString()}`);
      console.log(`  Elapsed: ${elapsed}s / 10-15s (will resolve in ${Math.max(0, 10 - elapsed)}-${Math.max(0, 15 - elapsed)}s)`);
      console.log('');
    }

    console.log('✅ Check complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
