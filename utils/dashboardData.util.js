/**
 * Dashboard Data Utility
 * Provides efficient data fetching and caching for dashboard
 */

const CacheUtil = require('./cache.util');
const Channel = require('../models/Channel');
const Tv = require('../models/Tv');
const Chromecast = require('../models/Chromecast');
const User = require('../models/User');
const Logger = require('./logger.util');

const logger = new Logger('DashboardData');

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
  STATS: 60, // 1 minute
  CHANNELS: 120, // 2 minutes
  DEVICES: 60, // 1 minute
  USERS: 300, // 5 minutes
  ISSUES: 30 // 30 seconds
};

/**
 * Fetch dashboard statistics with caching
 */
async function fetchDashboardStats() {
  const cacheKey = 'dashboard:stats:all';
  const cached = CacheUtil.system.get(cacheKey);

  if (cached) {
    logger.debug('Dashboard stats: cache hit');
    return cached;
  }

  logger.info('Fetching dashboard stats from database');

  try {
    const [
      totalChannels,
      activeChannels,
      totalTVs,
      onlineTVs,
      totalChromecasts,
      onlineChromecasts,
      totalUsers,
      activeUsers
    ] = await Promise.all([
      Channel.countDocuments(),
      Channel.countDocuments({ status: 'active' }),
      Tv.countDocuments(),
      Tv.countDocuments({ status: 'online', lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
      Chromecast.countDocuments(),
      Chromecast.countDocuments({ status: 'online', lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
      User.countDocuments(),
      User.countDocuments({ status: 'active' })
    ]);

    const stats = {
      channels: {
        total: totalChannels,
        active: activeChannels,
        inactive: totalChannels - activeChannels
      },
      tvs: {
        total: totalTVs,
        online: onlineTVs,
        offline: totalTVs - onlineTVs
      },
      chromecasts: {
        total: totalChromecasts,
        online: onlineChromecasts,
        offline: totalChromecasts - onlineChromecasts
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers
      },
      timestamp: new Date().toISOString()
    };

    CacheUtil.system.set(cacheKey, stats, CACHE_TTL.STATS);
    return stats;

  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    throw error;
  }
}

/**
 * Fetch channel statistics with caching
 */
async function fetchChannelStats() {
  const cacheKey = 'dashboard:stats:channels';
  const cached = CacheUtil.system.get(cacheKey);

  if (cached) {
    logger.debug('Channel stats: cache hit');
    return cached;
  }

  try {
    const channelStats = await Channel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = channelStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    CacheUtil.system.set(cacheKey, stats, CACHE_TTL.CHANNELS);
    return stats;

  } catch (error) {
    logger.error('Error fetching channel stats:', error);
    throw error;
  }
}

/**
 * Fetch device statistics with caching
 */
async function fetchDeviceStats() {
  const cacheKey = 'dashboard:stats:devices';
  const cached = CacheUtil.system.get(cacheKey);

  if (cached) {
    logger.debug('Device stats: cache hit');
    return cached;
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [
      tvStats,
      chromecastStats,
      recentlyActiveTVs,
      recentlyActiveChromecasts
    ] = await Promise.all([
      Tv.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Chromecast.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Tv.countDocuments({ lastSeen: { $gte: fiveMinutesAgo } }),
      Chromecast.countDocuments({ lastSeen: { $gte: fiveMinutesAgo } })
    ]);

    const stats = {
      tvs: tvStats.reduce((acc, stat) => {
        acc[stat._id || 'unknown'] = stat.count;
        return acc;
      }, {}),
      chromecasts: chromecastStats.reduce((acc, stat) => {
        acc[stat._id || 'unknown'] = stat.count;
        return acc;
      }, {}),
      recentlyActive: {
        tvs: recentlyActiveTVs,
        chromecasts: recentlyActiveChromecasts
      },
      timestamp: new Date().toISOString()
    };

    CacheUtil.system.set(cacheKey, stats, CACHE_TTL.DEVICES);
    return stats;

  } catch (error) {
    logger.error('Error fetching device stats:', error);
    throw error;
  }
}

/**
 * Fetch recent issues/notifications
 */
async function fetchRecentIssues(limit = 10) {
  const cacheKey = `dashboard:issues:${limit}`;
  const cached = CacheUtil.system.get(cacheKey);

  if (cached) {
    logger.debug('Recent issues: cache hit');
    return cached;
  }

  try {
    // This would query from your issues/notifications collection
    // Adjust the model and query based on your actual data structure
    const issues = []; // Placeholder - implement based on your issues model

    CacheUtil.system.set(cacheKey, issues, CACHE_TTL.ISSUES);
    return issues;

  } catch (error) {
    logger.error('Error fetching recent issues:', error);
    throw error;
  }
}

/**
 * Clear all dashboard cache
 */
function clearDashboardCache() {
  const keys = [
    'dashboard:stats:all',
    'dashboard:stats:channels',
    'dashboard:stats:devices'
  ];

  keys.forEach(key => CacheUtil.system.del(key));
  logger.info('Dashboard cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    stats: CacheUtil.system.getStats('dashboard:stats:all'),
    channels: CacheUtil.system.getStats('dashboard:stats:channels'),
    devices: CacheUtil.system.getStats('dashboard:stats:devices')
  };
}

module.exports = {
  fetchDashboardStats,
  fetchChannelStats,
  fetchDeviceStats,
  fetchRecentIssues,
  clearDashboardCache,
  getCacheStats,
  CACHE_TTL
};
