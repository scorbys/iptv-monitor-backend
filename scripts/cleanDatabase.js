/**
 * Clean up notifications and auto_fix_logs collections
 * This script will DELETE all data from these collections
 */

const { connectDB } = require('../autofix-db');

async function cleanDatabase() {
  console.log('=== Database Cleanup Script ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // 1. Check current state
    console.log('📊 Current Database State:');
    console.log('-'.repeat(50));

    const notifCount = await db.collection('notifications').countDocuments();
    const autoFixCount = await db.collection('auto_fix_logs').countDocuments();

    console.log(`Notifications: ${notifCount} documents`);
    console.log(`Auto-fix logs: ${autoFixCount} documents`);

    // 2. Show sample data
    console.log('\n📝 Sample notifications (first 3):');
    const sampleNotifs = await db.collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();

    sampleNotifs.forEach((notif, index) => {
      console.log(`\n  ${index + 1}. ${notif.notificationId}`);
      console.log(`     Title: ${notif.title}`);
      console.log(`     Status: ${notif.reportStatus}`);
      console.log(`     Created: ${notif.createdAt}`);
    });

    // 3. Perform cleanup
    console.log('\n🧹 Cleaning up...');

    // Delete all notifications
    const notifResult = await db.collection('notifications').deleteMany({});
    console.log(`✅ Deleted ${notifResult.deletedCount} notifications`);

    // Delete all auto_fix_logs
    const autoFixResult = await db.collection('auto_fix_logs').deleteMany({});
    console.log(`✅ Deleted ${autoFixResult.deletedCount} auto-fix logs`);

    // 4. Verify cleanup
    console.log('\n📊 Post-Cleanup State:');
    console.log('-'.repeat(50));

    const notifCountAfter = await db.collection('notifications').countDocuments();
    const autoFixCountAfter = await db.collection('auto_fix_logs').countDocuments();

    console.log(`Notifications: ${notifCountAfter} documents`);
    console.log(`Auto-fix logs: ${autoFixCountAfter} documents`);

    if (notifCountAfter === 0 && autoFixCountAfter === 0) {
      console.log('\n✅ Cleanup successful! Database is now clean.');
    } else {
      console.log('\n⚠️  Cleanup completed but some data remains.');
    }

    // 5. Reset staff stats
    console.log('\n📋 Resetting Staff Statistics...');
    const staff = await db.collection('staff').find({}).toArray();

    if (staff.length > 0) {
      console.log(`Found ${staff.length} staff members`);

      const resetResult = await db.collection('staff').updateMany(
        {},
        {
          $set: {
            'stats.totalAssigned': 0,
            'stats.totalResolved': 0,
            'stats.avgResolutionTime': 0,
            'stats.successRate': 0
          }
        }
      );
      console.log(`✅ Reset statistics for ${resetResult.modifiedCount} staff members`);
    }

    console.log('\n✅ All done! Database is clean and ready for fresh data.');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }

  process.exit(0);
}

cleanDatabase();
