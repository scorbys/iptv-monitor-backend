/**
 * Production Monitoring & Debugging for Supabase Sync
 * File: backend/utils/syncMonitor.js
 *
 * Metrics disimpan permanen di:
 * - Supabase: sync_metrics_summary, sync_metrics_collections, sync_error_log
 * - MongoDB: koleksi sync_metrics
 */

const { getSupabaseClient } = require('../config/supabase.config');
// connectDB di-import lazy di dalam fungsi untuk hindari circular dependency

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STATE (direset saat restart, tapi akan di-restore
// dari DB saat pertama kali getSyncMetrics() dipanggil)
// ─────────────────────────────────────────────────────────────
const syncMetrics = {
  totalSynced: 0,
  totalErrors: 0,
  lastSyncTime: null,
  lastErrorTime: null,
  syncdCollections: {},
  errorLog: [],
  _loaded: false   // flag: sudah load dari DB atau belum
};

// Debounce timer untuk batch write ke DB
let _persistTimer = null;
const PERSIST_DEBOUNCE_MS = 5000; // tulis ke DB setiap 5 detik setelah ada perubahan

// ─────────────────────────────────────────────────────────────
// MAPPING db key
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PERSIST KE SUPABASE
// ─────────────────────────────────────────────────────────────
async function persistToSupabase() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const today = new Date().toISOString().split('T')[0];
    const total = syncMetrics.totalSynced + syncMetrics.totalErrors;
    const successRate = total > 0
      ? parseFloat(((syncMetrics.totalSynced / total) * 100).toFixed(2))
      : 0;

    // Upsert summary harian
    await supabase.from('sync_metrics_summary').upsert([{
      date: today,
      total_synced: syncMetrics.totalSynced,
      total_errors: syncMetrics.totalErrors,
      success_rate: successRate,
      last_sync_time: syncMetrics.lastSyncTime,
      last_error_time: syncMetrics.lastErrorTime,
      updated_at: new Date().toISOString()
    }], { onConflict: 'date' });

    // Upsert per-collection stats
    const collectionRows = Object.entries(syncMetrics.syncdCollections).map(([name, count]) => ({
      date: today,
      collection_name: name,
      synced_count: count,
      last_sync_time: syncMetrics.lastSyncTime,
      updated_at: new Date().toISOString()
    }));

    if (collectionRows.length > 0) {
      await supabase.from('sync_metrics_collections')
        .upsert(collectionRows, { onConflict: 'date,collection_name' });
    }

  } catch (err) {
    console.error('⚠️ Failed to persist metrics to Supabase:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// PERSIST KE MONGODB
// ─────────────────────────────────────────────────────────────
async function persistToMongo() {
  try {
    const { connectDB } = require('../db');
    const db = await connectDB();
    const col = db.client.db('iptv').collection('sync_metrics');

    const today = new Date().toISOString().split('T')[0];
    const total = syncMetrics.totalSynced + syncMetrics.totalErrors;
    const successRate = total > 0
      ? parseFloat(((syncMetrics.totalSynced / total) * 100).toFixed(2))
      : 0;

    await col.updateOne(
      { date: today },
      {
        $set: {
          date: today,
          totalSynced: syncMetrics.totalSynced,
          totalErrors: syncMetrics.totalErrors,
          successRate,
          lastSyncTime: syncMetrics.lastSyncTime,
          lastErrorTime: syncMetrics.lastErrorTime,
          byCollection: { ...syncMetrics.syncdCollections },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('⚠️ Failed to persist metrics to MongoDB:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// DEBOUNCED PERSIST — tulis ke kedua DB setelah idle 5 detik
// ─────────────────────────────────────────────────────────────
function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    await Promise.all([persistToSupabase(), persistToMongo()]);
  }, PERSIST_DEBOUNCE_MS);
}

// ─────────────────────────────────────────────────────────────
// LOG ERROR KE SUPABASE (langsung, tidak di-debounce)
// ─────────────────────────────────────────────────────────────
async function logErrorToSupabase(collection, operation, error) {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    await supabase.from('sync_error_log').insert([{
      collection,
      operation,
      error_message: error?.message || String(error),
      error_code: error?.code || null,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    // Jangan crash jika log error gagal
  }
}

// ─────────────────────────────────────────────────────────────
// LOAD FROM DB saat pertama kali (restore setelah restart)
// ─────────────────────────────────────────────────────────────
async function loadTodayMetrics() {
  if (syncMetrics._loaded) return;
  syncMetrics._loaded = true;

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const today = new Date().toISOString().split('T')[0];

    // Load summary
    const { data: summary } = await supabase
      .from('sync_metrics_summary')
      .select('*')
      .eq('date', today)
      .single();

    if (summary) {
      syncMetrics.totalSynced = summary.total_synced || 0;
      syncMetrics.totalErrors = summary.total_errors || 0;
      syncMetrics.lastSyncTime = summary.last_sync_time;
      syncMetrics.lastErrorTime = summary.last_error_time;
      console.log(`📊 Restored today metrics from Supabase: synced=${syncMetrics.totalSynced}, errors=${syncMetrics.totalErrors}`);
    }

    // Load per-collection
    const { data: cols } = await supabase
      .from('sync_metrics_collections')
      .select('*')
      .eq('date', today);

    if (cols) {
      cols.forEach(row => {
        syncMetrics.syncdCollections[row.collection_name] = row.synced_count || 0;
      });
    }

    // Load recent errors (50 terakhir hari ini)
    const { data: errors } = await supabase
      .from('sync_error_log')
      .select('*')
      .gte('created_at', today + 'T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(50);

    if (errors) {
      syncMetrics.errorLog = errors.map(e => ({
        timestamp: e.created_at,
        collection: e.collection,
        operation: e.operation,
        error: e.error_message
      })).reverse();
    }

  } catch (err) {
    console.error('⚠️ Failed to load metrics from Supabase:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

function trackSyncSuccess(collection, count = 1) {
  syncMetrics.totalSynced += count;
  syncMetrics.lastSyncTime = new Date().toISOString();
  syncMetrics.syncdCollections[collection] = (syncMetrics.syncdCollections[collection] || 0) + count;
  console.log(`📊 SYNC TRACKED [${collection}]: +${count} | Total: ${syncMetrics.totalSynced}`);
  schedulePersist();
}

function trackSyncError(collection, error, operation = 'unknown') {
  syncMetrics.totalErrors++;
  syncMetrics.lastErrorTime = new Date().toISOString();

  const entry = {
    timestamp: new Date().toISOString(),
    collection,
    operation,
    error: error?.message || String(error)
  };

  syncMetrics.errorLog.push(entry);
  if (syncMetrics.errorLog.length > 100) syncMetrics.errorLog.shift();

  console.error(`❌ SYNC ERROR [${collection}]:`, error?.message || error);

  // Log ke Supabase langsung (async, tidak blocking)
  logErrorToSupabase(collection, operation, error);
  schedulePersist();
}

async function getSyncMetrics() {
  // Restore dari DB jika baru restart
  await loadTodayMetrics();

  const total = syncMetrics.totalSynced + syncMetrics.totalErrors;
  return {
    summary: {
      totalSynced: syncMetrics.totalSynced,
      totalErrors: syncMetrics.totalErrors,
      successRate: total > 0
        ? ((syncMetrics.totalSynced / total) * 100).toFixed(2) + '%'
        : 'N/A',
      lastSyncTime: syncMetrics.lastSyncTime,
      lastErrorTime: syncMetrics.lastErrorTime,
      timestamp: new Date().toISOString()
    },
    byCollection: syncMetrics.syncdCollections,
    recentErrors: syncMetrics.errorLog.slice(-10)
  };
}

async function verifyDataConsistency(collection) {
  try {
    console.log(`🔍 Checking data consistency for: ${collection}`);

    const { connectDB } = require('../db');
    const db = await connectDB();
    const dbKey = getCollectionMap(collection);
    const mongoCollection = db[dbKey];

    if (!mongoCollection) {
      return { success: false, error: `MongoDB collection not found: ${collection} (key: ${dbKey})`, collection };
    }

    const mongoCount = await mongoCollection.countDocuments();

    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Supabase not connected', collection };
    }

    const { count: supabaseCount, error } = await supabase
      .from(collection)
      .select('*', { count: 'exact', head: true });

    if (error) {
      return { success: false, error: error.message, collection, mongoCount };
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
    return { success: false, error: error.message, collection };
  }
}

async function compareSampleDocuments(collection, limit = 5) {
  try {
    const { connectDB } = require('../db');
    const db = await connectDB();
    const mongoCollection = db[getCollectionMap(collection)];
    const mongoSamples = await mongoCollection.find({}).limit(limit).toArray();

    const supabase = await getSupabaseClient();
    const { data: supabaseSamples, error } = await supabase
      .from(collection).select('*').limit(limit);

    if (error) return { success: false, error: error.message, collection };

    const comparison = {
      collection,
      mongoSampleCount: mongoSamples.length,
      supabaseSampleCount: supabaseSamples?.length || 0,
      documents: []
    };

    for (const mongoDoc of mongoSamples) {
      const mongoId = mongoDoc._id?.toString();
      const supabaseDoc = supabaseSamples?.find(d => d.id === mongoId);
      comparison.documents.push({
        mongoId,
        found: !!supabaseDoc,
        mongoFields: Object.keys(mongoDoc).length,
        supabaseFields: supabaseDoc ? Object.keys(supabaseDoc).length : 0
      });
    }

    return { success: true, ...comparison, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error.message, collection };
  }
}

async function checkAllConsistency() {
  const collections = [
    'international_channels', 'local_channels', 'tv_hospitality',
    'login_page', 'chromecast', 'auto_fix_history', 'notifications', 'staff'
  ];

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
    consistentCollections: Object.entries(results).filter(([, r]) => r.isConsistent === true).map(([n]) => n),
    inconsistentCollections: Object.entries(results).filter(([, r]) => r.isConsistent !== true).map(([n]) => n)
  };
}

async function generateSyncReport() {
  try {
    const metrics = await getSyncMetrics();
    const consistency = await checkAllConsistency();

    // Ambil history 7 hari dari Supabase
    let history = [];
    try {
      const supabase = await getSupabaseClient();
      if (supabase) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data } = await supabase
          .from('sync_metrics_summary')
          .select('*')
          .gte('date', sevenDaysAgo)
          .order('date', { ascending: false });
        history = data || [];
      }
    } catch { }

    return {
      generated: new Date().toISOString(),
      metrics,
      consistency,
      history,
      summary: {
        totalOperations: (metrics.summary.totalSynced || 0) + (metrics.summary.totalErrors || 0),
        successRate: metrics.summary.successRate,
        databaseStatus: consistency.allConsistent ? '✅ CONSISTENT' : '⚠️ INCONSISTENT',
        recommendedAction: consistency.allConsistent
          ? 'All systems operational'
          : 'Review inconsistent collections: ' + consistency.inconsistentCollections.join(', ')
      }
    };
  } catch (error) {
    return { error: error.message, timestamp: new Date().toISOString() };
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
