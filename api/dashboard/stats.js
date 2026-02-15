/**
 * Simple Dashboard Stats API Endpoint
 * Returns basic dashboard statistics without complex caching
 */

const express = require('express');
const router = express.Router();
const {
  getInternationalChannels,
  getLocalChannels,
  getHospitalityTVs,
  getChromecastDevices,
} = require('../../db');
const { Logger } = require('../../utils/logger.util');

const logger = new Logger('DashboardAPI');

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('Fetching dashboard stats from database');

    // Get data from database
    const allChannels = await getAllChannels();
    const allTVs = await getHospitalityTVs();
    const allChromecasts = await getChromecastDevices();

    logger.info(`Data loaded: ${allChannels.length} channels, ${allTVs.length} TVs, ${allChromecasts.length} Chromecasts`);

    // Calculate statistics
    const totalChannels = allChannels.length;
    const totalTVs = Array.isArray(allTVs) ? allTVs.length : 0;
    const totalChromecasts = Array.isArray(allChromecasts) ? allChromecasts.length : 0;

    // Count online items (simplified - assume all online)
    const activeChannels = totalChannels;
    const onlineTVs = totalTVs;
    const onlineChromecasts = totalChromecasts;

    const stats = {
      channels: {
        total: totalChannels,
        active: activeChannels,
        inactive: totalChannels - activeChannels,
        activePercentage: totalChannels > 0 ? ((activeChannels / totalChannels) * 100).toFixed(1) : '0.0'
      },
      tvs: {
        total: totalTVs,
        online: onlineTVs,
        offline: totalTVs - onlineTVs,
        onlinePercentage: totalTVs > 0 ? ((onlineTVs / totalTVs) * 100).toFixed(1) : '0.0'
      },
      chromecasts: {
        total: totalChromecasts,
        online: onlineChromecasts,
        offline: totalChromecasts - onlineChromecasts,
        onlinePercentage: totalChromecasts > 0 ? ((onlineChromecasts / totalChromecasts) * 100).toFixed(1) : '0.0'
      },
      users: {
        total: 0,
        active: 0,
        inactive: 0,
        activePercentage: '0.0'
      },
      systemHealth: {
        overallStatus: (onlineTVs + onlineChromecasts) > (totalTVs + totalChromecasts) / 2 ? 'healthy' : 'warning',
        lastUpdated: new Date().toISOString()
      }
    };

    logger.info('Dashboard stats fetched successfully');

    return res.json({
      success: true,
      data: stats,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching dashboard stats:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

/**
 * POST /api/dashboard/stats/clear
 * Clear dashboard stats cache (not implemented yet)
 */
router.post('/stats/clear', async (req, res) => {
  try {
    logger.info('Dashboard stats cache clear requested (no cache implemented)');

    return res.json({
      success: true,
      message: 'No cache to clear'
    });
  } catch (error) {
    logger.error('Error clearing dashboard cache:', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * Helper function to get all channels from database
 */
async function getAllChannels() {
  try {
    const [internationalChannels, localChannels] = await Promise.all([
      getInternationalChannels(),
      getLocalChannels(),
    ]);

    const intlArray = Array.isArray(internationalChannels) ? internationalChannels : [];
    const localArray = Array.isArray(localChannels) ? localChannels : [];
    return [...intlArray, ...localArray];
  } catch (error) {
    logger.error('Error fetching channels:', { error: error.message });
    return [];
  }
}

module.exports = router;
