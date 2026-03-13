const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');
const { calculateStaffCreditWeight } = require('./notificationUtil');

/**
 * STAFF HANDOFF SYSTEM
 *
 * This utility implements dynamic staff handoff based on workload and credit system.
 *
 * Logic:
 * 1. Each notification starts with assignedStaff (staff with minimum workload)
 * 2. When auto-resolving, check if assignedStaff is overloaded
 * 3. If overloaded, handoff to a less busy staff as handledByStaff
 * 4. Credit system: Full (1.0), Moderate (0.5), Minimal (0.2)
 *
 * Handoff Triggers:
 * - assignedStaff workload > MAX_WORKLOAD_THRESHOLD
 * - assignedStaff has multiple active assignments
 * - Better staff available (lower workload + acceptable credit)
 */

const HANDOFF_CONFIG = {
  // Maximum active assignments before considering handoff
  MAX_WORKLOAD_THRESHOLD: 3,

  // Minimum credit weight for a staff to handle notifications
  MIN_CREDIT_THRESHOLD: 0.3, // Allow moderate (0.5) and above

  // If assignedStaff workload exceeds this, MUST handoff
  CRITICAL_WORKLOAD_THRESHOLD: 5,

  // Prefer handing off to staff with significantly lower workload
  WORKLOAD_DIFFERENCE_THRESHOLD: 2
};

/**
 * Calculate current workload for a staff member
 * Counts active (pending/investigating) notifications
 */
async function getStaffWorkload(staffId) {
  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    const activeCount = await db.collection('notifications').countDocuments({
      assignedStaffId: staffId,
      reportStatus: { $in: ['pending', 'investigating'] }
    });

    return activeCount;
  } catch (error) {
    console.error(`[Handoff] Error getting workload for staff ${staffId}:`, error);
    return 0;
  }
}

/**
 * Get all available staff with their workloads and credit weights
 */
async function getAvailableStaffWithWorkload() {
  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    const availableStaff = await db.collection('staff').find({
      deletedAt: { $exists: false },
      isActive: { $ne: false }
    }).toArray();

    const staffWithWorkload = await Promise.all(
      availableStaff.map(async (staff) => {
        const workload = await getStaffWorkload(staff._id.toString());
        const creditWeight = calculateStaffCreditWeight(staff);

        return {
          _id: staff._id,
          id: staff._id.toString(),
          name: staff.name,
          email: staff.email,
          department: staff.department,
          position: staff.position,
          currentWorkload: workload,
          creditWeight: creditWeight
        };
      })
    );

    return staffWithWorkload;
  } catch (error) {
    console.error('[Handoff] Error getting available staff:', error);
    return [];
  }
}

/**
 * Find best staff to handle a notification
 * Considers workload, credit weight, and availability
 *
 * Priority:
 * 1. Staff with acceptable credit weight (>= MIN_CREDIT_THRESHOLD)
 * 2. Lowest workload among eligible staff
 * 3. Prefer full credit staff if workloads are similar
 */
async function findBestHandlingStaff(excludeStaffId = null) {
  try {
    const allStaff = await getAvailableStaffWithWorkload();

    // Filter out the excluded staff (the assigned staff)
    const eligibleStaff = excludeStaffId
      ? allStaff.filter(staff => staff.id !== excludeStaffId)
      : allStaff;

    // Filter by minimum credit threshold
    const qualifiedStaff = eligibleStaff.filter(
      staff => staff.creditWeight >= HANDOFF_CONFIG.MIN_CREDIT_THRESHOLD
    );

    if (qualifiedStaff.length === 0) {
      console.log('[Handoff] No qualified staff available for handoff');
      return null;
    }

    // Sort by workload (ascending), then by credit weight (descending)
    qualifiedStaff.sort((a, b) => {
      if (a.currentWorkload !== b.currentWorkload) {
        return a.currentWorkload - b.currentWorkload; // Lower workload first
      }
      return b.creditWeight - a.creditWeight; // Higher credit first
    });

    return qualifiedStaff[0]; // Best staff for handling
  } catch (error) {
    console.error('[Handoff] Error finding best handling staff:', error);
    return null;
  }
}

/**
 * Decide whether to handoff from assignedStaff to a different handledByStaff
 *
 * Handoff Logic:
 * 1. Get current workload of assignedStaff
 * 2. If workload > CRITICAL_WORKLOAD_THRESHOLD: MUST handoff
 * 3. If workload > MAX_WORKLOAD_THRESHOLD: Consider handoff if better staff available
 * 4. Find best available staff (excluding assignedStaff)
 * 5. Handoff if:
 *    - Best staff has significantly lower workload (by WORKLOAD_DIFFERENCE_THRESHOLD)
 *    - OR best staff has better credit weight and similar workload
 *
 * @param {string} assignedStaffId - The currently assigned staff ID
 * @returns {Object} - { shouldHandoff: boolean, reason: string, newStaff: object }
 */
