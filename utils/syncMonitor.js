/**
 * Production Monitoring & Debugging for Supabase Sync
 * File: backend/utils/syncMonitor.js
 * 
 * Gunakan untuk:
 * - Real-time monitoring sync status
 * - Detect sync failures
 * - Verify data consistency
 * - Generate sync reports
 */

const { getSupabaseClient } = require('../config/supabase.config');
const { connectDB } = require('../db');

// Sync event tracking
const syncMetrics = {
  totalSynced: 0,
  totalErrors: 0,
  lastSyncTime: null,
  lastErrorTime: null,
  syncdCollections: {},
  errorLog: []
};

/**
 * Track sync success
 */
function trackSyncSuccess(collection, count = 1) {
  syncMetrics.totalSynced += count;
  syncMetrics.lastSyncTime = new Date().toISOString();
  
  if (!syncMetrics.syncdCollections[collection]) {
    syncMetrics.syncdCollections[collection] = 0;
  }
  syncMetrics.syncdCollections[collection] += count;
  
  console.log(`📊 SYNC TRACKED [${collection}]: +${count} | Total: ${syncMetrics.totalSynced}`);
}

/**
 * Track sync error
 */
function trackSyncError(collection, error, operation = 'unknown') {
  syncMetrics.totalErrors++;
  syncMetrics.lastErrorTime = new Date().toISOString();
  
  const errorEntry = {
    timestamp: new Date().toISOString(),
    collection,
    operation,
    error: error?.message || String(error),
    stack: error?.stack
  };
  
  syncMetrics.errorLog.push(errorEntry);
  
  // Keep only last 100 errors
  if (syncMetrics.errorLog.length > 100) {
    syncMetrics.errorLog.shift();
  }
  
  console.error(`❌ SYNC ERROR [${collection}]:`, error?.message);
}

/**
 * Get sync metrics dashboard
 */
function getSyncMetrics() {
  return {
    summary: {
      totalSynced: syncMetrics.totalSynced,
      totalErrors: syncMetrics.totalErrors,
      successRate: syncMetrics.totalSynced + syncMetrics.totalErrors > 0
        ? ((syncMetrics.totalSynced / (syncMetrics.totalSynced + syncMetrics.totalErrors)) * 100).toFixed(2) + '%'
        : 'N/A',
      lastSyncTime: syncMetrics.lastSyncTime,
      lastErrorTime: syncMetrics.lastErrorTime,
      timestamp: new Date().toISOString()
    },
    byCollection: syncMetrics.syncdCollections,
    recentErrors: syncMetrics.errorLog.slice(-10)
  };
}

/**
 * Verify data exists in both databases
 */
