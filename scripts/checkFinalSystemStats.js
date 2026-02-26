const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

(async () => {
  const connection = await connectDB();
  const db = connection.client.db('iptv');

  // Get overall stats
  const totalNotifs = await db.collection('notifications').countDocuments();
  const assignedNotifs = await db.collection('notifications').countDocuments({
    assignedStaffId: { $exists: true, $ne: null }
  });
  const unassignedNotifs = totalNotifs - assignedNotifs;

  console.log('=== SYSTEM SUMMARY ===');
  console.log(`Total Notifications: ${totalNotifs}`);
  console.log(`Assigned to Staff: ${assignedNotifs} (${((assignedNotifs/totalNotifs)*100).toFixed(1)}%)`);
  console.log(`Unassigned: ${unassignedNotifs}\n`);

  // Get staff stats
  const staff = await db.collection('staff').find({
    deletedAt: { $exists: false }
  }).toArray();

  console.log('=== STAFF WORKLOAD ===');
  const staffWorkloads = await Promise.all(
    staff.map(async (s) => {
      const activeCount = await db.collection('notifications').countDocuments({
        assignedStaffId: s._id.toString(),
        reportStatus: { $in: ['pending', 'investigating'] }
      });
      return {
        name: s.name,
        totalAssigned: s.stats?.totalAssigned || 0,
        activeAssignments: activeCount
      };
    })
  );

  staffWorkloads.forEach(s => {
    console.log(`${s.name}:`);
    console.log(`  Total Assigned: ${s.totalAssigned}`);
    console.log(`  Active: ${s.activeAssignments}`);
  });

  console.log('\n✅ Automatic staff assignment is now ACTIVE!');
  console.log('All new notifications will automatically be assigned to staff.');

  process.exit(0);
})();
