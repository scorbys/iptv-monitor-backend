const {
  saveNotification,
  getNotificationById,
  saveMLPrediction,
  getLatestMLPrediction,
  createAutoFixLog,
  executeAutoFix,
  completeAutoFix,
  retryAutoFix,
  cancelAutoFix,
  getAutoFixLogsByNotification,
  getPendingAutoFixes,
  getAutoFixStats
} = require('../autofix-db');

const {
  getActiveStaffForAssignment,
  updateStaffStats
} = require('../staff-db');

/**
 * Auto-Fix Service for ML-based notification remediation
 * Integrates with ML model to predict and automatically fix issues
 */

// Fix action mappings based on ML predicted categories
const FIX_ACTIONS = {
  'Kategori-1': {
    // No Device Found Chromecast
    actions: [
      {
        type: 'network_command',
        description: 'Restart Chromecast device via network',
        command: 'restart_chromecast',
        isAutomatic: false, // Requires manual intervention
        confidence: 0.85
      },
      {
        type: 'suggestion',
        description: 'Deactivate whitelist profile',
        command: 'deactivate_whitelist',
        isAutomatic: false,
        confidence: 0.70
      }
    ]
  },
  'Kategori-2': {
    // Weak Or No Signal
    actions: [
      {
        type: 'check',
        description: 'Verify LAN connection status',
        command: 'check_lan_connection',
        isAutomatic: true,
        confidence: 0.90
      },
      {
        type: 'suggestion',
        description: 'Check HDMI source setting',
        command: 'verify_hdmi_source',
        isAutomatic: false,
        confidence: 0.75
      }
    ]
  },
  'Kategori-3': {
    // Unplug LAN TV
    actions: [
      {
        type: 'check',
        description: 'Verify LAN cable connection (IN vs OUT)',
        command: 'check_lan_cable',
        isAutomatic: false,
        confidence: 0.80
      }
    ]
  },
  'Kategori-4': {
    // Chromecast Setup iOS
    actions: [
      {
        type: 'suggestion',
        description: 'Guide user through iOS setup',
        command: 'ios_setup_guide',
        isAutomatic: false,
        confidence: 0.85
      }
    ]
  },
  'Kategori-5': {
    // Error Playing
    actions: [
      {
        type: 'network_command',
        description: 'Reset channel stream',
        command: 'reset_stream',
        isAutomatic: true,
        confidence: 0.75
      }
    ]
  },
  'Kategori-6': {
    // Error Player Error
    actions: [
      {
        type: 'system_command',
        description: 'Reinstall Widget Solution',
        command: 'reinstall_widget',
        isAutomatic: false,
        confidence: 0.80
      },
      {
        type: 'network_command',
        description: 'Reload IGMP',
        command: 'reload_igmp',
        isAutomatic: true,
        confidence: 0.70
      }
    ]
  },
  'Kategori-7': {
    // Connection Failure
    actions: [
      {
        type: 'network_command',
        description: 'Check for IP conflicts',
        command: 'check_ip_conflict',
        isAutomatic: true,
        confidence: 0.85
      }
    ]
  },
  'Kategori-8': {
    // Reset Configuration
    actions: [
      {
        type: 'system_command',
        description: 'Reset Chromecast configuration',
        command: 'reset_chromecast_config',
        isAutomatic: false,
        confidence: 0.75
      }
    ]
  },
  'Kategori-9': {
    // No Device Logged
    actions: [
      {
        type: 'suggestion',
        description: 'Verify local network access permissions',
        command: 'check_local_network_access',
        isAutomatic: false,
        confidence: 0.80
      }
    ]
  },
  'Kategori-10': {
    // Chromecast Black Screen
    actions: [
      {
        type: 'check',
        description: 'Check power adapter status',
        command: 'check_power_adapter',
        isAutomatic: true,
        confidence: 0.85
      }
    ]
  },
  'Kategori-11': {
    // Channel Not Found
    actions: [
      {
        type: 'check',
        description: 'Verify LAN connection (IN vs OUT)',
        command: 'verify_lan_connection',
        isAutomatic: false,
        confidence: 0.80
      }
    ]
  }
};

/**
 * Process notification with ML prediction and auto-fix
 */
