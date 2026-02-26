/**
 * Simulate frontend fetching behavior
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Simulating Frontend Fetching Behavior ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Simulate frontend fetch with limit=100
    const limit = 100;
    const notifications = await db.collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    console.log(`1. Frontend fetches with limit=${limit}:`);
    console.log(`   - Notifications returned: ${notifications.length}`);

    // Check if frontend makes multiple requests
    console.log(`\n2. Pagination analysis:`);
    console.log(`   - If frontend only makes 1 request with limit=100, it will only see 100 notifications`);
    console.log(`   - To see all 999, frontend needs to make multiple requests or increase limit`);

    // Check NotifPage.tsx fetching logic
    console.log(`\n3. Expected behavior:`);
    console.log(`   - Database has 999 notifications`);
    console.log(`   - Frontend fetches with limit=100 → gets 100 notifications`);
    console.log(`   - Frontend displays: 100 (or fewer if filtered)`);
    console.log(`   - BUT user sees 782 → this suggests frontend IS fetching multiple pages`);

    console.log(`\n4. Possible explanations for seeing 782:`);
    console.log(`   a. Frontend fetches multiple pages but stops before getting all 999`);
    console.log(`   b. Some notifications are filtered out after fetching`);
    console.log(`   c. Deduplication logic removes some notifications`);
    console.log(`   d. API has additional filtering we haven't identified`);

    // Let's check if there's a pattern in the missing 217 notifications (999 - 782 = 217)
    console.log(`\n5. Missing notifications analysis:`);
    console.log(`   - Total: 999`);
    console.log(`   - Shown: 782`);
    console.log(`   - Missing: 217`);
    console.log(`   - This is approximately ${Math.round(217/999*100)}% of total`);

    // Check if there's a date cutoff
    const allNotifs = await db.collection('notifications')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    if (allNotifs.length > 0) {
      const oldestShown = allNotifs[781]; // 782nd notification (0-indexed)
      const newestNotShown = allNotifs[782]; // 783rd notification

      if (oldestShown && newestNotShown) {
        console.log(`\n6. Cutoff point analysis:`);
        console.log(`   - 782nd notification (oldest shown):`);
        console.log(`     ID: ${oldestShown.notificationId}`);
        console.log(`     Created: ${oldestShown.createdAt}`);
        console.log(`   - 783rd notification (newest NOT shown):`);
        console.log(`     ID: ${newestNotShown.notificationId}`);
        console.log(`     Created: ${newestNotShown.createdAt}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
