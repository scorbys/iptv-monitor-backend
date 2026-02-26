const { connectDB } = require('../autofix-db');

(async () => {
  const connection = await connectDB();
  const client = connection.client;
  const db = client.db('iptv');

  // Get recent notifications with error categories
  const notifications = await db.collection('notifications')
    .find({ errorCategory: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  console.log('=== RECENT NOTIFICATIONS CATEGORIES ===');
  const categoryCount = {};
  notifications.forEach(n => {
    categoryCount[n.errorCategory] = (categoryCount[n.errorCategory] || 0) + 1;
    console.log(`${n.notificationId} | ${n.source} | ${n.errorCategory} | ${n.message}`);
  });

  console.log('\n=== CATEGORY DISTRIBUTION ===');
  Object.entries(categoryCount)
    .sort(([,a], [,b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`${cat}: ${count}`);
    });

  // Check actual device sources
  console.log('\n=== SOURCE DISTRIBUTION ===');
  const sourceCount = {};
  notifications.forEach(n => {
    sourceCount[n.source] = (sourceCount[n.source] || 0) + 1;
  });
  Object.entries(sourceCount).forEach(([source, count]) => {
    console.log(`${source}: ${count}`);
  });

  process.exit(0);
})();