async function processNotificationWithML(notification, mlPrediction) {
  try {
    console.log(`Processing notification ${notification.id} with ML...`);

    // 1. Enhance notification with staff data if available
    // This ensures staff tracking fields are saved to database
    const enhancedNotification = {
      ...notification,
      // Ensure staff tracking fields are included (default to null if not provided)
      reportedByStaffId: notification.reportedByStaffId || notification.staffId || null,
      assignedStaffId: notification.assignedStaffId || null,
      handledByStaffId: notification.handledByStaffId || null,
      handlingStartTime: notification.handlingStartTime || null,
      handlingEndTime: notification.handlingEndTime || null,
      notes: notification.notes || [],
      reportStatus: notification.reportStatus || 'pending',
      priority: notification.priority || 'medium'
    };

    // 2. Assign random active staff to notification
    const assignedStaff = await assignRandomStaff();

    if (assignedStaff) {
      enhancedNotification.assignedStaffId = assignedStaff._id;
      enhancedNotification.assignedStaff = {
        id: assignedStaff._id.toString(),
        name: assignedStaff.name,
        email: assignedStaff.email,
        department: assignedStaff.department
      };
      enhancedNotification.assignedAt = new Date();

      console.log(`Notification ${notification.id} assigned to staff: ${assignedStaff.name}`);
    }

    // 3. Save enhanced notification to database
    await saveNotification(enhancedNotification);

    // 4. Save ML prediction
    const predictionDoc = await saveMLPrediction({
      notificationId: notification.id,
      inputText: `${notification.title} ${notification.message} ${notification.error || ''}`,
      cleanedText: mlPrediction.cleaned_text,
      predictedCategory: mlPrediction.predicted_label,
      confidence: mlPrediction.probabilities?.[0]?.probability || 0,
      probabilities: mlPrediction.probabilities || [],
      features: mlPrediction.features,
      suggestedSolutions: notification.suggestedSolutions || []
    });

    // 4. Determine if auto-fix is possible
    const category = mlPrediction.predicted_label;
    const categoryFixes = FIX_ACTIONS[category];

    if (!categoryFixes) {
      console.log(`No auto-fix actions defined for category: ${category}`);
      return {
        success: true,
        autoFixEnabled: false,
        reason: 'No auto-fix actions for this category'
      };
    }

    // 5. Check confidence threshold
    const confidence = mlPrediction.probabilities?.[0]?.probability || 0;
    const CONFIDENCE_THRESHOLD = 0.70;

    if (confidence < CONFIDENCE_THRESHOLD) {
      console.log(`ML confidence ${confidence} below threshold ${CONFIDENCE_THRESHOLD}`);
      return {
        success: true,
        autoFixEnabled: false,
        reason: 'Confidence too low for auto-fix',
        confidence
      };
    }

    // 6. Calculate success rate for staff (if assigned)
    let staffSuccessRate = null;
    if (assignedStaff) {
      staffSuccessRate = await calculateStaffSuccessRate(assignedStaff._id.toString());
    }

    // 7. Create auto-fix logs for available actions
    const fixResults = [];

    for (const action of categoryFixes.actions) {
      const fixLog = await createAutoFixLog({
        notificationId: notification.id,
        mlPredictionId: predictionDoc.predictionId,
        fixType: action.isAutomatic ? 'automatic' : 'manual',
        category: category,
        action: action.command,
        description: action.description,
        confidence: action.confidence * confidence, // Combined confidence
        createdBy: 'ml',
        triggeredBy: assignedStaff ? assignedStaff._id.toString() : null,
        staffName: assignedStaff ? assignedStaff.name : null,
        successRate: staffSuccessRate
      });

      fixResults.push({
        action: action.command,
        description: action.description,
        isAutomatic: action.isAutomatic,
        fixId: fixLog.fixId,
        staffName: assignedStaff ? assignedStaff.name : null,
        successRate: staffSuccessRate
      });

      // If automatic, execute immediately
      if (action.isAutomatic) {
        await executeAutomaticFix(fixLog.fixId, notification, action, assignedStaff);
      }
    }

    return {
      success: true,
      autoFixEnabled: true,
      category,
      confidence,
      fixes: fixResults,
      automaticFixesCount: fixResults.filter(f => f.isAutomatic).length
    };

  } catch (error) {
    console.error('Error processing notification with ML:', error);
    throw error;
  }
}

/**
 * Execute automatic fix action
 */
async function executeAutomaticFix(fixId, notification, action, assignedStaff = null) {
  try {
    console.log(`Executing automatic fix: ${fixId} - ${action.command}`);

    // Mark as executing
    await executeAutoFix(fixId);

    // Simulate fix execution (replace with actual commands)
    const result = await performFixAction(notification, action);

    // Update staff stats if fix is successful
    if (result.success && notification.assignedStaffId) {
      await updateStaffStats(notification.assignedStaffId, 'resolved');
      console.log(`Updated stats for staff ${notification.assignedStaffId} - issue resolved`);
    }

    // Update notification with handledByStaff
    if (result.success && notification.assignedStaff) {
      const { updateNotificationStaffHandled } = require('../autofix-db');
      await updateNotificationStaffHandled(notification.id, notification.assignedStaff);
    }

    // Mark as complete with staff info
    await completeAutoFix(fixId, {
      success: result.success,
      result: result.data,
      executedBy: assignedStaff ? assignedStaff._id.toString() : 'system'
    });

    return result;

  } catch (error) {
    console.error('Error executing automatic fix:', error);

    // Update staff stats if fix failed
    if (notification.assignedStaffId) {
      await updateStaffStats(notification.assignedStaffId, 'failed');
    }

    // Mark as failed
    await completeAutoFix(fixId, {
      success: false,
      errorMessage: error.message,
      executedBy: assignedStaff ? assignedStaff._id.toString() : 'system'
    });

    throw error;
  }
}

