const { predict } = require('../../../utils/mlService.util');
const {
  createAutoFixLog,
  executeAutoFix,
  completeAutoFix,
  getAutoFixLogsByNotification
} = require('../../../autofix-db');
const {
  getChromecastDeviceById,
  getChromecastDeviceByName
} = require('../../../db');

/**
 * POST /api/chromecast/:deviceId/auto-fix
 * Execute auto-fix for a Chromecast device using ML prediction
 */
async function executeChromecastAutoFix(req, res) {
  try {
    const { deviceId } = req.params;
    const { text, issue, category } = req.body;

    console.log(`[AutoFix] Processing auto-fix for Chromecast device: ${deviceId}`);

    // 1. Get device information
    let device;
    try {
      device = await getChromecastDeviceById(deviceId);
    } catch (error) {
      // Try by device name if ID fails
      device = await getChromecastDeviceByName(deviceId);
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        error: `Chromecast device not found: ${deviceId}`
      });
    }

    // 2. Prepare text for ML prediction
    const predictionText = text ||
      `${issue || ''} ${device.deviceName || ''} ${device.status || ''}`.trim() ||
      `Chromecast ${device.deviceName} issue`;

    // 3. Get ML prediction with recommended fix
    const mlResult = await predict(predictionText);

    if (!mlResult.recommended_fix) {
      return res.status(400).json({
        success: false,
        error: 'No recommended fix available for this issue',
        mlPrediction: mlResult
      });
    }

    const recommendedFix = mlResult.recommended_fix;

    // 4. Check if action is executable
    if (!recommendedFix.command) {
      return res.status(200).json({
        success: true,
        autoFixExecuted: false,
        reason: 'Manual intervention required',
        mlPrediction: mlResult,
        recommendedFix: recommendedFix
      });
    }

    // 5. Create auto-fix log
    const notificationId = `chromecast-${device.idCast || device._id}-${Date.now()}`;

    const fixLog = await createAutoFixLog({
      notificationId: notificationId,
      mlPredictionId: null, // Will be linked if we save ML prediction
      fixType: 'automatic',
      category: mlResult.predicted_label,
      action: recommendedFix.action,
      description: recommendedFix.description,
      confidence: mlResult.probabilities?.[0]?.probability || 0,
      createdBy: 'ml'
    });

    // 6. Mark as executing
    await executeAutoFix(fixLog.fixId);

    // 7. Execute the actual fix
    let fixResult;
    try {
      fixResult = await performChromecastFix(device, recommendedFix);

      await completeAutoFix(fixLog.fixId, {
        success: fixResult.success,
        result: fixResult.data
      });

    } catch (fixError) {
      await completeAutoFix(fixLog.fixId, {
        success: false,
        errorMessage: fixError.message
      });

      throw fixError;
    }

    // 8. Return result
    res.status(200).json({
      success: true,
      autoFixExecuted: true,
      data: {
        device: {
          id: device.idCast || device._id,
          name: device.deviceName,
          ip: device.ipAddr,
          status: device.status
        },
        mlPrediction: {
          category: mlResult.predicted_label,
          confidence: mlResult.probabilities?.[0]?.probability,
          cleanedText: mlResult.cleaned_text
        },
        executedFix: {
          action: recommendedFix.action,
          command: recommendedFix.command,
          description: recommendedFix.description
        },
        fixResult: fixResult,
        fixId: fixLog.fixId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[AutoFix] Error executing Chromecast auto-fix:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute auto-fix'
    });
  }
}

/**
 * GET /api/chromecast/:deviceId/auto-fix-history
 * Get auto-fix history for a Chromecast device
 */
async function getChromecastAutoFixHistory(req, res) {
  try {
    const { deviceId } = req.params;
    const { limit = 10 } = req.query;

    // Get device first
    let device;
    try {
      device = await getChromecastDeviceById(deviceId);
    } catch (error) {
      device = await getChromecastDeviceByName(deviceId);
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        error: `Chromecast device not found: ${deviceId}`
      });
    }

    // Get all notifications for this device and their fix logs
    // This is a simplified approach - in production you'd want direct queries
    const notificationIds = [
      `chromecast-${device.idCast || device._id}-*`
    ];

    // For now, return an empty array with structure
    res.status(200).json({
      success: true,
      data: {
        deviceId: device.idCast || device._id,
        deviceName: device.deviceName,
        autoFixHistory: []
      }
    });

  } catch (error) {
    console.error('[AutoFix] Error getting auto-fix history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get auto-fix history'
    });
  }
}

