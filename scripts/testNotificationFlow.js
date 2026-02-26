/**
 * Test notification creation with ML prediction and auto-fix
 */

const { saveNotificationToDB } = require('../utils/notificationUtil');
const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Testing Notification Creation Flow ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Create a test notification
    console.log('1. Creating test notification...');
    const result = await saveNotificationToDB({
      source: 'chromecast',
      title: 'Test Chromecast Offline',
      message: 'Test Chromecast device is offline - Connection timeout',
      deviceName: 'Test-Chromecast-01',
      ipAddr: '192.168.1.100',
      error: 'Connection timeout',
      currentStatus: 'offline',
      isStartup: false,
    });

    console.log('Result:', result);

    if (!result.success) {
      console.log('❌ Failed to create notification:', result.error);
      process.exit(1);
    }

    if (result.skipped) {
      console.log('⚠️  Notification skipped (duplicate):', result.message);
      process.exit(0);
    }

    const notificationId = result.notificationId;
    console.log(`✅ Notification created: ${notificationId}`);

    // Wait for async operations to complete
    console.log('\n2. Waiting 5 seconds for ML prediction and auto-fix...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check notification updates
    console.log('\n3. Checking notification for ML prediction...');
    const notification = await db.collection('notifications')
      .findOne({ notificationId: notificationId });

    if (!notification) {
      console.log('❌ Notification not found in database!');
      process.exit(1);
    }

    console.log('Notification details:');
    console.log(`  - errorCategory: ${notification.errorCategory}`);
    console.log(`  - mlConfidence: ${notification.mlConfidence}`);
    console.log(`  - priority: ${notification.priority}`);
    console.log(`  - assignedStaffId: ${notification.assignedStaffId}`);
    console.log(`  - reportStatus: ${notification.reportStatus}`);

    // Check for ML predictions
    console.log('\n4. Checking ML predictions...');
    const mlPredictions = await db.collection('ml_predictions')
      .find({ notificationId: notificationId })
      .toArray();

    console.log(`Found ${mlPredictions.length} ML predictions`);
    mlPredictions.forEach((pred, index) => {
      console.log(`  ${index + 1}. ${pred._id} - ${pred.predictedLabel} (${pred.confidence})`);
    });

    // Check for auto-fix logs
    console.log('\n5. Checking auto-fix logs...');
    const autoFixLogs = await db.collection('auto_fix_logs')
      .find({ notificationId: notificationId })
      .toArray();

    console.log(`Found ${autoFixLogs.length} auto-fix logs`);
    autoFixLogs.forEach((log, index) => {
      console.log(`  ${index + 1}. ${log.fixId}`);
      console.log(`     - Category: ${log.category}`);
      console.log(`     - Action: ${log.action}`);
      console.log(`     - Status: ${log.status}`);
    });

    // Summary
    console.log('\n📊 Summary:');
    console.log(`  ✅ Notification created: YES`);
    console.log(`  ${notification.errorCategory ? '✅' : '❌'} ML prediction: ${notification.errorCategory ? 'YES' : 'NO'}`);
    console.log(`  ${autoFixLogs.length > 0 ? '✅' : '❌'} Auto-fix logs: ${autoFixLogs.length > 0 ? 'YES' : 'NO'}`);
    console.log(`  ${notification.assignedStaffId ? '✅' : '❌'} Staff assigned: ${notification.assignedStaffId ? 'YES' : 'NO'}`);

    if (!notification.errorCategory || autoFixLogs.length === 0) {
      console.log('\n⚠️  ML prediction or auto-fix creation FAILED!');
      console.log('Check backend logs for errors.');
    } else {
      console.log('\n✅ All systems working correctly!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