async function verifyDataConsistency(collection) {
  try {
    console.log(`🔍 Checking data consistency for: ${collection}`);
    
    // Get count from MongoDB
    const db = await connectDB();
    const mongoCollection = db[collection] || db[getCollectionMap(collection)];
    const mongoCount = await mongoCollection.countDocuments();
    
    // Get count from Supabase
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return {
        success: false,
        error: 'Supabase not connected',
        collection
      };
    }
    
    const { count: supabaseCount, error } = await supabase
      .from(collection)
      .select('count()', { count: 'exact', head: true });
    
    if (error) {
      return {
        success: false,
        error: error.message,
        collection,
        mongoCount
      };
    }
    
    const isConsistent = mongoCount === supabaseCount;
    
    console.log(`📊 ${collection}: MongoDB=${mongoCount}, Supabase=${supabaseCount}, Match=${isConsistent}`);
    
    return {
      success: true,
      collection,
      mongoCount,
      supabaseCount,
      isConsistent,
      variance: Math.abs(mongoCount - supabaseCount),
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error verifying consistency:`, error);
    return {
      success: false,
      error: error.message,
      collection
    };
  }
}

/**
 * Compare sample documents between MongoDB and Supabase
 */
async function compareSampleDocuments(collection, limit = 5) {
  try {
    console.log(`🔎 Comparing sample documents for: ${collection}`);
    
    // Get from MongoDB
    const db = await connectDB();
    const mongoCollection = db[collection] || db[getCollectionMap(collection)];
    const mongoSamples = await mongoCollection.find({}).limit(limit).toArray();
    
    // Get from Supabase
    const supabase = await getSupabaseClient();
    const { data: supabaseSamples, error } = await supabase
      .from(collection)
      .select('*')
      .limit(limit);
    
    if (error) {
      return {
        success: false,
        error: error.message,
        collection
      };
    }
    
    // Compare
    const comparison = {
      collection,
      mongoSampleCount: mongoSamples.length,
      supabaseSampleCount: supabaseSamples?.length || 0,
      documents: []
    };
    
    for (let i = 0; i < Math.min(mongoSamples.length, supabaseSamples?.length || 0); i++) {
      const mongoDoc = mongoSamples[i];
      const mongoId = mongoDoc._id?.toString();
      const supabaseDoc = supabaseSamples.find(d => d.id === mongoId);
      
      comparison.documents.push({
        mongoId,
        found: !!supabaseDoc,
        mongoFields: Object.keys(mongoDoc).length,
        supabaseFields: supabaseDoc ? Object.keys(supabaseDoc).length : 0,
        match: supabaseDoc ? compareObjects(mongoDoc, supabaseDoc) : false
      });
    }
    
    return {
      success: true,
      ...comparison,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error comparing samples:`, error);
    return {
      success: false,
      error: error.message,
      collection
    };
  }
}

/**
 * Utility: Compare two objects
 */
function compareObjects(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
      if (!compareObjects(obj1[key], obj2[key])) return false;
    } else if (obj1[key] !== obj2[key]) {
      // Allow ISO string vs Date comparison
      if (!(obj1[key] instanceof Date && obj2[key]?.includes('T'))) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Collection name mapping
 */
function getCollectionMap(collection) {
  const map = {
    'international_channels': 'international',
    'local_channels': 'local',
    'tv_hospitality': 'hospitality',
    'login_page': 'users',
    'chromecast': 'chromecast',
    'auto_fix_history': 'autoFixHistory',
    'notifications': 'notifications',
    'staff': 'staff'
  };
  return map[collection];
}

/**
 * Full consistency check for all collections
 */
async function checkAllConsistency() {
  const collections = [
    'international_channels',
    'local_channels',
    'tv_hospitality',
    'login_page',
    'chromecast',
    'auto_fix_history',
    'notifications',
    'staff'
  ];
  
  console.log('🔍 Running full consistency check...');
  
  const results = {};
  for (const collection of collections) {
    try {
      results[collection] = await verifyDataConsistency(collection);
    } catch (error) {
      results[collection] = { success: false, error: error.message };
    }
  }
  
  return {
    timestamp: new Date().toISOString(),
    results,
    allConsistent: Object.values(results).every(r => r.isConsistent === true),
    consistentCollections: Object.entries(results)
      .filter(([_, r]) => r.isConsistent === true)
      .map(([name, _]) => name),
    inconsistentCollections: Object.entries(results)
      .filter(([_, r]) => r.isConsistent !== true)
      .map(([name, _]) => name)
  };
}

/**
 * Generate detailed sync report
 */
async function generateSyncReport() {
  try {
    const metrics = getSyncMetrics();
    const consistency = await checkAllConsistency();
    
    const report = {
      generated: new Date().toISOString(),
      metrics,
      consistency,
      summary: {
        totalOperations: metrics.summary.totalSynced + metrics.summary.totalErrors,
        successRate: metrics.summary.successRate,
        databaseStatus: consistency.allConsistent ? '✅ CONSISTENT' : '⚠️ INCONSISTENT',
        recommendedAction: consistency.allConsistent 
          ? 'All systems operational' 
          : 'Review inconsistent collections'
      }
    };
    
    return report;
  } catch (error) {
    console.error('Error generating sync report:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  trackSyncSuccess,
  trackSyncError,
  getSyncMetrics,
  verifyDataConsistency,
  compareSampleDocuments,
  checkAllConsistency,
  generateSyncReport
};
