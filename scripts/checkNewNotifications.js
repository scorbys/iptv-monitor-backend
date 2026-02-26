/**
 * Check new notifications and see why auto_fix_logs are not created
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Checking New Notifications ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get recent notifications
    const notifications = await db.collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    console.log(`📊 Found ${notifications.length} recent notifications:\n`);

    notifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.notificationId}`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Error: ${notif.error || 'N/A'}`);
      console.log(`   Error Category: ${notif.errorCategory || 'N/A'}`);
      console.log(`   Source: ${notif.source}`);
      console.log(`   Status: ${notif.currentStatus}`);
      console.log(`   Report Status: ${notif.reportStatus}`);
      console.log(`   Priority: ${notif.priority || 'N/A'}`);
      console.log(`   Created: ${notif.createdAt}`);
      console.log(`   Has ML Prediction: ${notif.mlPredictionId ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Check for auto_fix_logs
    console.log('\n🔍 Checking auto_fix_logs...');
    const autoFixLogs = await db.collection('auto_fix_logs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (autoFixLogs.length === 0) {
      console.log('⚠️  No auto_fix_logs found in database!');
    } else {
      console.log(`✅ Found ${autoFixLogs.length} auto_fix_logs:\n`);
      autoFixLogs.forEach((log, index) => {
        console.log(`${index + 1}. ${log.fixId}`);
        console.log(`   Notification ID: ${log.notificationId}`);
        console.log(`   Category: ${log.category}`);
        console.log(`   Status: ${log.status}`);
        console.log(`   Created: ${log.createdAt}`);
        console.log('');
      });
    }

    // Check ML service status
    console.log('\n🤖 Checking ML predictions...');
    const mlPredictions = await db.collection('ml_predictions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (mlPredictions.length === 0) {
      console.log('⚠️  No ML predictions found');
    } else {
      console.log(`✅ Found ${mlPredictions.length} ML predictions`);
    }

    // Analyze why auto_fix_logs might not be created
    console.log('\n🔍 Analysis:\n');

    const notifWithML = notifications.filter(n => n.mlPredictionId);
    const notifWithoutML = notifications.filter(n => !n.mlPredictionId);

    console.log(`Notifications with ML prediction: ${notifWithML.length}`);
    console.log(`Notifications without ML prediction: ${notifWithoutML.length}`);

    if (notifWithoutML.length > 0) {
      console.log('\n⚠️  Possible issues:');
      console.log('   1. ML service might not be running');
      console.log('   2. ML prediction endpoint not being called');
      console.log('   3. Error during ML prediction');
      console.log('   4. Auto-fix creation not triggered after ML prediction');
    }

    // Check notification creation flow
    console.log('\n📋 Expected Flow:');
    console.log('   1. Device status change detected');
    console.log('   2. Notification created → saved to notifications collection');
    console.log('   3. ML prediction triggered → saved to ml_predictions collection');
    console.log('   4. Auto-fix created → saved to auto_fix_logs collection');
    console.log('   5. Staff assigned → notification updated with assignedStaffId');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
