const { connectDB } = require('../autofix-db');

/**
 * Assign staff to existing notifications
 * Processes notifications that don't have staff assigned yet
 */
async function assignStaffToExistingNotifications() {
  console.log('=== Assigning Staff to Existing Notifications ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // Get available staff (not deleted, active)
    const availableStaff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    if (availableStaff.length === 0) {
      console.log('❌ No available staff found. Please add staff members first.');
      return;
    }

    console.log(`Found ${availableStaff.length} available staff members:\n`);
    availableStaff.forEach(staff => {
      console.log(`  - ${staff.name} (${staff.role || 'No role'})`);
    });
    console.log();

    // Get notifications without staff assigned (pending and investigating only)
    const notifications = await db.collection('notifications').find({
      assignedStaffId: { $in: [null, ''] },
      reportStatus: { $in: ['pending', 'investigating'] }
    }).limit(100).toArray();

    console.log(`Found ${notifications.length} notifications without staff assignment\n`);

    if (notifications.length === 0) {
      console.log('✅ All notifications already have staff assigned!');
      return;
    }

    // Get current workload for each staff member
    const staffWithWorkload = await Promise.all(
      availableStaff.map(async (staff) => {
        const activeAssignments = await db.collection('notifications').countDocuments({
          assignedStaffId: staff._id.toString(),
          reportStatus: { $in: ['pending', 'investigating'] }
        });

        return {
          ...staff,
          currentWorkload: activeAssignments
        };
      })
    );

    console.log('Current Staff Workload:');
    staffWithWorkload.forEach(staff => {
      console.log(`  ${staff.name}: ${staff.currentWorkload} active assignments`);
    });
    console.log();

    // Process notifications
    let successCount = 0;
    let failCount = 0;
    const assignmentCounts = {};

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const progress = ((i + 1) / notifications.length * 100).toFixed(1);

      process.stdout.write(`\rProcessing: ${progress}% (${i + 1}/${notifications.length})`);

      try {
        // Sort staff by workload (ascending) - assign to staff with least workload
        const sortedStaff = [...staffWithWorkload].sort((a, b) => a.currentWorkload - b.currentWorkload);

        // Get staff with minimum workload
        const minWorkload = sortedStaff[0].currentWorkload;
        const availableStaffWithMinWorkload = sortedStaff.filter(
          staff => staff.currentWorkload === minWorkload
        );

        // Randomly select from staff with minimum workload
        const selectedStaff = availableStaffWithMinWorkload[
          Math.floor(Math.random() * availableStaffWithMinWorkload.length)
        ];

        // Assign staff to notification
        await db.collection('notifications').updateOne(
          { _id: notification._id },
          {
            $set: {
              assignedStaffId: selectedStaff._id.toString(),
              updatedAt: new Date()
            }
          }
        );

        // Update staff stats
        await db.collection('staff').updateOne(
          { _id: selectedStaff._id },
          {
            $inc: {
              'stats.totalAssigned': 1
            },
            $set: {
              updatedAt: new Date()
            }
          }
        );

        // Update workload for next assignment
        const staffIndex = staffWithWorkload.findIndex(s => s._id.toString() === selectedStaff._id.toString());
        if (staffIndex !== -1) {
          staffWithWorkload[staffIndex].currentWorkload++;
        }

        // Track assignment counts
        const staffName = selectedStaff.name;
        assignmentCounts[staffName] = (assignmentCounts[staffName] || 0) + 1;

        successCount++;

      } catch (error) {
        console.error(`\nError processing ${notification.notificationId}:`, error.message);
        failCount++;
      }
    }

    console.log('\n\n=== Assignment Complete ===');
    console.log(`Total processed: ${notifications.length}`);
    console.log(`Successfully assigned: ${successCount}`);
    console.log(`Failed: ${failCount}\n`);

    console.log('Staff Assignment Distribution:');
    Object.entries(assignmentCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([name, count]) => {
        console.log(`  ${name}: ${count} notifications`);
      });

    console.log('\n✅ Staff assignment complete!');
    console.log('Notifications are now assigned to staff based on workload balancing.');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
assignStaffToExistingNotifications()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