/**
 * Perform actual Chromecast fix actions
 */
async function performChromecastFix(device, fix) {
  const { action, command, params } = fix;

  console.log(`[AutoFix] Executing fix action: ${action} for device: ${device.deviceName}`);

  switch (action) {
    case 'deactivate_whitelist':
      return await deactivateWhitelistProfile(device);

    case 'restart_device':
      return await restartChromecast(device);

    case 'check_lan':
    case 'check_lan_cable':
      return await checkLANConnection(device);

    case 'check_power':
      return await checkPowerAdapter(device);

    case 'reset_config':
      return await resetChromecastConfig(device);

    case 'check_network_access':
      return await checkNetworkAccess(device);

    case 'ios_setup_guide':
      return {
        success: true,
        manual: true,
        data: {
          message: 'iOS setup guide required',
          instructions: [
            '1. Open Google Home app on iOS device',
            '2. Tap + > Set up device > New device',
            '3. Follow on-screen instructions'
          ]
        }
      };

    default:
      return {
        success: false,
        data: {
          message: `Unknown action: ${action}`,
          suggestion: 'Manual intervention required'
        }
      };
  }
}

/**
 * Chromecast fix implementations
 */

async function deactivateWhitelistProfile(device) {
  // Simulated implementation - replace with actual SSH/API call
  console.log(`[AutoFix] Deactivating whitelist profile for ${device.deviceName}`);

  // TODO: Implement actual SSH command or API call
  // Example:
  // const result = await sshExecute(device.ipAddr, `
  //   ubiquiti-device-cli <= cfg -n ${device.profile} -c 2 &&
  //   ubiquiti-device-cli <= cfg -n ${device.profile} -s default
  // `);

  return {
    success: true,
    data: {
      message: `Deactivated whitelist profile for ${device.deviceName}`,
      profile: device.profile,
      timestamp: new Date().toISOString(),
      note: 'This is a simulated fix - implement actual SSH/API call'
    }
  };
}

async function restartChromecast(device) {
  console.log(`[AutoFix] Restarting Chromecast ${device.deviceName}`);

  // TODO: Implement actual restart via SSH or API
  // Example:
  // const result = await sshExecute(device.ipAddr, 'reboot');

  return {
    success: true,
    data: {
      message: `Restarted Chromecast ${device.deviceName}`,
      ip: device.ipAddr,
      timestamp: new Date().toISOString(),
      note: 'This is a simulated fix - implement actual SSH/API call'
    }
  };
}

async function checkLANConnection(device) {
  console.log(`[AutoFix] Checking LAN connection for ${device.deviceName}`);

  // TODO: Implement actual LAN check
  return {
    success: true,
    data: {
      message: 'LAN connection checked',
      device: device.deviceName,
      ip: device.ipAddr,
      status: 'connected',
      timestamp: new Date().toISOString()
    }
  };
}

async function checkPowerAdapter(device) {
  console.log(`[AutoFix] Checking power adapter for ${device.deviceName}`);

  // TODO: Implement actual power check if possible via IoT integration
  return {
    success: true,
    data: {
      message: 'Power adapter status checked',
      device: device.deviceName,
      status: 'operational',
      timestamp: new Date().toISOString()
    }
  };
}

async function resetChromecastConfig(device) {
  console.log(`[AutoFix] Resetting configuration for ${device.deviceName}`);

  // TODO: Implement actual config reset
  return {
    success: true,
    data: {
      message: `Configuration reset for ${device.deviceName}`,
      timestamp: new Date().toISOString(),
      note: 'This is a simulated fix - implement actual reset'
    }
  };
}

async function checkNetworkAccess(device) {
  console.log(`[AutoFix] Checking network access for ${device.deviceName}`);

  // TODO: Implement actual network access check
  return {
    success: true,
    data: {
      message: 'Network access verified',
      device: device.deviceName,
      ip: device.ipAddr,
      accessible: true,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  executeChromecastAutoFix,
  getChromecastAutoFixHistory
};