async function shouldHandoffNotification(assignedStaffId) {
  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Get assigned staff details
    const assignedStaff = await db.collection('staff').findOne({
      _id: typeof assignedStaffId === 'string'
        ? new ObjectId(assignedStaffId)
        : assignedStaffId
    });

    if (!assignedStaff) {
      console.log('[Handoff] Assigned staff not found, cannot handoff');
      return { shouldHandoff: false, reason: 'Assigned staff not found' };
    }

    // Get current workload of assigned staff
    const assignedWorkload = await getStaffWorkload(assignedStaff._id.toString());
    const assignedCredit = calculateStaffCreditWeight(assignedStaff);

    console.log(`[Handoff] Evaluating handoff for ${assignedStaff.name}:`);
    console.log(`   - Current workload: ${assignedWorkload}`);
    console.log(`   - Credit weight: ${assignedCredit}`);

    // Check critical threshold - MUST handoff
    if (assignedWorkload > HANDOFF_CONFIG.CRITICAL_WORKLOAD_THRESHOLD) {
      const newStaff = await findBestHandlingStaff(assignedStaff._id.toString());

      if (newStaff) {
        console.log(`[Handoff] ✅ CRITICAL: Workload ${assignedWorkload} > ${HANDOFF_CONFIG.CRITICAL_WORKLOAD_THRESHOLD}`);
        return {
          shouldHandoff: true,
          reason: `Critical workload (${assignedWorkload} assignments) exceeds threshold`,
          assignedStaff: assignedStaff,
          newHandlingStaff: newStaff,
          handoffType: 'critical'
        };
      }

      console.log('[Handoff] ⚠️ Critical workload but no alternative staff available');
      return {
        shouldHandoff: false,
        reason: 'Critical workload but no alternative staff available'
      };
    }

    // Check max workload threshold - CONSIDER handoff
    if (assignedWorkload > HANDOFF_CONFIG.MAX_WORKLOAD_THRESHOLD) {
      const newStaff = await findBestHandlingStaff(assignedStaff._id.toString());

      if (newStaff) {
        const workloadDiff = assignedWorkload - newStaff.currentWorkload;

        // Handoff if new staff has significantly lower workload
        if (workloadDiff >= HANDOFF_CONFIG.WORKLOAD_DIFFERENCE_THRESHOLD) {
          console.log(`[Handoff] ✅ Workload ${assignedWorkload} > ${HANDOFF_CONFIG.MAX_WORKLOAD_THRESHOLD} and better staff available`);
          return {
            shouldHandoff: true,
            reason: `Workload ${assignedWorkload} exceeds threshold and ${newStaff.name} has ${newStaff.currentWorkload} assignments`,
            assignedStaff: assignedStaff,
            newHandlingStaff: newStaff,
            handoffType: 'workload_balance'
          };
        }

        // Or if new staff has better credit and similar or lower workload
        if (newStaff.creditWeight > assignedCredit &&
            newStaff.currentWorkload <= assignedWorkload) {
          console.log(`[Handoff] ✅ ${newStaff.name} has better credit (${newStaff.creditWeight} vs ${assignedCredit})`);
          return {
            shouldHandoff: true,
            reason: `${newStaff.name} has better credit rating (${newStaff.creditWeight} vs ${assignedCredit})`,
            assignedStaff: assignedStaff,
            newHandlingStaff: newStaff,
            handoffType: 'credit_upgrade'
          };
        }

        console.log(`[Handoff] ⏳ Workload elevated but ${newStaff.name} not significantly better (${workloadDiff} difference)`);
      } else {
        console.log('[Handoff] ⏳ Workload elevated but no alternative staff available');
      }

      return {
        shouldHandoff: false,
        reason: 'Workload elevated but no better alternative available'
      };
    }

    // Workload is acceptable, no handoff needed
    console.log(`[Handoff] ✅ Workload ${assignedWorkload} is acceptable, no handoff needed`);
    return {
      shouldHandoff: false,
      reason: `Workload ${assignedWorkload} is within acceptable range`
    };

  } catch (error) {
    console.error('[Handoff] Error evaluating handoff decision:', error);
    return { shouldHandoff: false, reason: 'Error evaluating handoff' };
  }
}

/**
 * Perform handoff - update notification with new handledByStaff
 */
