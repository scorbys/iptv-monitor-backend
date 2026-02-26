const { connectDB } = require('../autofix-db');

(async () => {
  const connection = await connectDB();
  const client = connection.client;
  const db = client.db('iptv');

  // Get recent test notifications
  const notifs = await db.collection('notifications').find({
    notificationId: {
      $in: [
        'tv-1772091483448-er3ixdp6t',  // Room 101 - No signal
        'tv-1772091484374-s1q7ivxpg',  // Room 102 - LAN disconnected
        'chromecast-1772091485144-4lf7jn1sz',  // Room 201 - No device found
        'chromecast-1772091486335-k2ebdobhb',  // Room 204 - Connection refused
        'channel-1772091486754-vw7m3rpbc',  // RT Rusia - Error playing
        'channel-1772091487178-sg16zkqwr',  // CNN Asia - Connection failure
      ]
    }
  }).toArray();

  console.log('=== RECENT TEST NOTIFICATIONS ===');
  notifs.forEach(n => {
    console.log(`${n.notificationId}`);
    console.log(`  Category: ${n.errorCategory || 'NO CATEGORY'}`);
    console.log(`  Message: ${n.message.substring(0, 80)}`);
    console.log();
  });

  process.exit(0);
})();
