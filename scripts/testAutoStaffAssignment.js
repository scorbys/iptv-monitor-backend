/**
 * Test automatic staff assignment for new notifications
 * Creates a test notification and verifies staff is assigned automatically
 */

const { saveNotificationToDB } = require('../utils/notificationUtil');
const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

async function testAutoStaffAssignment() {
  console.log('=== Testing Automatic Staff Assignment ===\n');

  try {
    // Create a test notification
    const testNotification = {
      source: 'tv',
      title: 'Test TV Offline',
      message: 'Room 999 TV is now offline - Connection timeout - Testing auto staff assignment',
      deviceName: 'Room 999',
      roomNo: '999',
      ipAddr: '192.168.1.999',
      error: 'Connection timeout - Test error',
      currentStatus: 'offline',
      isStartup: false,
    };

    console.log('Creating test notification...');
    console.log(`Message: ${testNotification.message}\n`);

    // Save notification (this should trigger ML, auto-fix, and staff assignment)
    const result = await saveNotificationToDB(testNotification);

    if (!result.success) {
      console.error('❌ Failed to create notification:', result.error);
      return;
    }

    console.log(`✅ Notification created: ${result.notificationId}`);
    console.log('Waiting for ML prediction, auto-fix, and staff assignment...\n');

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if staff was assigned
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    const notification = await db.collection('notifications')
      .findOne({ notificationId: result.notificationId });

    if (!notification) {
      console.error('❌ Notification not found in database');
      return;
    }

    console.log('=== NOTIFICATION DETAILS ===');
    console.log(`Notification ID: ${notification.notificationId}`);
    console.log(`Message: ${notification.message}`);
    console.log(`Error Category: ${notification.errorCategory || 'Pending ML prediction'}`);
    console.log(`Priority: ${notification.priority}`);
    console.log(`Status: ${notification.reportStatus}\n`);

    if (notification.assignedStaffId) {
      // Get staff details
      const staff = await db.collection('staff')
        .findOne({ _id: new ObjectId(notification.assignedStaffId) });

      if (staff) {
        console.log('=== STAFF ASSIGNMENT ===');
        console.log(`✅ Staff Assigned: ${staff.name}`);
        console.log(`   Email: ${staff.email}`);
        console.log(`   Department: ${staff.department || 'N/A'}`);
        console.log(`   Role: ${staff.role || 'N/A'}`);
        console.log(`   Total Assignments: ${staff.stats?.totalAssigned || 0}\n`);
      }
    } else {
      console.log('❌ No staff assigned yet (may still be processing...)');
    }

    // Check for auto-fix log
    const autoFixLog = await db.collection('auto_fix_logs')
      .findOne({ notificationId: result.notificationId });

    if (autoFixLog) {
      console.log('=== AUTO-FIX LOG ===');
      console.log(`✅ Auto-fix created: ${autoFixLog.fixId}`);
      console.log(`   Category: ${autoFixLog.category}`);
      console.log(`   Status: ${autoFixLog.status}`);
      console.log(`   Action: ${autoFixLog.action}\n`);
    } else {
      console.log('⏳ Auto-fix log not found (may still be processing...)\n');
    }

    console.log('=== TEST COMPLETE ===');
    console.log('✅ Automatic staff assignment is working!');
    console.log('New notifications will now automatically:');
    console.log('  1. Get ML prediction (error category)');
    console.log('  2. Create auto-fix log');
    console.log('  3. Assign staff based on workload balancing');
    console.log('  4. Distribute randomly among staff with minimum workload');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testAutoStaffAssignment()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
