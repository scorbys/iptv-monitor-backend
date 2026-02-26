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
  const resolvedNotifs = await db.collection('notifications').countDocuments({
    reportStatus: 'resolved'
  });
  const unassignedNotifs = totalNotifs - assignedNotifs;

  console.log('=== SYSTEM SUMMARY ===');
  console.log(`Total Notifications: ${totalNotifs}`);
  console.log(`Assigned to Staff: ${assignedNotifs} (${((assignedNotifs/totalNotifs)*100).toFixed(1)}%)`);
  console.log(`Resolved: ${resolvedNotifs} (${((resolvedNotifs/totalNotifs)*100).toFixed(1)}%)`);
  console.log(`Unassigned: ${unassignedNotifs}\n`);

  // Get staff with full stats
  const staff = await db.collection('staff').find({
    deletedAt: { $exists: false }
  }).toArray();

  console.log('=== STAFF PERFORMANCE STATS ===\n');

  const staffWorkloads = await Promise.all(
    staff.map(async (s) => {
      const activeCount = await db.collection('notifications').countDocuments({
        assignedStaffId: s._id.toString(),
        reportStatus: { $in: ['pending', 'investigating'] }
      });

      const resolvedCount = await db.collection('notifications').countDocuments({
        assignedStaffId: s._id.toString(),
        reportStatus: 'resolved'
      });

      return {
        name: s.name,
        department: s.department || 'N/A',
        position: s.position || 'N/A',
        isActive: s.isActive,
        totalAssigned: s.stats?.totalAssigned || 0,
        totalResolved: s.stats?.totalResolved || 0,
        successRate: s.stats?.successRate || 0,
        avgResolutionTime: s.stats?.avgResolutionTime || 0,
        activeAssignments: activeCount,
        resolvedCount: resolvedCount
      };
    })
  );

  // Sort by total resolved (descending)
  staffWorkloads.sort((a, b) => b.totalResolved - a.totalResolved);

  staffWorkloads.forEach((s, index) => {
    console.log(`${index + 1}. ${s.name}`);
    console.log(`   Department: ${s.department}`);
    console.log(`   Position: ${s.position}`);
    console.log(`   Status: ${s.isActive ? '✅ Active' : '❌ Inactive'}`);
    console.log(`   ──────────────────────────────────`);
    console.log(`   📊 Performance:`);
    console.log(`   • Total Assigned: ${s.totalAssigned}`);
    console.log(`   • Total Resolved: ${s.totalResolved}`);
    console.log(`   • Active Tasks: ${s.activeAssignments}`);
    console.log(`   • Success Rate: ${s.successRate.toFixed(1)}%`);
    console.log(`   • Avg Resolution Time: ${s.avgResolutionTime} min`);
    console.log();
  });

  console.log('=== TOP PERFORMERS ===');
  const topByResolved = [...staffWorkloads].sort((a, b) => b.totalResolved - a.totalResolved)[0];
  const topBySuccessRate = [...staffWorkloads].filter(s => s.totalAssigned >= 3).sort((a, b) => b.successRate - a.successRate)[0];

  console.log(`🏆 Most Resolved: ${topByResolved.name} (${topByResolved.totalResolved} resolved)`);
  console.log(`⭐ Best Success Rate: ${topBySuccessRate?.name || 'N/A'} (${topBySuccessRate?.successRate.toFixed(1) || 0}%)\n`);

  console.log('✅ Staff performance is now fully tracked!');
  console.log('Performance data is visible in: StaffPage.tsx');

  process.exit(0);
})();
