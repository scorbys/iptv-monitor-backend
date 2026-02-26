/**
 * Reset staff stats to 0 and recalculate from actual notifications in database
 */

// Load .env from backend directory
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Resetting Staff Stats from Actual Data ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get all active staff
    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).toArray();

    console.log(`Found ${staff.length} staff members\n`);

    for (const member of staff) {
      console.log(`Processing ${member.name}...`);

      // Count actual notifications assigned to this staff
      const totalAssigned = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString()
      });

      // Count actual resolved notifications
      const totalResolved = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString(),
        reportStatus: 'resolved'
      });

      // Calculate success rate
      const successRate = totalAssigned > 0 ? (totalResolved / totalAssigned) * 100 : 0;

      // Update staff stats in database (NOTE: avgResolutionTime removed)
      await db.collection('staff').updateOne(
        { _id: member._id },
        {
          $set: {
            'stats.totalAssigned': totalAssigned,
            'stats.totalResolved': totalResolved,
            'stats.successRate': successRate,
            updatedAt: new Date()
          }
        }
      );

      console.log(`  ✅ Total Assigned: ${totalAssigned} (actual notifications)`);
      console.log(`  ✅ Total Resolved: ${totalResolved} (actual resolved)`);
      console.log(`  ✅ Success Rate: ${successRate.toFixed(1)}%`);
    }

    console.log('✅ All staff stats reset to actual values!\n');

    // Show final summary
    console.log('📊 Final Staff Statistics (from actual data):');
    console.log('='.repeat(70));

    const updatedStaff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).sort({ name: 1 }).toArray();

    updatedStaff.forEach(member => {
      console.log(`\n${member.name}:`);
      console.log(`  Total Assigned: ${member.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${member.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(member.stats?.successRate || 0).toFixed(1)}%`);
    });

    // Compare with notification counts
    console.log('\n\n📋 Verification (comparing with actual notifications):');
    console.log('='.repeat(70));

    for (const member of updatedStaff) {
      const notifications = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString()
      });

      const resolved = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString(),
        reportStatus: 'resolved'
      });

      const statsMatch = notifications === (member.stats?.totalAssigned || 0);
      const resolvedMatch = resolved === (member.stats?.totalResolved || 0);

      console.log(`\n${member.name}:`);
      console.log(`  Notifications in DB: ${notifications} vs Stats: ${member.stats?.totalAssigned || 0} ${statsMatch ? '✅' : '❌'}`);
      console.log(`  Resolved in DB: ${resolved} vs Stats: ${member.stats?.totalResolved || 0} ${resolvedMatch ? '✅' : '❌'}`);
    }

    console.log('\n\n✅ Stats reset complete! Now stats match actual data in MongoDB.');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
