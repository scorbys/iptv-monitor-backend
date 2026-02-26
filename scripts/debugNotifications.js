const { connectDB } = require('../autofix-db');

(async () => {
  const connection = await connectDB();
  const client = connection.client;
  const db = client.db('iptv');

  // Get ALL notifications
  const allNotifs = await db.collection('notifications')
    .find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  console.log('=== ALL RECENT NOTIFICATIONS ===');
  allNotifs.forEach(n => {
    const errorCat = n.errorCategory || 'NO ML';
    const msg = n.message ? n.message.substring(0, 50) : '';
    console.log(`${n.notificationId} | ${n.source} | ${n.currentStatus} | ${errorCat} | ${msg}`);
  });

  console.log(`\nTotal: ${allNotifs.length}`);

  // Check if ML predictions exist
  const mlPreds = await db.collection('ml_predictions').countDocuments();
  const autoFixLogs = await db.collection('auto_fix_logs').countDocuments();

  console.log(`\nML Predictions: ${mlPreds}`);
  console.log(`Auto-fix Logs: ${autoFixLogs}`);

  process.exit(0);
})();
