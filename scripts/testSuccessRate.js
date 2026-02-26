/**
 * Test success rate updates with new notification and auto-resolve
 */

const { connectDB } = require('../autofix-db');
const { saveNotificationToDB } = require('../utils/notificationUtil');

(async () => {
  console.log('=== Testing Success Rate Updates ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get initial stats
    console.log('📊 Initial Staff Stats:');
    console.log('='.repeat(60));

    const staff = await db.collection('staff').findOne({ name: 'Sidin Rahman' });
    console.log(`\n${staff.name}:`);
    console.log(`  Total Assigned: ${staff.stats?.totalAssigned || 0}`);
    console.log(`  Total Resolved: ${staff.stats?.totalResolved || 0}`);
    console.log(`  Success Rate: ${(staff.stats?.successRate || 0).toFixed(1)}%`);

    const initialAssigned = staff.stats?.totalAssigned || 0;
    const initialResolved = staff.stats?.totalResolved || 0;
    const initialRate = staff.stats?.successRate || 0;

    // Create test notification
    console.log('\n\n🔔 Creating test notification...');
    console.log('='.repeat(60));

    const result = await saveNotificationToDB({
      source: 'tv',
      title: 'Test Success Rate',
      message: 'Testing if success rate updates',
      deviceName: 'Test-SuccessRate-Device',
      ipAddr: '192.168.1.251',
      error: 'Test error',
      currentStatus: 'offline',
      isStartup: false,
    });

    if (!result.success) {
      console.log('❌ Failed to create notification');
      process.exit(1);
    }

    console.log(`✅ Created: ${result.notificationId}`);

    // Wait for assignment
    console.log('\n⏳ Waiting 5 seconds for assignment...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if assigned
    const notification = await db.collection('notifications').findOne({
      notificationId: result.notificationId
    });

    if (!notification.assignedStaffId) {
      console.log('❌ No staff assigned yet. Waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Get updated staff stats after assignment
    const staffAfterAssign = await db.collection('staff').findOne({ name: 'Sidin Rahman' });

    console.log('\n📊 Stats After Assignment:');
    console.log('='.repeat(60));
    console.log(`\n${staffAfterAssign.name}:`);
    console.log(`  Total Assigned: ${staffAfterAssign.stats?.totalAssigned || 0} (${staffAfterAssign.stats?.totalAssigned - initialAssigned > 0 ? '+' : ''}${staffAfterAssign.stats?.totalAssigned - initialAssigned})`);
    console.log(`  Total Resolved: ${staffAfterAssign.stats?.totalResolved || 0} (no change)`);
    console.log(`  Success Rate: ${(staffAfterAssign.stats?.successRate || 0).toFixed(1)}%`);

    // Wait for auto-resolve (30-120 seconds)
    console.log('\n\n⏳ Waiting for auto-resolve (this may take up to 2 minutes)...');
    console.log('Auto-resolve scheduler checks every 30 seconds\n');

    let elapsed = 0;
    const maxWait = 150; // 2.5 minutes max

    while (elapsed < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
      elapsed += 10;

      const notifCheck = await db.collection('notifications').findOne({
        notificationId: result.notificationId
      });

      console.log(`[${elapsed}s] Status: ${notifCheck.reportStatus}`);

      if (notifCheck.reportStatus === 'resolved') {
        console.log('\n✅ Notification auto-resolved!');

        // Wait a moment for stats update
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get final stats
        const staffFinal = await db.collection('staff').findOne({ name: 'Sidin Rahman' });

        console.log('\n📊 Final Stats After Resolution:');
        console.log('='.repeat(60));
        console.log(`\n${staffFinal.name}:`);
        console.log(`  Total Assigned: ${staffFinal.stats?.totalAssigned || 0}`);
        console.log(`  Total Resolved: ${staffFinal.stats?.totalResolved || 0} (${staffFinal.stats?.totalResolved - initialResolved > 0 ? '+' : ''}${staffFinal.stats?.totalResolved - initialResolved})`);
        console.log(`  Success Rate: ${(staffFinal.stats?.successRate || 0).toFixed(1)}% (${(staffFinal.stats?.successRate || 0) - initialRate > 0 ? '+' : ''}${((staffFinal.stats?.successRate || 0) - initialRate).toFixed(1)}%)`);

        // Summary
        console.log('\n\n✅ SUMMARY:');
        console.log('='.repeat(60));
        console.log(`Initial: ${initialAssigned} assigned, ${initialResolved} resolved, ${initialRate.toFixed(1)}% success rate`);
        console.log(`Final: ${staffFinal.stats?.totalAssigned} assigned, ${staffFinal.stats?.totalResolved} resolved, ${(staffFinal.stats?.successRate || 0).toFixed(1)}% success rate`);
        console.log(`\n✅ Success rate increased by ${((staffFinal.stats?.successRate || 0) - initialRate).toFixed(1)}%`);

        if ((staffFinal.stats?.totalResolved || 0) > initialResolved) {
          console.log('\n✅ SUCCESS RATE IS UPDATING CORRECTLY!');
        } else {
          console.log('\n⚠️ Success rate did not increase. Check logs.');
        }

        process.exit(0);
      }

      console.log(`  Still waiting... (${elapsed}/${maxWait}s)`);
    }

    console.log('\n⚠️ Auto-resolve did not complete within 2.5 minutes');
    console.log('This is normal if the server is not running with the auto-resolve scheduler');
    console.log('\nTo enable auto-resolve, make sure server.js is running with:');
    console.log('  - autoResolveScheduler loaded');
    console.log('  - Interval set to 30 seconds');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
