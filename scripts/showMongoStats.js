/**
 * Show current staff stats directly from MongoDB
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Current Staff Stats in MongoDB ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).sort({ name: 1 }).toArray();

    console.log('📊 Staff Statistics (from MongoDB):\n');
    console.log('='.repeat(70));

    staff.forEach(member => {
      console.log(`\n${member.name}`);
      console.log(`  Department: ${member.department}`);
      console.log(`  Position: ${member.position || 'N/A'}`);
      console.log(`  Active: ${member.isActive !== false ? 'Yes' : 'No'}`);
      console.log(`\n  Statistics (stored in MongoDB):`);
      console.log(`  ├── Total Assigned: ${member.stats?.totalAssigned || 0}`);
      console.log(`  ├── Total Resolved: ${member.stats?.totalResolved || 0}`);
      console.log(`  ├── Success Rate: ${(member.stats?.successRate || 0).toFixed(1)}%`);
      console.log(`  └── Avg Resolution Time: ${member.stats?.avgResolutionTime || 0} minutes`);
      console.log(`\n  Last Updated: ${member.updatedAt || 'Never'}`);
    });

    console.log('\n\n' + '='.repeat(70));
    console.log('\n✅ All statistics are stored in MongoDB database!');
    console.log('\n📋 To query stats directly in MongoDB shell:');
    console.log('   use iptv');
    console.log('   db.staff.find({}, {name: 1, stats: 1})');
    console.log('\n📋 To see staff ranking:');
    console.log('   db.staff.find({}).sort({"stats.successRate": -1})');

    // Show notification count by staff
    console.log('\n\n📋 Notification Counts by Staff:\n');
    console.log('='.repeat(70));

    for (const member of staff) {
      const notifications = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString()
      });

      const resolved = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString(),
        reportStatus: 'resolved'
      });

      console.log(`\n${member.name}:`);
      console.log(`  Total Notifications: ${notifications}`);
      console.log(`  Resolved: ${resolved}`);
      console.log(`  Pending: ${notifications - resolved}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
