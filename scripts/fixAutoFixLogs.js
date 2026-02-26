/**
 * Fix auto-fix logs for already resolved notifications
 * Update status from 'pending' to 'success' for resolved notifications
 */

// Load .env from backend directory
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Fixing Auto-Fix Logs for Resolved Notifications ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get all resolved notifications
    const resolvedNotifications = await db.collection('notifications').find({
      reportStatus: 'resolved'
    }).toArray();

    console.log(`Found ${resolvedNotifications.length} resolved notifications\n`);

    let updatedCount = 0;
    let alreadyCorrectCount = 0;
    let noAutoFixLogCount = 0;

    for (const notification of resolvedNotifications) {
      // Find auto-fix log for this notification
      const autoFixLog = await db.collection('auto_fix_logs').findOne({
        notificationId: notification.notificationId
      });

      if (!autoFixLog) {
        console.log(`⚠️  No auto-fix log found for ${notification.notificationId}`);
        noAutoFixLogCount++;

        // Create auto-fix log for resolved notification without one
        const handlingStartTime = new Date(notification.handlingStartTime);
        const handlingEndTime = new Date(notification.handlingEndTime || notification.updatedAt);
        const elapsedSeconds = Math.floor((handlingEndTime - handlingStartTime) / 1000);

        await db.collection('auto_fix_logs').insertOne({
          fixId: `fix-auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          notificationId: notification.notificationId,
          category: notification.errorCategory || 'Auto-Resolved',
          action: 'auto-resolve',
          description: `Automatically resolved ${notification.errorCategory || 'issue'} after ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
          status: 'success',
          confidence: 0.9,
          createdAt: notification.createdAt,
          updatedAt: handlingEndTime,
          executedAt: handlingEndTime,
          result: {
            action: 'auto_resolved',
            message: 'Notification automatically resolved by scheduler',
            details: `Resolved after ${elapsedSeconds} seconds from assignment`
          }
        });

        console.log(`   ✅ Created auto-fix log entry\n`);
        updatedCount++;
        continue;
      }

      // Check if status needs to be updated
      if (autoFixLog.status !== 'success') {
        const handlingStartTime = new Date(notification.handlingStartTime);
        const handlingEndTime = new Date(notification.handlingEndTime || notification.updatedAt);
        const elapsedSeconds = Math.floor((handlingEndTime - handlingStartTime) / 1000);

        await db.collection('auto_fix_logs').updateOne(
          { notificationId: notification.notificationId },
          {
            $set: {
              status: 'success',
              action: 'auto-resolve',
              description: `Automatically resolved ${notification.errorCategory || 'issue'} after ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
              updatedAt: handlingEndTime,
              executedAt: handlingEndTime,
              'result.action': 'auto_resolved',
              'result.message': 'Notification automatically resolved by scheduler',
              'result.details': `Resolved after ${elapsedSeconds} seconds from assignment`
            }
          }
        );

        console.log(`✅ Updated ${notification.notificationId} from '${autoFixLog.status}' to 'success'`);
        updatedCount++;
      } else {
        console.log(`✓ ${notification.notificationId} already has status 'success'`);
        alreadyCorrectCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total resolved notifications: ${resolvedNotifications.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Already correct: ${alreadyCorrectCount}`);
    console.log(`No auto-fix log found (created): ${noAutoFixLogCount}`);

    // Show auto-fix log stats
    const stats = await db.collection('auto_fix_logs').aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log('\n📊 Auto-Fix Log Status Breakdown:');
    stats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}`);
    });

    console.log('\n✅ Auto-fix logs fixed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