/**
 * Perform the actual fix action
 * This is where you'd implement real commands
 */
async function performFixAction(notification, action) {
  const { source, deviceName, roomNo, ipAddr } = notification;

  switch (action.command) {
    case 'check_lan_connection':
      return {
        success: true,
        data: {
          message: 'LAN connection verified',
          status: 'connected',
          details: `Checked connection for ${deviceName || roomNo}`
        }
      };

    case 'reset_stream':
      return {
        success: true,
        data: {
          message: 'Stream reset successful',
          channel: notification.deviceName,
          timestamp: new Date().toISOString()
        }
      };

    case 'reload_igmp':
      return {
        success: true,
        data: {
          message: 'IGMP reloaded',
          status: 'completed'
        }
      };

    case 'check_ip_conflict':
      return {
        success: true,
        data: {
          message: 'IP conflict check completed',
          ip: ipAddr,
          conflictDetected: false
        }
      };

    case 'check_power_adapter':
      return {
        success: true,
        data: {
          message: 'Power adapter check completed',
          status: 'operational',
          device: deviceName
        }
      };

    case 'verify_hdmi_source':
      return {
        success: true,
        data: {
          message: 'HDMI source verified',
          source: 'HDMI-1',
          status: 'correct'
        }
      };

    default:
      return {
        success: false,
        data: {
          message: `Unknown action: ${action.command}`,
          suggestion: 'Manual intervention required'
        }
      };
  }
}

/**
 * Get notification with ML predictions and auto-fix history
 */
async function getNotificationWithFixHistory(notificationId) {
  try {
    const notification = await getNotificationById(notificationId);
    if (!notification) {
      return null;
    }

    const mlPrediction = await getLatestMLPrediction(notificationId);
    const autoFixLogs = await getAutoFixLogsByNotification(notificationId);

    return {
      notification,
      mlPrediction,
      autoFixLogs,
      hasAutoFix: autoFixLogs.length > 0,
      autoFixSuccess: autoFixLogs.filter(log => log.status === 'success').length
    };
  } catch (error) {
    console.error('Error getting notification with fix history:', error);
    throw error;
  }
}

/**
 * Process pending auto-fixes (cron job)
 */
async function processPendingAutoFixes() {
  try {
    const pendingFixes = await getPendingAutoFixes();

    console.log(`Processing ${pendingFixes.length} pending auto-fixes...`);

    const results = [];

    for (const fix of pendingFixes) {
      try {
        const notification = await getNotificationById(fix.notificationId);

        if (!notification) {
          await cancelAutoFix(fix.fixId);
          results.push({
            fixId: fix.fixId,
            status: 'cancelled',
            reason: 'Notification not found'
          });
          continue;
        }

        // Find the action definition
        const categoryFixes = FIX_ACTIONS[fix.category];
        const action = categoryFixes?.actions.find(a => a.command === fix.action);

        if (!action || !action.isAutomatic) {
          // Skip manual actions
          continue;
        }

        const result = await executeAutomaticFix(fix.fixId, notification, action);

        results.push({
          fixId: fix.fixId,
          status: 'executed',
          success: result.success
        });

      } catch (error) {
        console.error(`Error processing fix ${fix.fixId}:`, error);
        results.push({
          fixId: fix.fixId,
          status: 'failed',
          error: error.message
        });
      }
    }

    return {
      total: pendingFixes.length,
      processed: results.length,
      results
    };

  } catch (error) {
    console.error('Error processing pending auto-fixes:', error);
    throw error;
  }
}

/**
 * Get auto-fix dashboard statistics
 */
async function getAutoFixDashboardStats() {
  try {
    const stats = await getAutoFixStats();
    const pendingFixes = await getPendingAutoFixes();

    return {
      ...stats,
      pendingQueue: pendingFixes.length,
      recentActivity: pendingFixes.slice(0, 10).map(fix => ({
        fixId: fix.fixId,
        notificationId: fix.notificationId,
        category: fix.category,
        action: fix.action,
        createdAt: fix.createdAt
      }))
    };
  } catch (error) {
    console.error('Error getting auto-fix dashboard stats:', error);
    throw error;
  }
}

