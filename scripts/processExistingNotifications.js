/**
 * Script to process existing notifications with ML predictions and auto-fix logs
 * Run this script to backfill data for notifications that don't have ML predictions yet
 *
 * Usage: node backend/scripts/processExistingNotifications.js
 */

const { connectDB } = require('../autofix-db');
const { triggerMLPrediction, createAutoFixFromNotification } = require('../utils/notificationUtil');

async function processExistingNotifications() {
  console.log('=== Processing Existing Notifications for ML & Auto-Fix ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');
    const notifications = db.collection('notifications');

    // Find notifications that don't have errorCategory yet
    const notificationsWithoutML = await notifications.find({
      $or: [
        { errorCategory: null },
        { errorCategory: { $exists: false } }
      ]
    }).toArray();

    console.log(`Found ${notificationsWithoutML.length} notifications without ML predictions`);

    if (notificationsWithoutML.length === 0) {
      console.log('No notifications to process. All notifications already have ML predictions.');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let autoFixCount = 0;

    // Process each notification
    for (let i = 0; i < notificationsWithoutML.length; i++) {
      const notification = notificationsWithoutML[i];
      const progress = ((i + 1) / notificationsWithoutML.length * 100).toFixed(1);

      process.stdout.write(`\rProcessing: ${progress}% (${i + 1}/${notificationsWithoutML.length})`);

      try {
        // 1. Trigger ML prediction
        const mlResult = await triggerMLPrediction(notification.notificationId);

        if (mlResult.success) {
          successCount++;
          console.log(`\n✓ ML prediction for ${notification.notificationId}: ${mlResult.prediction.predicted_label}`);

          // 2. Create auto-fix log
          const autoFixResult = await createAutoFixFromNotification(notification.notificationId, 'automatic');
          if (autoFixResult.success) {
            autoFixCount++;
            console.log(`  ✓ Auto-fix log created: ${autoFixResult.fixId}`);
          }

          // Add a small delay to avoid overwhelming the ML service
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          failCount++;
          console.log(`\n✗ Failed to process ${notification.notificationId}: ${mlResult.error || 'Unknown error'}`);
        }
      } catch (error) {
        failCount++;
        console.log(`\n✗ Error processing ${notification.notificationId}: ${error.message}`);
      }
    }

    console.log('\n\n=== Processing Complete ===');
    console.log(`Total notifications processed: ${notificationsWithoutML.length}`);
    console.log(`ML predictions created: ${successCount}`);
    console.log(`Auto-fix logs created: ${autoFixCount}`);
    console.log(`Failed: ${failCount}`);

    // Show summary of categories
    const categorySummary = await notifications.aggregate([
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

    console.log('\n=== Category Summary ===');
    categorySummary.forEach(cat => {
      console.log(`${cat._id}: ${cat.count} notifications`);
    });

  } catch (error) {
    console.error('\nError processing notifications:', error);
    process.exit(1);
  }
}

// Run the script
processExistingNotifications()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
