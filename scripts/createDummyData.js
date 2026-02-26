/**
 * Create dummy resolved notifications and test data
 */

const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

(async () => {
  console.log('=== Creating Dummy Resolved Notifications ===\n');

  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get staff IDs
    const staff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    if (staff.length === 0) {
      console.log('❌ No staff found. Please create staff first.');
      process.exit(1);
    }

    console.log(`Found ${staff.length} staff members\n`);

    // Categories for variety
    const categories = [
      'Katagori-1', 'Katagori-2', 'Katagori-3', 'Katagori-4', 'Katagori-5',
      'Katagori-6', 'Katagori-7', 'Katagori-8', 'Katagori-9', 'Katagori-10',
      'Katagori-11', 'Katagori-12', 'Katagori-13', 'External'
    ];

    const sources = ['chromecast', 'tv', 'channel'];
    const statuses = ['resolved', 'resolved', 'resolved', 'pending', 'investigating'];

    let createdCount = 0;
    let resolvedCount = 0;

    // Create 50 dummy notifications with various statuses
    for (let i = 0; i < 50; i++) {
      const now = new Date();
      const timeOffset = Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000); // Random time within last 7 days
      const createdAt = new Date(now.getTime() - timeOffset);

      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const assignedStaff = staff[Math.floor(Math.random() * staff.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];

      // Calculate resolution time for resolved notifications
      let handlingStartTime = createdAt;
      let handlingEndTime = null;
      let resolvedReason = null;

      if (status === 'resolved') {
        const resolutionTime = Math.floor(Math.random() * 120) + 5; // 5-125 minutes
        handlingStartTime = new Date(createdAt.getTime() + Math.floor(Math.random() * 10) * 60000); // 0-10 mins after creation
        handlingEndTime = new Date(handlingStartTime.getTime() + resolutionTime * 60000);
        resolvedReason = `Issue resolved - ${category} fixed by ${assignedStaff.name}`;

        // Update staff stats
        await db.collection('staff').updateOne(
          { _id: assignedStaff._id },
          {
            $inc: {
              'stats.totalAssigned': 1,
              'stats.totalResolved': 1
            },
            $set: {
              'stats.successRate': 100, // Will be recalculated
              updatedAt: new Date()
            }
          }
        );
        resolvedCount++;
      } else {
        // Just increment assigned for non-resolved
        await db.collection('staff').updateOne(
          { _id: assignedStaff._id },
          {
            $inc: {
              'stats.totalAssigned': 1
            },
            $set: {
              updatedAt: new Date()
            }
          }
        );
      }

      const notification = {
        notificationId: `${source}-${now.getTime() - i}-${Math.random().toString(36).substr(2, 9)}`,
        title: `${source.charAt(0).toUpperCase() + source.slice(1)} ${status === 'resolved' ? 'Issue' : 'Offline'}`,
        message: `${source.charAt(0).toUpperCase() + source.slice(1)} device ${status === 'resolved' ? 'issue' : 'is offline'} - ${category}`,
        source: source,
        type: status === 'resolved' ? 'success' : 'offline',
        deviceName: `Device-${source}-${i + 1}`,
        roomNo: `Room-${Math.floor(Math.random() * 100) + 1}`,
        ipAddr: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
        error: `Error related to ${category}`,
        errorCategory: category,
        currentStatus: status === 'resolved' ? 'online' : 'offline',
        reportStatus: status,
        priority: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
        deviceIdentifier: `device-${source}-${i}`,

        isStartup: false,
        reportedByStaffId: null,
        assignedStaffId: assignedStaff._id.toString(),
        handledByStaffId: status === 'resolved' ? assignedStaff._id.toString() : null,
        handlingStartTime: handlingStartTime,
        handlingEndTime: handlingEndTime,

        resolvedReason: resolvedReason,

        notes: status === 'resolved' ? [
          {
            note: `Issue investigated and resolved`,
            addedBy: assignedStaff._id.toString(),
            addedAt: handlingStartTime
          },
          {
            note: `Verified device is working`,
            addedBy: assignedStaff._id.toString(),
            addedAt: handlingEndTime
          }
        ] : [],

        mlConfidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
        createdAt: createdAt,
        updatedAt: handlingEndTime || new Date()
      };

      await db.collection('notifications').insertOne(notification);
      createdCount++;

      // Create auto-fix log for resolved notifications
      if (status === 'resolved') {
        await db.collection('auto_fix_logs').insertOne({
          fixId: `fix-${Date.now()}-${i}`,
          notificationId: notification.notificationId,
          category: category,
          action: 'auto-resolve',
          description: `Automatically resolved ${category} issue for ${source} device`,
          status: 'success',
          confidence: Math.random() * 0.3 + 0.7,
          createdAt: createdAt,
          updatedAt: handlingEndTime,
          executedAt: handlingEndTime,
          result: {
            action: 'device_status_check',
            message: 'Device recovered successfully',
            details: `Device ${notification.deviceName} is now online`
          }
        });
      }

      if ((i + 1) % 10 === 0) {
        console.log(`Created ${i + 1}/50 notifications...`);
      }
    }

    // Recalculate success rates for all staff
    console.log('\n📊 Recalculating staff statistics...');
    for (const member of staff) {
      const totalAssigned = member.stats?.totalAssigned || 0;
      const totalResolved = member.stats?.totalResolved || 0;

      const successRate = totalAssigned > 0 ? (totalResolved / totalAssigned) * 100 : 0;

      // Calculate average resolution time
      const resolvedNotifs = await db.collection('notifications').countDocuments({
        assignedStaffId: member._id.toString(),
        reportStatus: 'resolved',
        handlingEndTime: { $exists: true }
      });

      let avgResolutionTime = 0;
      if (resolvedNotifs > 0) {
        const pipeline = [
          { $match: { assignedStaffId: member._id.toString(), reportStatus: 'resolved' } },
          {
            $project: {
              resolutionTime: {
                $subtract: ['$handlingEndTime', '$handlingStartTime']
              }
            }
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: '$resolutionTime' }
            }
          }
        ];

        const result = await db.collection('notifications').aggregate(pipeline).toArray();
        if (result.length > 0 && result[0].avgTime) {
          avgResolutionTime = Math.floor(result[0].avgTime / 60000); // Convert ms to minutes
        }
      }

      await db.collection('staff').updateOne(
        { _id: member._id },
        {
          $set: {
            'stats.successRate': successRate,
            'stats.avgResolutionTime': avgResolutionTime,
            updatedAt: new Date()
          }
        }
      );

      console.log(`  ${member.name}: ${successRate.toFixed(1)}% success rate, ${avgResolutionTime}m avg resolution time`);
    }

    console.log(`\n✅ Created ${createdCount} dummy notifications`);
    console.log(`✅ Resolved: ${resolvedCount}`);
    console.log(`✅ Pending/Investigating: ${createdCount - resolvedCount}`);
    console.log(`✅ Created ${resolvedCount} auto-fix logs`);

    // Summary stats
    const totalStats = await db.collection('notifications').aggregate([
      {
        $group: {
          _id: '$reportStatus',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log('\n📋 Notification Summary:');
    totalStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}`);
    });

    console.log('\n✅ Dummy data creation completed!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
