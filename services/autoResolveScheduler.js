/**
 * Auto-resolve scheduler
 * Automatically resolves notifications after a certain time from assignment
 * Runs every 30 seconds to check for notifications that should be resolved
 */

const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');
const { updateStaffStatsOnResolution } = require('../utils/notificationUtil');
const { evaluateAndPerformHandoff } = require('../utils/staffHandoffUtil');

// Configuration: How long to wait before auto-resolving (in seconds)
const AUTO_RESOLVE_TIME = {
  min: 10,   // Minimum: 10 seconds
  max: 15    // Maximum: 15 seconds (small variation for realism)
};

async function checkAndAutoResolve() {
  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    const now = new Date();
    console.log(`\n[${now.toLocaleTimeString()}] === Auto-Resolve Check ===`);

    // Find notifications that are pending/investigating and have handlingStartTime
    const notificationsToResolve = await db.collection('notifications').find({
      reportStatus: { $in: ['pending', 'investigating'] },
      assignedStaffId: { $exists: true, $ne: null },
      handlingStartTime: { $exists: true }
    }).toArray();

    if (notificationsToResolve.length === 0) {
      console.log('No notifications to check');
      return;
    }

    console.log(`Found ${notificationsToResolve.length} notifications to check`);

    let resolvedCount = 0;

    for (const notification of notificationsToResolve) {
      const handlingStartTime = new Date(notification.handlingStartTime);
      const elapsedSeconds = Math.floor((now - handlingStartTime) / 1000);

      // Random resolve time between min and max (simulating real work)
      // Use the notification ID to make it deterministic but varied
      const idHash = notification.notificationId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const resolveTimeSeconds = AUTO_RESOLVE_TIME.min + (idHash % (AUTO_RESOLVE_TIME.max - AUTO_RESOLVE_TIME.min));

      if (elapsedSeconds >= resolveTimeSeconds) {
        console.log(`\n✅ Auto-resolving: ${notification.notificationId}`);
        console.log(`   Assigned: ${handlingStartTime.toLocaleTimeString()}`);
        console.log(`   Elapsed: ${elapsedSeconds}s (target: ${resolveTimeSeconds}s)`);

        // ===== DYNAMIC HANDOFF SYSTEM =====
        // Evaluate if we should handoff to a different staff member
        let handoffResult = null;
        if (notification.assignedStaffId) {
          handoffResult = await evaluateAndPerformHandoff(
            notification.notificationId,
            notification.assignedStaffId
          );
        }

        // Get assigned staff details for population
        let handledByStaff = null;
        let handledByStaffId = null;

        if (notification.assignedStaffId) {
          try {
            // If handoff occurred, use the new handling staff
            if (handoffResult && handoffResult.handoffOccurred) {
              handledByStaff = handoffResult.handledByStaff;
              handledByStaffId = handledByStaff.id;
              console.log(`   🔄 STAFF HANDOFF: Using ${handledByStaff.name} as handledByStaff`);
            } else {
              // No handoff, use assigned staff as handler
              const assignedStaffDoc = await db.collection('staff').findOne({
                _id: typeof notification.assignedStaffId === 'string'
                  ? new ObjectId(notification.assignedStaffId)
                  : notification.assignedStaffId
              });

              if (assignedStaffDoc) {
                handledByStaff = {
                  id: assignedStaffDoc._id.toString(),
                  name: assignedStaffDoc.name,
                  email: assignedStaffDoc.email,
                  department: assignedStaffDoc.department,
                  position: assignedStaffDoc.position
                };
                handledByStaffId = notification.assignedStaffId;
                console.log(`   ✅ NO HANDOFF: ${handledByStaff.name} handles resolution`);
              }
            }
          } catch (error) {
            console.warn(`   ⚠ Could not find staff for assignedStaffId: ${notification.assignedStaffId}`);
          }
        }

        // Update notification to resolved
        const updateData = {
          reportStatus: 'resolved',
          currentStatus: 'online', // Device recovered
          handlingEndTime: now,
          resolvedReason: `Auto-resolved after ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
          updatedAt: now
        };

        // Set handledByStaffId and handledByStaff based on handoff decision
        if (handledByStaffId) {
          updateData.handledByStaffId = handledByStaffId;
        }

        // Populate handledByStaff object
        if (handledByStaff) {
          updateData.handledByStaff = handledByStaff;
        }

        await db.collection('notifications').updateOne(
          { notificationId: notification.notificationId },
          {
            $set: updateData,
            $push: {
              notes: {
                note: `Issue automatically resolved - Device is now online`,
                addedBy: notification.assignedStaffId,
                addedAt: now
              }
            }
          }
        );

        // Update existing auto-fix log entry or create new one if it doesn't exist
        const existingAutoFixLog = await db.collection('auto_fix_logs').findOne({
          notificationId: notification.notificationId
        });

        if (existingAutoFixLog) {
          // Update existing log to success
          await db.collection('auto_fix_logs').updateOne(
            { notificationId: notification.notificationId },
            {
              $set: {
                status: 'success',
                action: 'auto-resolve',
                description: `Automatically resolved ${notification.errorCategory || 'issue'} after ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
                updatedAt: now,
                executedAt: now,
                'result.action': 'auto_resolved',
                'result.message': 'Notification automatically resolved by scheduler',
                'result.details': `Resolved after ${elapsedSeconds} seconds from assignment`
              }
            }
          );
          console.log(`   ✅ Updated auto-fix log to success`);
        } else {
          // Create new auto-fix log entry if none exists
          await db.collection('auto_fix_logs').insertOne({
            fixId: `fix-auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notificationId: notification.notificationId,
            category: notification.errorCategory || 'Auto-Resolved',
            action: 'auto-resolve',
            description: `Automatically resolved ${notification.errorCategory || 'issue'} after ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
            status: 'success',
            confidence: 0.9,
            createdAt: notification.createdAt,
            updatedAt: now,
            executedAt: now,
            result: {
              action: 'auto_resolved',
              message: 'Notification automatically resolved by scheduler',
              details: `Resolved after ${elapsedSeconds} seconds from assignment`
            }
          });
          console.log(`   ✅ Created new auto-fix log entry`);
        }

        // Update staff statistics
        // If handoff occurred, update stats for handledByStaff, otherwise assignedStaff
        if (handoffResult && handoffResult.handoffOccurred) {
          // Update stats for the staff who actually handled the resolution
          const notificationForStats = {
            ...notification,
            assignedStaffId: handledByStaffId // Temporarily override for stats update
          };
          await updateStaffStatsOnResolution(notificationForStats);
          console.log(`   📊 Stats updated for ${handledByStaff.name} (handled resolution)`);
        } else {
          // No handoff, update stats for assigned staff
          await updateStaffStatsOnResolution(notification);
          console.log(`   📊 Stats updated for assigned staff`);
        }

        resolvedCount++;

        console.log(`   ✅ Resolved successfully`);
      } else {
        console.log(`⏳ ${notification.notificationId}: ${elapsedSeconds}s / ${resolveTimeSeconds}s (waiting)`);
      }
    }

    if (resolvedCount > 0) {
      console.log(`\n✅ Auto-resolved ${resolvedCount} notification(s)`);
    }

  } catch (error) {
    console.error('[AutoResolve] Error:', error);
  }
}

// Run immediately on start
checkAndAutoResolve();

// Then run every 2 minutes
const interval = 5 * 60 * 1000; // 5 menit, dari 2 menit
setInterval(() => {
  checkAndAutoResolve();
}, interval);

console.log('🚀 Auto-resolve scheduler started!');
console.log(`   Checking every ${interval / 1000} seconds`);
console.log(`   Auto-resolve time: ${AUTO_RESOLVE_TIME.min}-${AUTO_RESOLVE_TIME.max} seconds after assignment`);

// Keep process running
process.on('SIGINT', () => {
  console.log('\n\n🛑 Auto-resolve scheduler stopped');
  process.exit(0);
});

// Export for use in server.js
module.exports = {
  checkAndAutoResolve
};
