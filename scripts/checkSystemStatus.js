/**
 * Script to check the current status of notifications, ML predictions, and auto-fix logs
 *
 * Usage: node backend/scripts/checkSystemStatus.js
 */

const { connectDB } = require('../autofix-db');

async function checkSystemStatus() {
  console.log('=== System Status Check ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // 1. Notifications Statistics
    console.log('📊 NOTIFICATIONS');
    console.log('-------------------');
    const totalNotifications = await db.collection('notifications').countDocuments();
    const notificationsWithML = await db.collection('notifications').countDocuments({
      errorCategory: { $ne: null, $exists: true }
    });
    const notificationsWithoutML = totalNotifications - notificationsWithML;
    const pendingNotifications = await db.collection('notifications').countDocuments({
      reportStatus: 'pending'
    });
    const resolvedNotifications = await db.collection('notifications').countDocuments({
      reportStatus: 'resolved'
    });

    console.log(`Total notifications: ${totalNotifications}`);
    console.log(`With ML predictions: ${notificationsWithML} (${((notificationsWithML/totalNotifications)*100).toFixed(1)}%)`);
    console.log(`Without ML predictions: ${notificationsWithoutML} (${((notificationsWithoutML/totalNotifications)*100).toFixed(1)}%)`);
    console.log(`Pending: ${pendingNotifications}`);
    console.log(`Resolved: ${resolvedNotifications}`);

    // 2. ML Predictions Statistics
    console.log('\n🤖 ML PREDICTIONS');
    console.log('-------------------');
    const totalPredictions = await db.collection('ml_predictions').countDocuments();
    console.log(`Total predictions: ${totalPredictions}`);

    // 3. Auto-Fix Logs Statistics
    console.log('\n🔧 AUTO-FIX LOGS');
    console.log('-------------------');
    const totalAutoFixLogs = await db.collection('auto_fix_logs').countDocuments();

    const autoFixStats = await db.collection('auto_fix_logs').aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log(`Total auto-fix logs: ${totalAutoFixLogs}`);
    autoFixStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}`);
    });

    // 4. Category Breakdown
    console.log('\n📁 CATEGORY BREAKDOWN');
    console.log('-------------------');
    const categoryBreakdown = await db.collection('notifications').aggregate([
      {
        $match: {
          errorCategory: { $ne: null, $exists: true }
        }
      },
      {
        $group: {
          _id: '$errorCategory',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    if (categoryBreakdown.length === 0) {
      console.log('No categories found yet');
    } else {
      categoryBreakdown.forEach(cat => {
        const percentage = ((cat.count / notificationsWithML) * 100).toFixed(1);
        console.log(`${cat._id}: ${cat.count} (${percentage}%)`);
      });
    }

    // 5. Recent Activity
    console.log('\n📅 RECENT ACTIVITY (Last 24 Hours)');
    console.log('-------------------');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const recentNotifications = await db.collection('notifications').countDocuments({
      createdAt: { $gte: yesterday }
    });
    const recentAutoFixes = await db.collection('auto_fix_logs').countDocuments({
      createdAt: { $gte: yesterday }
    });
    const recentPredictions = await db.collection('ml_predictions').countDocuments({
      createdAt: { $gte: yesterday }
    });

    console.log(`New notifications: ${recentNotifications}`);
    console.log(`New auto-fix logs: ${recentAutoFixes}`);
    console.log(`New ML predictions: ${recentPredictions}`);

    // 6. Staff Assignment Status
    console.log('\n👥 STAFF ASSIGNMENT');
    console.log('-------------------');
    const totalStaff = await db.collection('staff').countDocuments();
    const assignedNotifications = await db.collection('notifications').countDocuments({
      assignedStaffId: { $ne: null, $exists: true }
    });
    const handledNotifications = await db.collection('notifications').countDocuments({
      handledByStaffId: { $ne: null, $exists: true }
    });

    console.log(`Total staff: ${totalStaff}`);
    console.log(`Notifications assigned: ${assignedNotifications}`);
    console.log(`Notifications handled: ${handledNotifications}`);

    // 7. Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-------------------');

    if (notificationsWithoutML > 0) {
      console.log(`⚠️  ${notificationsWithoutML} notifications need ML predictions`);
      console.log('   Run: node backend/scripts/processExistingNotifications.js');
    }

    if (totalStaff === 0) {
      console.log('⚠️  No staff members found. Add staff to enable assignment feature.');
    }

    if (pendingNotifications > 0) {
      console.log(`ℹ️  ${pendingNotifications} notifications pending review`);
    }

    const autoFixSuccessRate = autoFixStats.find(s => s._id === 'success')?.count || 0;
    if (totalAutoFixLogs > 0 && autoFixSuccessRate / totalAutoFixLogs < 0.5) {
      console.log('⚠️  Auto-fix success rate is below 50%. Consider reviewing fix strategies.');
    }

    console.log('\n✅ System check complete!');

  } catch (error) {
    console.error('\nError checking system status:', error);
    process.exit(1);
  }
}

// Run the script
checkSystemStatus()
  .then(() => {
    console.log();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
