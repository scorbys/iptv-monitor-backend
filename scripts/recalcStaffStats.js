/**
 * Recalculate all staff statistics correctly
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Recalculating Staff Statistics ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get all active staff
    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    console.log(`Found ${staff.length} staff members\n`);

    for (const member of staff) {
      console.log(`Processing ${member.name}...`);

      // Get all notifications assigned to this staff
      const notifications = await db.collection('notifications').find({
        assignedStaffId: member._id.toString()
      }).toArray();

      const totalAssigned = notifications.length;
      const totalResolved = notifications.filter(n => n.reportStatus === 'resolved').length;

      // Calculate average resolution time for resolved notifications
      let totalResolutionTime = 0;
      let resolvedWithTime = 0;

      notifications.forEach(notif => {
        if (notif.reportStatus === 'resolved' && notif.handlingStartTime && notif.handlingEndTime) {
          const resolutionTime = new Date(notif.handlingEndTime).getTime() - new Date(notif.handlingStartTime).getTime();
          totalResolutionTime += resolutionTime;
          resolvedWithTime++;
        }
      });

      const avgResolutionTime = resolvedWithTime > 0
        ? Math.floor(totalResolutionTime / resolvedWithTime / 60000) // Convert to minutes
        : 0;

      // Calculate success rate
      const successRate = totalAssigned > 0
        ? (totalResolved / totalAssigned) * 100
        : 0;

      // Update staff stats
      await db.collection('staff').updateOne(
        { _id: member._id },
        {
          $set: {
            'stats.totalAssigned': totalAssigned,
            'stats.totalResolved': totalResolved,
            'stats.avgResolutionTime': avgResolutionTime,
            'stats.successRate': successRate,
            updatedAt: new Date()
          }
        }
      );

      console.log(`  ✅ Total Assigned: ${totalAssigned}`);
      console.log(`  ✅ Total Resolved: ${totalResolved}`);
      console.log(`  ✅ Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`  ✅ Avg Resolution Time: ${avgResolutionTime} minutes\n`);
    }

    console.log('✅ All staff statistics recalculated successfully!');

    // Show final summary
    console.log('\n📊 Final Staff Statistics:');
    console.log('-'.repeat(60));

    const updatedStaff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).toArray();

    updatedStaff.forEach(member => {
      console.log(`\n${member.name}:`);
      console.log(`  Department: ${member.department}`);
      console.log(`  Position: ${member.position || 'N/A'}`);
      console.log(`  Stats:`);
      console.log(`  - Total Assigned: ${member.stats?.totalAssigned || 0}`);
      console.log(`  - Total Resolved: ${member.stats?.totalResolved || 0}`);
      console.log(`  - Success Rate: ${(member.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  - Avg Resolution Time: ${member.stats?.avgResolutionTime || 0} minutes`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
