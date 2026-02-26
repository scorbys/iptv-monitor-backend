/**
 * Script untuk test notifications dengan detail error
 * Ini akan membuat sample notifications dengan berbagai error types
 */

const { connectDB } = require('../autofix-db');
const { saveNotificationToDB } = require('../utils/notificationUtil');

async function testDetailedNotifications() {
  console.log('=== Testing Detailed Notifications ===\n');

  try {
    // Test various error scenarios
    const testCases = [
      // TV Errors - Kategori-2 (Weak Signal) & Kategori-3 (Unplug LAN)
      {
        source: 'tv',
        title: 'TV Offline',
        message: 'Room 101 TV is now offline - No signal detected',
        deviceName: 'Room 101',
        roomNo: '101',
        ipAddr: '192.168.1.101',
        error: 'No signal detected',
        expectedCategory: 'Kategori-2'
      },
      {
        source: 'tv',
        title: 'TV Offline',
        message: 'Room 102 TV is now offline - Device not responding - Possible LAN cable disconnected',
        deviceName: 'Room 102',
        roomNo: '102',
        ipAddr: '192.168.1.102',
        error: 'Device not responding - Possible LAN cable disconnected',
        expectedCategory: 'Kategori-3'
      },
      {
        source: 'tv',
        title: 'TV Offline',
        message: 'Room 103 TV connection failed - Connection timeout - Weak or no signal',
        deviceName: 'Room 103',
        roomNo: '103',
        ipAddr: '192.168.1.103',
        error: 'Connection timeout - Weak or no signal',
        expectedCategory: 'Kategori-2'
      },

      // Chromecast Errors - Kategori-1 (No Device Found)
      {
        source: 'chromecast',
        title: 'Chromecast Device Offline',
        message: 'Room 201 TV is offline - No device found - Chromecast offline',
        deviceName: 'Room 201',
        roomNo: '201',
        ipAddr: '192.168.1.201',
        error: 'No device found - Chromecast offline',
        expectedCategory: 'Kategori-1'
      },
      {
        source: 'chromecast',
        title: 'Chromecast Device Offline',
        message: 'Room 202 TV is offline - Device offline - Check WiFi and power connection',
        deviceName: 'Room 202',
        roomNo: '202',
        ipAddr: '192.168.1.202',
        error: 'No device found - Chromecast not responding',
        expectedCategory: 'Kategori-1'
      },
      {
        source: 'chromecast',
        title: 'Chromecast Device Offline',
        message: 'Room 203 TV is offline - Network timeout - Chromecast unreachable',
        deviceName: 'Room 203',
        roomNo: '203',
        ipAddr: '192.168.1.203',
        error: 'Connection timeout - Device not responding',
        expectedCategory: 'Kategori-1'
      },
      {
        source: 'chromecast',
        title: 'Chromecast Device Offline',
        message: 'Room 204 TV is offline - Connection refused - Possible WiFi issue',
        deviceName: 'Room 204',
        roomNo: '204',
        ipAddr: '192.168.1.204',
        error: 'Connection refused - Possible WiFi issue',
        expectedCategory: 'Kategori-12'
      },

      // Channel Errors - Kategori-5 (Error Playing) & Kategori-7 (Connection Failure)
      {
        source: 'channel',
        title: 'Channel Offline',
        message: 'RT Rusia is now offline - Error playing - Stream issue detected',
        deviceName: 'RT Rusia',
        ipAddr: '239.1.1.1',
        error: 'Error playing - Stream issue detected',
        expectedCategory: 'Kategori-5'
      },
      {
        source: 'channel',
        title: 'Channel Offline',
        message: 'CNN Asia is now offline - Connection failure - Multicast stream unavailable',
        deviceName: 'CNN Asia',
        ipAddr: '239.1.1.2',
        error: 'Connection failure - Multicast stream unavailable',
        expectedCategory: 'Kategori-7'
      },
      {
        source: 'channel',
        title: 'Channel Offline',
        message: 'NET HD is now offline - Channel not found',
        deviceName: 'NET HD',
        ipAddr: '239.1.1.3',
        error: 'Channel not found',
        expectedCategory: 'Kategori-11'
      },
      {
        source: 'channel',
        title: 'Channel Offline',
        message: 'Kompas TV is now offline - Stream timeout - Network issue detected',
        deviceName: 'Kompas TV',
        ipAddr: '239.1.1.4',
        error: 'Stream timeout - Network issue detected',
        expectedCategory: 'Kategori-7'
      },
    ];

    console.log(`Creating ${testCases.length} test notifications...\n`);

    const results = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const progress = ((i + 1) / testCases.length * 100).toFixed(1);

      process.stdout.write(`\rProgress: ${progress}% (${i + 1}/${testCases.length})`);

      try {
        const result = await saveNotificationToDB(testCase);

        if (result.success) {
          results.push({
            ...testCase,
            notificationId: result.notificationId,
            status: 'created'
          });
        } else {
          results.push({
            ...testCase,
            status: 'failed',
            error: result.error
          });
        }

        // Small delay to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        results.push({
          ...testCase,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log('\n\n=== Test Results ===\n');

    const created = results.filter(r => r.status === 'created');
    const failed = results.filter(r => r.status !== 'created');

    console.log(`✅ Created: ${created.length}`);
    console.log(`❌ Failed: ${failed.length}\n`);

    if (created.length > 0) {
      console.log('Created Notifications:');
      created.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.notificationId}`);
        console.log(`     Source: ${r.source} | Expected: ${r.expectedCategory}`);
        console.log(`     Message: ${r.message.substring(0, 60)}...`);
        console.log();
      });
    }

    if (failed.length > 0) {
      console.log('Failed Notifications:');
      failed.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.source} - ${r.error || 'Unknown error'}`);
      });
    }

    console.log('=== Test Complete ===\n');
    console.log('Next steps:');
    console.log('1. Run: node backend/scripts/categorizeNotificationsClientSide.js');
    console.log('2. Check NotifPage to see the new categories');
    console.log('3. Verify ML Dashboard shows updated stats');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testDetailedNotifications()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