/**
 * Manually trigger auto-fix for a notification
 */
async function manualTriggerAutoFix(notificationId, actionOverride = null) {
  try {
    const notification = await getNotificationById(notificationId);

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Get latest ML prediction
    const mlPrediction = await getLatestMLPrediction(notificationId);

    if (!mlPrediction) {
      throw new Error('No ML prediction found for this notification');
    }

    const category = mlPrediction.predictedCategory;
    const categoryFixes = FIX_ACTIONS[category];

    if (!categoryFixes) {
      throw new Error(`No fixes defined for category: ${category}`);
    }

    // If action specified, use that specific action
    if (actionOverride) {
      const action = categoryFixes.actions.find(a => a.command === actionOverride);

      if (!action) {
        throw new Error(`Action not found: ${actionOverride}`);
      }

      // Calculate success rate for assigned staff (if any)
      let staffSuccessRate = null;
      let staffName = null;
      if (notification.assignedStaffId) {
        staffSuccessRate = await calculateStaffSuccessRate(notification.assignedStaffId);
        staffName = notification.assignedStaff?.name || null;
      }

      const fixLog = await createAutoFixLog({
        notificationId: notificationId,
        mlPredictionId: mlPrediction.predictionId,
        fixType: 'manual',
        category: category,
        action: action.command,
        description: action.description,
        confidence: action.confidence,
        createdBy: 'user',
        staffName: staffName,
        successRate: staffSuccessRate
      });

      const result = await executeAutomaticFix(fixLog.fixId, notification, action);

      return {
        success: true,
        fixId: fixLog.fixId,
        action: action.command,
        result,
        staffName,
        successRate: staffSuccessRate
      };
    }

    // Otherwise, queue all fixes
    return await processNotificationWithML(notification, mlPrediction);

  } catch (error) {
    console.error('Error manually triggering auto-fix:', error);
    throw error;
  }
}

/**
 * Assign random active staff to notification
 * Implements round-robin assignment based on workload
 */
async function assignRandomStaff() {
  try {
    const activeStaff = await getActiveStaffForAssignment();

    if (!activeStaff || activeStaff.length === 0) {
      console.log('No active staff available for assignment');
      return null;
    }

    // Select staff with least workload (round-robin style)
    // Sort by totalAssigned (ascending) to distribute load evenly
    const sortedStaff = activeStaff.sort((a, b) => {
      const aAssigned = a.stats?.totalAssigned || 0;
      const bAssigned = b.stats?.totalAssigned || 0;
      return aAssigned - bAssigned;
    });

    // Pick the staff with least assignments
    const selectedStaff = sortedStaff[0];

    // Increment totalAssigned for this staff
    await updateStaffStats(selectedStaff._id.toString(), 'assigned');

    console.log(`Assigned notification to staff: ${selectedStaff.name} (current workload: ${selectedStaff.stats?.totalAssigned || 0})`);

    return selectedStaff;

  } catch (error) {
    console.error('Error assigning random staff:', error);
    return null;
  }
}

/**
 * Calculate staff success rate based on historical performance
 * Returns percentage (0-100)
 */
async function calculateStaffSuccessRate(staffId) {
  try {
    const { getAutoFixLogsByNotification } = require('../autofix-db');
    const { getNotificationsByStaffId } = require('../notification-db');

    // Get all notifications handled by this staff
    const staffNotifications = await getNotificationsByStaffId(staffId);

    if (!staffNotifications || staffNotifications.length === 0) {
      // No history yet, return null or default
      return null;
    }

    // Get auto-fix logs for all notifications handled by this staff
    let totalFixes = 0;
    let successfulFixes = 0;

    for (const notification of staffNotifications) {
      const fixLogs = await getAutoFixLogsByNotification(notification.id);

      for (const log of fixLogs) {
        // Only count completed fixes (not pending or executing)
        if (log.status === 'success' || log.status === 'failed') {
          totalFixes++;
          if (log.status === 'success') {
            successfulFixes++;
          }
        }
      }
    }

    if (totalFixes === 0) {
      return null;
    }

    // Calculate success rate as percentage
    const successRate = (successfulFixes / totalFixes) * 100;

    console.log(`Staff ${staffId} success rate: ${successRate.toFixed(1)}% (${successfulFixes}/${totalFixes} fixes)`);

    return successRate;

  } catch (error) {
    console.error('Error calculating staff success rate:', error);
    return null;
  }
}

module.exports = {
  processNotificationWithML,
  executeAutomaticFix,
  getNotificationWithFixHistory,
  processPendingAutoFixes,
  getAutoFixDashboardStats,
  manualTriggerAutoFix,
  assignRandomStaff,
  calculateStaffSuccessRate,
  FIX_ACTIONS
};