async function performHandoff(notificationId, assignedStaffId, newHandlingStaff) {
  try {
    const connection = await connectDB();
    const db = connection.client.db('iptv');

    // Prepare handledByStaff object
    const handledByStaff = {
      id: newHandlingStaff.id,
      name: newHandlingStaff.name,
      email: newHandlingStaff.email,
      department: newHandlingStaff.department,
      position: newHandlingStaff.position
    };

    // Update notification
    await db.collection('notifications').updateOne(
      { notificationId: notificationId },
      {
        $set: {
          handledByStaffId: newHandlingStaff.id,
          handledByStaff: handledByStaff,
          handoffReason: `Workload balancing: ${newHandlingStaff.name} (${newHandlingStaff.creditWeight} credit) took over from assigned staff`,
          handoffTimestamp: new Date(),
          updatedAt: new Date()
        },
        $push: {
          notes: {
            note: `🔄 Staff handoff: ${newHandlingStaff.name} (${newHandlingStaff.department}) took over this task for workload balancing`,
            addedBy: newHandlingStaff.id,
            addedAt: new Date()
          }
        }
      }
    );

    console.log(`[Handoff] ✅ Handoff complete: ${notificationId}`);
    console.log(`   - Assigned Staff: (unchanged)`);
    console.log(`   - Handled By Staff: ${newHandlingStaff.name} (${newHandlingStaff.department})`);
    console.log(`   - Credit: ${newHandlingStaff.creditWeight}`);

    return {
      success: true,
      handledByStaff: handledByStaff
    };

  } catch (error) {
    console.error('[Handoff] Error performing handoff:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function: Evaluate and perform handoff for a notification
 * Call this during auto-resolve process
 *
 * @param {string} notificationId - Notification ID
 * @param {string} assignedStaffId - Currently assigned staff ID
 * @returns {Object} - Handoff result
 */
async function evaluateAndPerformHandoff(notificationId, assignedStaffId) {
  try {
    console.log(`\n[Handoff] ==================================================`);
    console.log(`[Handoff] Evaluating handoff for: ${notificationId}`);
    console.log(`[Handoff] Assigned Staff ID: ${assignedStaffId}`);

    // Evaluate if handoff is needed
    const handoffDecision = await shouldHandoffNotification(assignedStaffId);

    if (handoffDecision.shouldHandoff && handoffDecision.newHandlingStaff) {
      console.log(`[Handoff] 🔄 DECISION: HANDOFF REQUIRED`);
      console.log(`[Handoff] Reason: ${handoffDecision.reason}`);
      console.log(`[Handoff] Type: ${handoffDecision.handoffType}`);

      // Perform the handoff
      const result = await performHandoff(
        notificationId,
        assignedStaffId,
        handoffDecision.newHandlingStaff
      );

      if (result.success) {
        console.log(`[Handoff] ==================================================`);
        return {
          handoffOccurred: true,
          assignedStaff: handoffDecision.assignedStaff,
          handledByStaff: result.handledByStaff,
          reason: handoffDecision.reason,
          handoffType: handoffDecision.handoffType
        };
      }
    } else {
      console.log(`[Handoff] ✅ DECISION: NO HANDOFF NEEDED`);
      console.log(`[Handoff] Reason: ${handoffDecision.reason}`);
      console.log(`[Handoff] ==================================================`);
      return {
        handoffOccurred: false,
        reason: handoffDecision.reason
      };
    }

  } catch (error) {
    console.error('[Handoff] Error in evaluateAndPerformHandoff:', error);
    return {
      handoffOccurred: false,
      error: error.message
    };
  }
}

/**
 * Get statistics about staff workload distribution
 * Useful for monitoring and debugging
 */
async function getStaffWorkloadStats() {
  try {
    const allStaff = await getAvailableStaffWithWorkload();

    console.log('\n[Handoff] === Staff Workload Statistics ===');
    allStaff.forEach(staff => {
      console.log(`   ${staff.name} (${staff.department}):`);
      console.log(`     - Workload: ${staff.currentWorkload} active assignments`);
      console.log(`     - Credit: ${staff.creditWeight}`);
    });
    console.log('[Handoff] =================================\n');

    return {
      success: true,
      totalStaff: allStaff.length,
      staff: allStaff.sort((a, b) => b.currentWorkload - a.currentWorkload)
    };
  } catch (error) {
    console.error('[Handoff] Error getting workload stats:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  HANDOFF_CONFIG,
  getStaffWorkload,
  getAvailableStaffWithWorkload,
  findBestHandlingStaff,
  shouldHandoffNotification,
  performHandoff,
  evaluateAndPerformHandoff,
  getStaffWorkloadStats
};
