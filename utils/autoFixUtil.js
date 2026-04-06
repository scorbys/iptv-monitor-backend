/**
 * Auto-Fix Integration Utility
 * Integrates ML predictions with the notification system
 */

const autoFixService = require('../services/autoFixService');
const { systemContextCache } = require('./cache.util');

/**
 * Enhanced notification creator that includes ML processing
 */
async function createNotificationWithML(notification) {
  try {
    // Don't process if device is online or recovered
    if (notification.currentStatus === 'online' || notification.type === 'success') {
      return {
        ...notification,
        mlProcessed: false,
        reason: 'Device is online/recovered'
      };
    }

    // Only process offline devices with errors
    if (!notification.error && notification.errorCategory !== 'Connection') {
      return {
        ...notification,
        mlProcessed: false,
        reason: 'No error to process'
      };
    }

    // Prepare text for ML prediction
    const textForML = [
      notification.title,
      notification.message,
      notification.error || '',
      notification.deviceName || '',
      notification.roomNo || '',
      notification.source || ''
    ].filter(Boolean).join(' | ');

    // Sebelum memanggil fetch ke ML:
    const cacheKey = `ml:predict:${Buffer.from(textForML).toString('base64').slice(0, 40)}`;
    const cachedPrediction = systemContextCache.get(cacheKey);

    // Call ML service for prediction
    let mlPrediction = cachedPrediction || null;
    if (!mlPrediction) {
      try {
        const mlResponse = await fetch('http://localhost:8001/api/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: textForML })
        });
        if (mlResponse.ok) {
          mlPrediction = await mlResponse.json();
          systemContextCache.set(cacheKey, mlPrediction, 300); // cache 5 menit
        }
      } catch (mlError) {
        console.error('ML service error:', mlError);
      }
    }

    // Process with auto-fix if ML prediction is available
    if (mlPrediction && mlPrediction.predicted_label) {
      try {
        const autoFixResult = await autoFixService.processNotificationWithML(
          notification,
          mlPrediction
        );

        return {
          ...notification,
          mlProcessed: true,
          mlPrediction: {
            category: mlPrediction.predicted_label,
            confidence: mlPrediction.probabilities?.[0]?.probability || 0,
            cleanedText: mlPrediction.cleaned_text
          },
          autoFix: autoFixResult
        };
      } catch (autoFixError) {
        console.error('Auto-fix processing error:', autoFixError);
        return {
          ...notification,
          mlProcessed: true,
          mlPrediction: {
            category: mlPrediction.predicted_label,
            confidence: mlPrediction.probabilities?.[0]?.probability || 0
          },
          autoFixError: autoFixError.message
        };
      }
    }

    // Return original notification if ML processing failed
    return {
      ...notification,
      mlProcessed: false,
      reason: 'ML prediction unavailable'
    };

  } catch (error) {
    console.error('Error in createNotificationWithML:', error);
    return {
      ...notification,
      mlProcessed: false,
      error: error.message
    };
  }
}

/**
 * Batch process notifications with ML
 */
async function batchProcessNotificationsWithML(notifications) {
  const results = [];

  // Only process offline/error notifications
  const errorNotifications = notifications.filter(n =>
    n.currentStatus === 'offline' &&
    (n.error || n.errorCategory === 'Connection')
  );

  console.log(`Processing ${errorNotifications.length} error notifications with ML...`);

  for (const notification of errorNotifications) {
    const enhanced = await createNotificationWithML(notification);
    results.push(enhanced);

    // Small delay to avoid overwhelming the ML service
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Return all notifications (processed and unprocessed)
  return [
    ...results,
    ...notifications.filter(n =>
      n.currentStatus !== 'offline' ||
      (!n.error && n.errorCategory !== 'Connection')
    )
  ];
}

/**
 * Check if auto-fix is available for a notification
 */
async function checkAutoFixAvailability(notificationId) {
  try {
    const data = await autoFixService.getNotificationWithFixHistory(notificationId);

    return {
      available: !!data,
      hasPrediction: !!data?.mlPrediction,
      hasAutoFixLogs: data?.autoFixLogs?.length > 0,
      category: data?.mlPrediction?.predictedCategory,
      automaticFixesCount: data?.autoFixLogs?.filter(log =>
        log.fixType === 'automatic' && log.status === 'success'
      ).length || 0
    };
  } catch (error) {
    console.error('Error checking auto-fix availability:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Trigger auto-fix for a specific notification
 */
async function triggerAutoFix(notificationId, action = null) {
  try {
    const result = await autoFixService.manualTriggerAutoFix(notificationId, action);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Error triggering auto-fix:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get auto-fix statistics for dashboard
 */
async function getAutoFixStatistics() {
  try {
    const stats = await autoFixService.getAutoFixDashboardStats();

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('Error getting auto-fix statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createNotificationWithML,
  batchProcessNotificationsWithML,
  checkAutoFixAvailability,
  triggerAutoFix,
  getAutoFixStatistics
};
