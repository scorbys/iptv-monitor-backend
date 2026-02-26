/**
 * Test real-time notification flow with auto-resolve
 * Creates notifications and watches them get assigned and auto-resolved
 */

const { connectDB } = require('../autofix-db');
const { saveNotificationToDB } = require('../utils/notificationUtil');

async function testRealtimeFlow() {
  console.log('=== Testing Real-Time Notification Flow ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Create 3 test notifications with different devices
    const testNotifications = [
      {
        source: 'tv',
        title: 'Test TV 1 Offline',
        message: 'Test TV 1 device is offline',
        deviceName: 'Test-TV-Realtime-1',
        ipAddr: '192.168.1.101',
        error: 'Connection timeout',
        currentStatus: 'offline',
      },
      {
        source: 'chromecast',
        title: 'Test Chromecast 1 Offline',
        message: 'Test Chromecast 1 device is offline',
        deviceName: 'Test-Chromecast-Realtime-1',
        ipAddr: '192.168.1.102',
        error: 'No signal',
        currentStatus: 'offline',
      },
      {
        source: 'channel',
        title: 'Test Channel 1 Offline',
        message: 'Test Channel 1 is offline',
        deviceName: 'Test-Channel-Realtime-1',
        ipAddr: '239.0.0.1',
        error: 'Stream timeout',
        currentStatus: 'offline',
      }
    ];

    console.log('Creating 3 test notifications...\n');

    const createdNotifications = [];

    for (let i = 0; i < testNotifications.length; i++) {
      const notifData = testNotifications[i];

      console.log(`\n${i + 1}. Creating ${notifData.deviceName}...`);

      const result = await saveNotificationToDB({
        ...notifData,
        isStartup: false,
      });

      if (result.success) {
        console.log(`   ✅ Created: ${result.notificationId}`);
        createdNotifications.push(result.notificationId);
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
      }

      // Wait 2 seconds between each
      if (i < testNotifications.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n\n✅ Created ${createdNotifications.length} test notifications`);
    console.log('\n⏳ Watching for assignment and auto-resolution...');

    // Monitor notifications for 3 minutes
    const monitorDuration = 180; // 3 minutes
    const checkInterval = 10; // Check every 10 seconds

    for (let elapsed = 0; elapsed < monitorDuration; elapsed += checkInterval) {
      await new Promise(resolve => setTimeout(resolve, checkInterval * 1000));

      console.log(`\n\n[${elapsed}s] Status Check:`);
      console.log('='.repeat(60));

      for (let i = 0; i < createdNotifications.length; i++) {
        const notificationId = createdNotifications[i];
        const notification = await db.collection('notifications').findOne({
          notificationId: notificationId
        });

        if (notification) {
          const staffName = notification.assignedStaffId
            ? (await db.collection('staff').findOne({ _id: notification.assignedStaffId }))?.name || 'Unknown'
            : 'Unassigned';

          const timeSinceAssignment = notification.handlingStartTime
            ? `${Math.floor((new Date() - new Date(notification.handlingStartTime)) / 1000)}s ago`
            : 'N/A';

          console.log(`\n${i + 1}. ${notification.deviceName}`);
          console.log(`   Status: ${notification.reportStatus.toUpperCase()}`);
          console.log(`   Assigned to: ${staffName}`);
          console.log(`   Assignment time: ${timeSinceAssignment}`);
          console.log(`   Error Category: ${notification.errorCategory || 'Pending ML...'}`);

          if (notification.reportStatus === 'resolved') {
            const resolutionTime = notification.handlingEndTime && notification.handlingStartTime
              ? `${Math.floor((new Date(notification.handlingEndTime) - new Date(notification.handlingStartTime)) / 1000)}s`
              : 'N/A';
            console.log(`   ✅ RESOLVED in ${resolutionTime}`);
          }
        }
      }

      // Check if all are resolved
      const allResolved = await Promise.all(
        createdNotifications.map(async (id) => {
          const notif = await db.collection('notifications').findOne({ notificationId: id });
          return notif?.reportStatus === 'resolved';
        })
      );

      if (allResolved.every(resolved => resolved)) {
        console.log('\n\n✅ All notifications have been resolved!');
        break;
      }
    }

    // Final summary
    console.log('\n\n📊 Final Summary:');
    console.log('='.repeat(60));

    for (let i = 0; i < createdNotifications.length; i++) {
      const notificationId = createdNotifications[i];
      const notification = await db.collection('notifications').findOne({
        notificationId: notificationId
      });

      const staff = notification.assignedStaffId
        ? await db.collection('staff').findOne({ _id: notification.assignedStaffId })
        : null;

      console.log(`\n${i + 1}. ${notification.deviceName}`);
      console.log(`   Created: ${notification.createdAt}`);
      console.log(`   Assigned: ${notification.handlingStartTime ? 'Yes' : 'No'}`);
      console.log(`   Staff: ${staff?.name || 'None'}`);
      console.log(`   Status: ${notification.reportStatus}`);
      console.log(`   Resolved: ${notification.resolvedReason || 'N/A'}`);
    }

    // Staff stats after
    console.log('\n\n📋 Updated Staff Statistics:');
    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false }
    }).toArray();

    staff.forEach(member => {
      console.log(`\n${member.name}:`);
      console.log(`  Total Assigned: ${member.stats?.totalAssigned || 0}`);
      console.log(`  Total Resolved: ${member.stats?.totalResolved || 0}`);
      console.log(`  Success Rate: ${(member.stats?.successRate || 0).toFixed(1)}%`);
    });

    console.log('\n\n✅ Test completed!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

testRealtimeFlow();
