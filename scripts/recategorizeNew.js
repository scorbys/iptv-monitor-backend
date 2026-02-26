const { connectDB } = require('../autofix-db');

// Client-side categorization logic
function getSpecificFAQCategory(notification) {
  const notifText = [
    notification.title?.toLowerCase() || "",
    notification.message?.toLowerCase() || "",
    notification.error?.toLowerCase() || "",
    notification.deviceName?.toLowerCase() || "",
    notification.errorCategory?.toLowerCase() || "",
  ].join(" ");

  const categoryMappings = {
    "Kategori-1": {
      keywords: ["no device found", "chromecast", "not found", "device offline", "device not detected", "chromecast offline", "chromecast unreachable"],
      device: "chromecast",
      priority: 1,
    },
    "Kategori-2": { keywords: ["weak", "signal", "no signal", "iptv", "tv offline", "no signal detected", "connection timeout"], device: "iptv", priority: 2 },
    "Kategori-3": { keywords: ["unplug", "lan", "cable", "connection", "lan in", "lan out", "lan cable disconnected", "possible lan cable", "device not responding"], device: "iptv", priority: 3 },
    "Kategori-4": { keywords: ["setup", "ios", "iphone", "google home", "local network"], device: "chromecast", priority: 2 },
    "Kategori-5": { keywords: ["error playing", "playing", "stream", "video", "stream issue"], device: "channel", priority: 1 },
    "Kategori-6": { keywords: ["player error", "player_error", "hbrowser", "widget"], device: "channel", priority: 3 },
    "Kategori-7": { keywords: ["connection failure", "connection_failure", "ip conflict", "network", "multicast stream unavailable", "stream timeout", "network issue"], device: "channel", priority: 2 },
    "Kategori-8": { keywords: ["reset", "configuration", "restart", "power"], device: "chromecast", priority: 3 },
    "Kategori-9": { keywords: ["no device logged", "logged", "login", "authentication"], device: "iptv", priority: 2 },
    "Kategori-10": { keywords: ["black screen", "screen", "adaptor", "power"], device: "chromecast", priority: 1 },
    "Kategori-11": { keywords: ["channel not found", "not found", "channel", "missing"], device: "channel", priority: 1 },
    "Kategori-12": { keywords: ["network connection", "connection failed", "wifi", "router", "network", "connection refused", "possible wifi", "wifi issue"], device: "chromecast", priority: 2 },
    "Kategori-13": { keywords: ["initialization", "system error", "firmware", "boot"], device: "iptv", priority: 3 },
    "Kategori-14": { keywords: ["logined", "logged in", "authentication", "no device found", "registered"], device: "chromecast", priority: 2 },
  };

  const sourceToDevice = {
    chromecast: "chromecast",
    tv: "iptv",
    channel: "channel",
    system: "system",
  };

  const expectedDevice = sourceToDevice[notification.source] || null;

  const matches = Object.entries(categoryMappings).map(
    ([category, config]) => {
      let score = 0;

      if (!expectedDevice || config.device === expectedDevice) {
        score += 10;
      } else {
        score -= 5;
      }

      const keywordMatches = config.keywords.filter((keyword) =>
        notifText.includes(keyword.toLowerCase())
      );

      score += keywordMatches.length * 5;
      score += 4 - config.priority;

      const hasExactMatch = config.keywords.some((keyword) =>
        notifText.includes(keyword.toLowerCase())
      );
      if (hasExactMatch) score += 3;

      return {
        category,
        score,
        matches: keywordMatches.length,
      };
    }
  );

  const bestMatch = matches
    .filter((match) => match.score > 5)
    .sort((a, b) => b.score - a.score)[0];

  return bestMatch ? bestMatch.category : null;
}

async function recategorizeNewNotifications() {
  console.log('=== Re-categorizing New Notifications ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // Get notifications without proper category (External or null)
    const notifications = await db.collection('notifications').find({
      $or: [
        { errorCategory: { $in: [null, '', 'External'] } },
        { errorCategory: { $exists: false } }
      ]
    }).limit(50).toArray();

    console.log(`Found ${notifications.length} notifications to re-categorize\n`);

    if (notifications.length === 0) {
      console.log('✅ All notifications already categorized!');
      return;
    }

    const categoryCount = {};
    let successCount = 0;

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const progress = ((i + 1) / notifications.length * 100).toFixed(1);

      process.stdout.write(`\rProcessing: ${progress}% (${i + 1}/${notifications.length})`);

      try {
        // Get category
        const category = getSpecificFAQCategory(notification);

        if (category) {
          await db.collection('notifications').updateOne(
            { _id: notification._id },
            {
              $set: {
                errorCategory: category,
                updatedAt: new Date()
              }
            }
          );

          categoryCount[category] = (categoryCount[category] || 0) + 1;
          successCount++;
        }

      } catch (error) {
        console.error(`\nError processing ${notification.notificationId}:`, error.message);
      }
    }

    console.log('\n\n=== Re-categorization Complete ===');
    console.log(`Total processed: ${notifications.length}`);
    console.log(`Successfully categorized: ${successCount}`);
    console.log('\nCategory Distribution:');
    Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
recategorizeNewNotifications()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
