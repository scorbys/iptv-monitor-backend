const autoFixService = require('../../services/autoFixService');

/**
 * GET /api/autofix/stats
 * Get auto-fix statistics and dashboard data
 */
async function getAutoFixStats(req, res) {
  try {
    const stats = await autoFixService.getAutoFixDashboardStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting auto-fix stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get auto-fix statistics'
    });
  }
}

/**
 * GET /api/autofix/notification/:notificationId
 * Get notification with ML predictions and auto-fix history
 */
async function getNotificationFixHistory(req, res) {
  try {
    const { notificationId } = req.params;

    const data = await autoFixService.getNotificationWithFixHistory(notificationId);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error getting notification fix history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get fix history'
    });
  }
}

/**
 * POST /api/autofix/trigger
 * Manually trigger auto-fix for a notification
 */
async function triggerAutoFix(req, res) {
  try {
    const { notificationId, action } = req.body;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        error: 'notificationId is required'
      });
    }

    const result = await autoFixService.manualTriggerAutoFix(notificationId, action);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Auto-fix triggered successfully'
    });
  } catch (error) {
    console.error('Error triggering auto-fix:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger auto-fix'
    });
  }
}

/**
 * POST /api/autofix/process-pending
 * Process all pending auto-fixes (cron endpoint)
 */
async function processPendingFixes(req, res) {
  try {
    // Verify cron authorization (add your auth check here)
    const authHeader = req.headers.authorization;

    const result = await autoFixService.processPendingAutoFixes();

    res.status(200).json({
      success: true,
      data: result,
      message: `Processed ${result.processed} pending fixes`
    });
  } catch (error) {
    console.error('Error processing pending fixes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process pending fixes'
    });
  }
}

/**
 * POST /api/autofix/process-notification
 * Process a notification with ML prediction and auto-fix
 */
async function processNotification(req, res) {
  try {
    const { notification, mlPrediction } = req.body;

    if (!notification || !mlPrediction) {
      return res.status(400).json({
        success: false,
        error: 'notification and mlPrediction are required'
      });
    }

    const result = await autoFixService.processNotificationWithML(notification, mlPrediction);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Notification processed with ML successfully'
    });
  } catch (error) {
    console.error('Error processing notification with ML:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process notification with ML'
    });
  }
}

// Route handler for Next.js API routes
export default async function handler(req, res) {
  const { method, query } = req;

  switch (method) {
    case 'GET':
      if (query.notificationId) {
        await getNotificationFixHistory(req, res);
      } else {
        await getAutoFixStats(req, res);
      }
      break;

    case 'POST':
      if (query.action === 'process-pending') {
        await processPendingFixes(req, res);
      } else if (query.action === 'process-notification') {
        await processNotification(req, res);
      } else {
        await triggerAutoFix(req, res);
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).json({
        success: false,
        error: `Method ${method} Not Allowed`
      });
      break;
  }
}
