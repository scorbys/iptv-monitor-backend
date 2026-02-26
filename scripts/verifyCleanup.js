/**
 * Verify database cleanup and check all collections
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Database Cleanup Verification ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    console.log('📊 Collection Counts:');
    console.log('-'.repeat(50));

    const collections = ['notifications', 'auto_fix_logs', 'staff', 'users', 'ml_predictions'];

    for (const colName of collections) {
      try {
        const count = await db.collection(colName).countDocuments();
        console.log(`✅ ${colName}: ${count} documents`);
      } catch (error) {
        console.log(`❌ ${colName}: Error - ${error.message}`);
      }
    }

    console.log('\n📋 Staff Members:');
    console.log('-'.repeat(50));

    const staff = await db.collection('staff').find({}).toArray();

    if (staff.length === 0) {
      console.log('⚠️  No staff members found');
    } else {
      staff.forEach((member, index) => {
        console.log(`\n${index + 1}. ${member.name}`);
        console.log(`   Position: ${member.position}`);
        console.log(`   Department: ${member.department}`);
        console.log(`   Stats:`);
        console.log(`   - Total Assigned: ${member.stats?.totalAssigned || 0}`);
        console.log(`   - Total Resolved: ${member.stats?.totalResolved || 0}`);
        console.log(`   - Success Rate: ${member.stats?.successRate || 0}%`);
        console.log(`   - Avg Resolution Time: ${member.stats?.avgResolutionTime || 0} minutes`);
      });
    }

    console.log('\n✅ Cleanup Verification Complete!');
    console.log('\n📌 Next Steps:');
    console.log('   1. Clear browser localStorage to remove cached notifications');
    console.log('   2. Refresh the frontend application');
    console.log('   3. Verify "All Notifications" shows 0');
    console.log('   4. Application is ready for fresh data');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
