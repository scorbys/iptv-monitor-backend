/**
 * Check staff availability and assignment status
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Checking Staff Assignment Status ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Check staff
    console.log('📋 Staff Members:');
    console.log('-'.repeat(50));

    const allStaff = await db.collection('staff').find({}).toArray();

    if (allStaff.length === 0) {
      console.log('❌ No staff found in database!');
      process.exit(1);
    }

    console.log(`Total staff: ${allStaff.length}\n`);

    allStaff.forEach((staff, index) => {
      const isDeleted = !!staff.deletedAt;
      const isActive = staff.isActive !== false; // isActive could be undefined, treat as active

      console.log(`${index + 1}. ${staff.name}`);
      console.log(`   Position: ${staff.position || 'N/A'}`);
      console.log(`   Department: ${staff.department || 'N/A'}`);
      console.log(`   Active: ${isActive ? '✅ Yes' : '❌ No'}`);
      console.log(`   Deleted: ${isDeleted ? '❌ Yes' : '✅ No'}`);
      console.log(`   Stats:`);
      console.log(`   - Total Assigned: ${staff.stats?.totalAssigned || 0}`);
      console.log(`   - Current Active Assignments: ${staff.stats?.activeAssignments || 0}`);
      console.log('');
    });

    // Check available staff for assignment
    console.log('📊 Available Staff for Assignment:');
    console.log('-'.repeat(50));

    const availableStaff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    if (availableStaff.length === 0) {
      console.log('❌ No available staff found!');
      console.log('   This is why notifications are not being assigned to staff.');
    } else {
      console.log(`✅ Found ${availableStaff.length} available staff\n`);

      // Get workload for each
      for (const staff of availableStaff) {
        const activeAssignments = await db.collection('notifications').countDocuments({
          assignedStaffId: staff._id.toString(),
          reportStatus: { $in: ['pending', 'investigating'] }
        });

        console.log(`${staff.name}:`);
        console.log(`  - Current active assignments: ${activeAssignments}`);
        console.log(`  - Total assigned (stats): ${staff.stats?.totalAssigned || 0}`);
        console.log('');
      }
    }

    // Check recent notifications
    console.log('📋 Recent Notifications:');
    console.log('-'.repeat(50));

    const recentNotifications = await db.collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    console.log(`Found ${recentNotifications.length} recent notifications\n`);

    recentNotifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.notificationId}`);
      console.log(`   Created: ${notif.createdAt}`);
      console.log(`   Assigned Staff ID: ${notif.assignedStaffId || 'NOT ASSIGNED'}`);
      console.log(`   Report Status: ${notif.reportStatus}`);
      console.log('');
    });

    // Summary
    console.log('🔍 Summary:');
    console.log('-'.repeat(50));
    console.log(`Total staff in DB: ${allStaff.length}`);
    console.log(`Available for assignment: ${availableStaff.length}`);
    console.log(`Notifications without staff: ${recentNotifications.filter(n => !n.assignedStaffId).length}/${recentNotifications.length}`);

    if (availableStaff.length === 0) {
      console.log('\n⚠️  ISSUE FOUND: No staff available for assignment!');
      console.log('   Fix: Ensure at least one staff member has:');
      console.log('   - deletedAt: not set');
      console.log('   - isActive: true (or not set to false)');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
