/**
 * Script untuk categorize existing notifications menggunakan client-side logic
 * Sebagai sementara sampai ML model di-retrain dengan spelling yang benar
 */

const { connectDB } = require('../autofix-db');

// Client-side categorization logic (sama dengan NotifPage)
function getSpecificFAQCategory(notification) {
  const notifText = [
    notification.title?.toLowerCase() || "",
    notification.message?.toLowerCase() || "",
    notification.error?.toLowerCase() || "",
    notification.deviceName?.toLowerCase() || "",
    notification.errorCategory?.toLowerCase() || "",
  ].join(" ");

  const normalizedNotifText = notifText
    .replace(/katagori-/gi, 'kategori-')
    .replace(/kategori-/gi, 'kategori-');

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
        normalizedNotifText.includes(keyword.toLowerCase())
      );

      score += keywordMatches.length * 5;
      score += 4 - config.priority;

      const hasExactMatch = config.keywords.some((keyword) =>
        normalizedNotifText.includes(keyword.toLowerCase())
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

// Get suggested solutions for category
function getSuggestedSolutionsForCategory(category) {
  const solutionsMap = {
    'Kategori-1': [
      'Deactive White list profile',
      'Restart Chromecast & WIFI',
      'Radisson Guest Must Be Login',
      'Forget WIFI Radisson Guest',
      'Logout WIFI (log-out.me)'
    ],
    'Kategori-2': [
      'Periksa koneksi LAN pada TV',
      'Pastikan sumber HDMI diatur ke HDMI-1',
      'Restart perangkat IPTV',
      'Periksa indikator LED pada box IPTV'
    ],
    'Kategori-3': [
      'Periksa koneksi LAN (pastikan terpasang di LAN IN)',
      'Posisikan kabel LAN dengan benar',
      'Pastikan tidak terpasang di LAN OUT',
      'Test koneksi dengan kabel LAN lain'
    ],
    'Kategori-4': [
      'Install Google Home app',
      'Pastikan perangkat dalam satu jaringan WiFi',
      'Allow local network access pada iPhone',
      'Follow setup wizard di aplikasi'
    ],
    'Kategori-5': [
      'Channel issue dari Biznet (Testing VIA VLC)'
    ],
    'Kategori-6': [
      'Hbrowser & Widget Solution incorrect',
      'Channel issue Biznet (Testing VLC)'
    ],
    'Kategori-7': [
      'Reinstall Widget Solution',
      'Reload IGCMP',
      'Confirmed IP conflict, changed IP, issue resolved'
    ],
    'Kategori-8': [
      'Restart Chromecast',
      'Reset Chromecast dibawa ke ruang server pencet tombol power 10 Detik'
    ],
    'Kategori-9': [
      'Pastikan Allow local Network pada Setingan Iphone',
      'Check VPN and Cast settings'
    ],
    'Kategori-10': [
      'Chromecast Power Adaptor Rusak',
      'Check Adaptor Chromecast'
    ],
    'Kategori-11': [
      'LAN Out Terpasang bukan LAN In'
    ],
    'Kategori-12': [
      'Check WiFi connection strength',
      'Restart Chromecast device',
      'Verify router settings',
      'Check for IP conflicts'
    ],
    'Kategori-13': [
      'Restart IPTV set-top box',
      'Check system firmware version',
      'Reinitialize system settings',
      'Contact technical support if persists'
    ],
    'Kategori-14': [
      'Verify user authentication status',
      'Check device registration',
      'Re-login to Google account',
      'Clear cast cache and retry'
    ]
  };

  return solutionsMap[category] || [];
}

// Get priority from category
function getPriorityFromCategory(category) {
  const priorityMap = {
    'Kategori-1': 'high',
    'Kategori-2': 'high',
    'Kategori-3': 'high',
    'Kategori-4': 'medium',
    'Kategori-5': 'medium',
    'Kategori-6': 'high',
    'Kategori-7': 'high',
    'Kategori-8': 'low',
    'Kategori-9': 'high',
    'Kategori-10': 'high',
    'Kategori-11': 'medium',
    'Kategori-12': 'high',
    'Kategori-13': 'high',
    'Kategori-14': 'medium',
  };

  return priorityMap[category] || 'medium';
}

async function categorizeNotifications() {
  console.log('=== Categorizing Existing Notifications (Client-Side) ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // Get notifications without errorCategory
    const notifications = await db.collection('notifications').find({
      errorCategory: { $in: [null, '', 'Katagori-1'] }
    }).limit(100).toArray();

    console.log(`Found ${notifications.length} notifications to categorize\n`);

    if (notifications.length === 0) {
      console.log('✅ All notifications already categorized!');
      return;
    }

    const categoryCount = {};
    let successCount = 0;
    let uncategorizedCount = 0;

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const progress = ((i + 1) / notifications.length * 100).toFixed(1);

      process.stdout.write(`\rProcessing: ${progress}% (${i + 1}/${notifications.length})`);

      try {
        // Get category
        const category = getSpecificFAQCategory(notification);

        if (category) {
          const solutions = getSuggestedSolutionsForCategory(category);
          const priority = getPriorityFromCategory(category);

          // Update notification
          await db.collection('notifications').updateOne(
            { _id: notification._id },
            {
              $set: {
                errorCategory: category,
                suggestedSolutions: solutions,
                priority: priority,
                updatedAt: new Date()
              }
            }
          );

          categoryCount[category] = (categoryCount[category] || 0) + 1;
          successCount++;

          // Create auto-fix log
          await db.collection('auto_fix_logs').insertOne({
            fixId: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notificationId: notification.notificationId,
            mlPredictionId: null,
            fixType: 'automatic',
            category: category,
            action: 'analyze',
            description: `Auto-fix triggered for ${notification.source} offline: ${notification.deviceName || notification.roomNo}`,
            status: 'pending',
            confidence: null,
            createdBy: 'system',
            triggeredBy: null,
            approvedBy: null,
            executedBy: null,
            createdAt: new Date(),
            executedAt: null,
            completedAt: null
          });

        } else {
          uncategorizedCount++;
        }

      } catch (error) {
        console.error(`\nError processing ${notification.notificationId}:`, error.message);
      }
    }

    console.log('\n\n=== Categorization Complete ===');
    console.log(`Total processed: ${notifications.length}`);
    console.log(`Successfully categorized: ${successCount}`);
    console.log(`Uncategorized: ${uncategorizedCount}`);
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
categorizeNotifications()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
