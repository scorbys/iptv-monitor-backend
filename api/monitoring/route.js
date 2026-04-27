/**
 * Production Monitoring API Routes
 * File: backend/api/monitoring/route.js
 * 
 * Endpoints untuk monitor sync status secara real-time di production
 */

const express = require('express');
const router = express.Router();
const {
  trackSyncSuccess,
  trackSyncError,
  getSyncMetrics,
  verifyDataConsistency,
  compareSampleDocuments,
  checkAllConsistency,
  generateSyncReport
} = require('../../utils/syncMonitor');

/**
 * GET /api/monitoring/sync-metrics
 * Get real-time sync metrics
 */
router.get('/sync-metrics', (req, res) => {
  try {
    const metrics = getSyncMetrics();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/consistency/:collection
 * Check data consistency for specific collection
 * 
 * Example:
 * GET /api/monitoring/consistency/international_channels
 */
router.get('/consistency/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const result = await verifyDataConsistency(collection);
    
    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/consistency
 * Check consistency for ALL collections
 */
router.get('/consistency', async (req, res) => {
  try {
    const result = await checkAllConsistency();
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/compare/:collection
 * Compare sample documents between MongoDB and Supabase
 * 
 * Query params:
 * - limit: number of samples (default: 5)
 * 
 * Example:
 * GET /api/monitoring/compare/international_channels?limit=10
 */
router.get('/compare/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const { limit = 5 } = req.query;
    
    const result = await compareSampleDocuments(collection, parseInt(limit));
    
    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/report
 * Generate comprehensive sync report
 */
router.get('/report', async (req, res) => {
  try {
    const report = await generateSyncReport();
    
    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/quick-check
 * Quick health check - single endpoint to verify everything is working
 */
router.get('/quick-check', async (req, res) => {
  try {
    const metrics = getSyncMetrics();
    const consistency = await checkAllConsistency();
    
    const isHealthy = 
      metrics.summary.totalErrors === 0 && 
      consistency.allConsistent;
    
    res.json({
      success: true,
      status: isHealthy ? '✅ HEALTHY' : '⚠️ ISSUES',
      health: {
        syncOperations: {
          total: metrics.summary.totalSynced + metrics.summary.totalErrors,
          succeeded: metrics.summary.totalSynced,
          failed: metrics.summary.totalErrors,
          successRate: metrics.summary.successRate
        },
        dataConsistency: {
          allConsistent: consistency.allConsistent,
          consistentCollections: consistency.consistentCollections.length,
          inconsistentCollections: consistency.inconsistentCollections.length,
          issues: consistency.inconsistentCollections
        },
        lastSyncTime: metrics.summary.lastSyncTime,
        lastErrorTime: metrics.summary.lastErrorTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
