const { connectDB } = require('../autofix-db');

(async () => {
  const connection = await connectDB();
  const client = connection.client;
  const db = client.db('iptv');

  // Find test notifications by message pattern
  const testNotifs = await db.collection('notifications').find({
    message: { $regex: /^(Room 101|Room 102|Room 201|Room 204|RT Rusia|CNN Asia)/ }
  }).toArray();

  console.log('FOUND TEST NOTIFICATIONS:');
  testNotifs.forEach(n => {
    console.log(`${n.notificationId}`);
    console.log(`  Message: ${n.message}`);
    console.log(`  Category: ${n.errorCategory || 'NO CAT'}`);
    console.log();
  });

  process.exit(0);
})();
