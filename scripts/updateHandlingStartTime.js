/**
 * Update handlingStartTime for existing assigned notifications
 * This ensures avgResolutionTime is calculated correctly
 */

const { connectDB } = require('../autofix-db');

(async () => {
  console.log('=== Updating Handling Start Times ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Find notifications with assigned staff but no handlingStartTime
    const notifications = await db.collection('notifications').find({
      assignedStaffId: { $exists: true, $ne: null },
      handlingStartTime: { $exists: false }
    }).limit(100).toArray();

    console.log(`Found ${notifications.length} notifications without handlingStartTime\n`);

    if (notifications.length === 0) {
      console.log('✅ All notifications already have handlingStartTime!');
      process.exit(0);
    }

    let updatedCount = 0;

    for (const notification of notifications) {
      // Set handlingStartTime to createdAt (approximate)
      await db.collection('notifications').updateOne(
        { notificationId: notification.notificationId },
        {
          $set: {
            handlingStartTime: notification.createdAt,
            updatedAt: new Date()
          }
        }
      );

      updatedCount++;
    }

    console.log(`✅ Updated ${updatedCount} notifications with handlingStartTime`);
    console.log('\nThis will ensure avgResolutionTime is calculated correctly for existing notifications.');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
