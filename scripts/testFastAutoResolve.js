/**
 * Test fast auto-resolve (10-15 seconds)
 */

const { connectDB } = require('../autofix-db');
const { saveNotificationToDB } = require('../utils/notificationUtil');

(async () => {
  console.log('=== Testing Fast Auto-Resolve (10-15 seconds) ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get initial stats
    const staff = await db.collection('staff').findOne({ name: 'Sidin Rahman' });
    console.log('📊 Initial Stats:');
    console.log(`  ${staff.name}: ${staff.stats?.totalAssigned || 0} assigned, ${staff.stats?.totalResolved || 0} resolved, ${(staff.stats?.successRate || 0).toFixed(1)}% success rate`);

    // Create notification
    console.log('\n🔔 Creating notification...');
    const result = await saveNotificationToDB({
      source: 'tv',
      title: 'Fast Auto-Resolve Test',
      message: 'Testing 10-second auto-resolve',
      deviceName: 'Test-Fast-Device',
      ipAddr: '192.168.1.252',
      error: 'Test error',
      currentStatus: 'offline',
      isStartup: false,
    });

    if (!result.success) {
      console.log('❌ Failed');
      process.exit(1);
    }

    console.log(`✅ Created: ${result.notificationId}`);

    // Wait for assignment
    console.log('\n⏳ Waiting 5 seconds for assignment...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const notification = await db.collection('notifications').findOne({
      notificationId: result.notificationId
    });

    console.log(`Assigned: ${notification.assignedStaffId ? 'Yes' : 'No'}`);
    console.log(`Handling Start: ${notification.handlingStartTime ? notification.handlingStartTime.toLocaleTimeString() : 'N/A'}`);

    // Wait for auto-resolve (10-15 seconds)
    console.log('\n⏳ Waiting for auto-resolve (10-15 seconds)...');
    console.log('Checking every 2 seconds:\n');

    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const notif = await db.collection('notifications').findOne({
        notificationId: result.notificationId
      });

      const elapsed = notif.handlingStartTime
        ? Math.floor((new Date() - new Date(notif.handlingStartTime)) / 1000)
        : 0;

      console.log(`[${i * 2}s] Status: ${notif.reportStatus.toUpperCase()} (${elapsed}s since assignment)`);

      if (notif.reportStatus === 'resolved') {
        console.log('\n✅ RESOLVED!');

        // Wait for stats update
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check final stats
        const staffFinal = await db.collection('staff').findOne({ name: 'Sidin Rahman' });

        console.log('\n📊 Final Stats:');
        console.log(`  ${staffFinal.name}: ${staffFinal.stats?.totalAssigned || 0} assigned, ${staffFinal.stats?.totalResolved || 0} resolved, ${(staffFinal.stats?.successRate || 0).toFixed(1)}% success rate`);

        console.log('\n✅ SUMMARY:');
        console.log(`  Resolution time: ${elapsed} seconds`);
        console.log(`  Assigned: +${(staffFinal.stats?.totalAssigned || 0) - (staff.stats?.totalAssigned || 0)}`);
        console.log(`  Resolved: +${(staffFinal.stats?.totalResolved || 0) - (staff.stats?.totalResolved || 0)}`);
        console.log(`  Success Rate: +${((staffFinal.stats?.successRate || 0) - (staff.stats?.successRate || 0)).toFixed(1)}%`);

        console.log('\n✅ Fast auto-resolve is working!');
        process.exit(0);
      }
    }

    console.log('\n⚠️ Not resolved within 20 seconds');
    console.log('Make sure server.js is running with auto-resolve scheduler');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
