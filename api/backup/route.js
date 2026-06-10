const express = require('express');
const router = express.Router();
const { connectDB } = require('../../db');
const { getBackupStatus } = require('../../utils/supabaseSync');
const {
  forceSyncCollection,
  getSyncStatus,
  clearSyncQueue
} = require('../../utils/dbSyncWrapper');
const { verifyToken, requireAdmin } = require('../../middleware/authMiddleware');

// Legacy Supabase mirror endpoints. The route stays /api/backup for backward
// compatibility, but MongoDB Atlas is the source of truth and backup target.
router.use(verifyToken, requireAdmin);

/**
 * GET /api/backup/status
 * Get optional Supabase mirror and sync status
 */
router.get('/status', async (req, res) => {
  try {
    const mirrorStatus = await getBackupStatus();
    const syncStatus = getSyncStatus();

    res.json({
      success: true,
      mirror: mirrorStatus,
      backup: mirrorStatus,
      sync: syncStatus,
      note: 'Supabase is an optional mirror, not the production backup database.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting Supabase mirror status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/backup/force-sync
 * Force sync specific collection or all collections to the optional mirror
 */
router.post('/force-sync', async (req, res) => {
  try {
    const { collection } = req.body;

    if (!collection || collection === 'all') {
      // Sync all collections
      console.log('🔄 Starting full database sync to optional Supabase mirror...');

      const db = await connectDB();

      // Mapping key db → nama tabel Supabase
      const collectionMap = {
        'international_channels': db.international,
        'local_channels': db.local,
        'tv_hospitality': db.hospitality,
        'login_page': db.users,
        'chromecast': db.chromecast,
        'auto_fix_history': db.autoFixHistory,
        'notifications': db.notifications,
        'staff': db.staff
      };

      const results = {};

      for (const [collName, mongoCol] of Object.entries(collectionMap)) {
        try {
          if (!mongoCol) {
            results[collName] = { success: false, error: 'Collection not found in db' };
            continue;
          }
          results[collName] = await forceSyncCollection(mongoCol, collName);
        } catch (error) {
          results[collName] = { success: false, error: error.message };
        }
      }

      return res.json({
        success: true,
        message: 'Full optional mirror sync initiated',
        results,
        note: 'This sync does not replace MongoDB Atlas backups.',
        timestamp: new Date().toISOString()
      });
    }

    // Sync specific collection
    const db = await connectDB();

    // Map collection names
    const collectionMap = {
      'international_channels': db.international,
      'local_channels': db.local,
      'tv_hospitality': db.hospitality,
      'login_page': db.users,
      'chromecast': db.chromecast,
      'auto_fix_history': db.autoFixHistory,
      'notifications': db.notifications,
      'staff': db.staff
    };

    const mongoCollection = collectionMap[collection];
    if (!mongoCollection) {
      return res.status(400).json({
        success: false,
        error: `Unknown collection: ${collection}`
      });
    }

    const result = await forceSyncCollection(mongoCollection, collection);

    res.json({
      success: result.success,
      message: `Synced ${result.count || 0} documents`,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error forcing sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/backup/restore
 * Legacy/manual restore placeholder from optional Supabase mirror to MongoDB
 */
router.post('/restore', async (req, res) => {
  try {
    const { collection } = req.body;

    if (!collection) {
      return res.status(400).json({
        success: false,
        error: 'Collection name is required'
      });
    }

    // This is a placeholder - actual implementation depends on your needs
    res.json({
      success: true,
      message: `Manual mirror restore placeholder for ${collection}`,
      info: 'Supabase mirror restore is legacy/manual only and is not the production backup strategy.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error restoring data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/backup/queue-status
 * Get sync queue status
 */
router.get('/queue-status', (req, res) => {
  try {
    const status = getSyncStatus();

    res.json({
      success: true,
      queue: {
        length: status.queueLength,
        processing: status.isProcessing,
        strategy: status.strategy
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/backup/clear-queue
 * Emergency: Clear sync queue
 */
router.post('/clear-queue', (req, res) => {
  try {
    const count = clearSyncQueue();

    res.json({
      success: true,
      message: `Cleared ${count} items from sync queue`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/backup/collections-info
 * Get info about all collections
 */
router.get('/collections-info', async (req, res) => {
  try {
    const db = await connectDB();

    const collections = {
      international_channels: await db.international.countDocuments(),
      local_channels: await db.local.countDocuments(),
      tv_hospitality: await db.hospitality.countDocuments(),
      login_page: await db.users.countDocuments(),
      chromecast: await db.chromecast.countDocuments(),
      auto_fix_history: await db.autoFixHistory.countDocuments(),
      notifications: await db.notifications?.countDocuments() || 0,
      staff: await db.staff?.countDocuments() || 0
    };

    res.json({
      success: true,
      collections,
      totalDocuments: Object.values(collections).reduce((a, b) => a + b, 0),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting collections info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
