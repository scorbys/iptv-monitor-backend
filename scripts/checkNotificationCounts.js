/**
 * Check notification count discrepancy
 * Investigates why UI shows 782 vs DB count 999
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Investigating Notification Count Discrepancy ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // 1. Total notifications in database
    const totalCount = await db.collection('notifications').countDocuments();
    console.log(`1. Total notifications in database: ${totalCount}`);

    // 2. Count by isStartup flag
    const startupCount = await db.collection('notifications').countDocuments({ isStartup: true });
    const nonStartupCount = await db.collection('notifications').countDocuments({ isStartup: { $ne: true } });
    console.log(`   - Startup notifications: ${startupCount}`);
    console.log(`   - Non-startup notifications: ${nonStartupCount}`);

    // 3. Count notifications older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldCount = await db.collection('notifications').countDocuments({
      createdAt: { $lt: sevenDaysAgo }
    });
    const recentCount = await db.collection('notifications').countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    console.log(`\n2. Notifications by age:`);
    console.log(`   - Older than 7 days: ${oldCount}`);
    console.log(`   - Last 7 days: ${recentCount}`);

    // 4. Recent non-startup notifications (what UI should show)
    const recentNonStartup = await db.collection('notifications').countDocuments({
      createdAt: { $gte: sevenDaysAgo },
      isStartup: { $ne: true }
    });
    console.log(`\n3. Recent non-startup notifications (expected UI count): ${recentNonStartup}`);

    // 5. Check for duplicates by notificationId
    const duplicates = await db.collection('notifications').aggregate([
      { $group: { _id: '$notificationId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    console.log(`\n4. Duplicate notificationIds: ${duplicates.length}`);
    if (duplicates.length > 0) {
      console.log('   Sample duplicates:', duplicates.slice(0, 5).map(d => `${d._id}: ${d.count}x`));
    }

    // 6. Count by reportStatus
    const byStatus = await db.collection('notifications').aggregate([
      { $group: { _id: '$reportStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log(`\n5. Notifications by status:`);
    byStatus.forEach(item => {
      console.log(`   - ${item._id || 'undefined'}: ${item.count}`);
    });

    // 7. Count by source
    const bySource = await db.collection('notifications').aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log(`\n6. Notifications by source:`);
    bySource.forEach(item => {
      console.log(`   - ${item._id || 'undefined'}: ${item.count}`);
    });

    // 8. Calculate what frontend fetches (with limit=100)
    const fetchedWithLimit = Math.min(100, totalCount);
    console.log(`\n7. Notifications fetched by frontend (limit=100): ${fetchedWithLimit}`);

    // 9. Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Database total: ${totalCount}`);
    console.log(`Startup notifications excluded: -${startupCount}`);
    console.log(`After startup filter: ${totalCount - startupCount}`);
    console.log(`Older than 7 days: -${oldCount}`);
    console.log(`Expected UI count (recent, non-startup): ${recentNonStartup}`);
    console.log(`\nDifference: ${totalCount - recentNonStartup} notifications`);

    console.log('\n=== CONCLUSION ===');
    if (totalCount !== recentNonStartup) {
      console.log('The discrepancy is due to:');
      console.log('1. Startup notifications being filtered out');
      console.log('2. Old notifications (>7 days) being filtered out');
      console.log('3. API limit (100) potentially affecting count display');
    } else {
      console.log('Counts match! The UI should show all recent non-startup notifications.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
