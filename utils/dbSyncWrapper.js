/**
 * Database Sync Wrapper
 * Integrates MongoDB with Supabase for automatic real-time sync
 */

const { syncDocumentToSupabase, bulkSyncToSupabase, syncDocumentFromSupabase } = require('./supabaseSync');
const { trackSyncSuccess, trackSyncError } = require('./syncMonitor');

const ENABLE_SYNC = process.env.ENABLE_SUPABASE_SYNC === 'true';
const ENABLE_TWO_WAY_SYNC = process.env.ENABLE_TWO_WAY_SYNC === 'true';

// Sync queue untuk handle async operations tanpa blocking
const syncQueue = [];
let isSyncProcessing = false;

/**
 * Process sync queue untuk batch operations
 */
async function processSyncQueue() {
  if (isSyncProcessing || syncQueue.length === 0) return;

  isSyncProcessing = true;

  try {
    const batch = syncQueue.splice(0, 50); // Process 50 items per batch
    
    for (const item of batch) {
      try {
        if (item.type === 'bulk') {
          const result = await bulkSyncToSupabase(item.docs, item.collection, item.operation);
          if (result?.success) {
            trackSyncSuccess(item.collection, item.docs.length);
          } else {
            trackSyncError(item.collection, result?.error, `bulk_${item.operation}`);
          }
        } else {
          const result = await syncDocumentToSupabase(item.doc, item.collection, item.operation);
          if (result?.success) {
            trackSyncSuccess(item.collection, 1);
          } else {
            trackSyncError(item.collection, result?.error, item.operation);
          }
        }
      } catch (error) {
        console.error('Error in sync queue:', error);
        trackSyncError(item.collection, error, item.operation);
      }
    }
  } finally {
    isSyncProcessing = false;
    // Process remaining items
    if (syncQueue.length > 0) {
      setImmediate(processSyncQueue);
    }
  }
}

// Start processing queue every 1 second
setInterval(processSyncQueue, 1000);

/**
 * Add document to sync queue
 */
function queueSync(doc, collection, operation = 'upsert', isBulk = false) {
  if (!ENABLE_SYNC) return;

  if (isBulk) {
    syncQueue.push({
      type: 'bulk',
      docs: doc,
      collection,
      operation
    });
  } else {
    syncQueue.push({
      type: 'single',
      doc,
      collection,
      operation
    });
  }
}

/**
 * Wrapper untuk insert operations
 */
async function insertWithSync(collection, doc, collectionName) {
  try {
    const result = await collection.insertOne(doc);
    
    // Queue sync asynchronously
    if (ENABLE_SYNC) {
      queueSync(doc, collectionName, 'insert');
    }

    return result;
  } catch (error) {
    console.error(`Error inserting to ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Wrapper untuk update operations
 */
async function updateWithSync(collection, filter, updateDoc, collectionName) {
  try {
    const result = await collection.updateOne(filter, { $set: updateDoc });

    // Queue sync asynchronously - fetch updated document
    if (ENABLE_SYNC && result.modifiedCount > 0) {
      const updatedDoc = await collection.findOne(filter);
      if (updatedDoc) {
        queueSync(updatedDoc, collectionName, 'update');
      }
    }

    return result;
  } catch (error) {
    console.error(`Error updating ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Wrapper untuk delete operations
 */
async function deleteWithSync(collection, filter, collectionName) {
  try {
    // Get document before deletion for sync
    const docToDelete = ENABLE_SYNC ? await collection.findOne(filter) : null;

    const result = await collection.deleteOne(filter);

    // Queue sync asynchronously
    if (ENABLE_SYNC && result.deletedCount > 0 && docToDelete) {
      queueSync(docToDelete, collectionName, 'delete');
    }

    return result;
  } catch (error) {
    console.error(`Error deleting from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Wrapper untuk bulk insert operations
 */
async function bulkInsertWithSync(collection, docs, collectionName) {
  try {
    const result = await collection.insertMany(docs);

    // Queue bulk sync asynchronously
    if (ENABLE_SYNC) {
      queueSync(docs, collectionName, 'insert', true);
    }

    return result;
  } catch (error) {
    console.error(`Error bulk inserting to ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Wrapper untuk bulk delete operations
 */
async function bulkDeleteWithSync(collection, filter, collectionName) {
  try {
    // Get documents before deletion
    const docsToDelete = ENABLE_SYNC ? await collection.find(filter).toArray() : [];

    const result = await collection.deleteMany(filter);

    // Queue bulk sync asynchronously
    if (ENABLE_SYNC && docsToDelete.length > 0) {
      queueSync(docsToDelete, collectionName, 'delete', true);
    }

    return result;
  } catch (error) {
    console.error(`Error bulk deleting from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Force sync all data for a collection (for initial setup)
 */
async function forceSyncCollection(collection, collectionName) {
  try {
    console.log(`🔄 Starting force sync for ${collectionName}...`);

    const docs = await collection.find({}).toArray();
    console.log(`📊 Found ${docs.length} documents to sync`);

    if (docs.length === 0) {
      console.log(`✅ ${collectionName} is empty, nothing to sync`);
      return { success: true, count: 0 };
    }

    const result = await bulkSyncToSupabase(docs, collectionName, 'upsert');
    
    console.log(`✅ Force sync completed for ${collectionName}`);
    return result;
  } catch (error) {
    console.error(`Error force syncing ${collectionName}:`, error);
    return { success: false, error };
  }
}

/**
 * Get sync status and queue info
 */
function getSyncStatus() {
  return {
    enabled: ENABLE_SYNC,
    twoWaySync: ENABLE_TWO_WAY_SYNC,
    queueLength: syncQueue.length,
    isProcessing: isSyncProcessing,
    strategy: process.env.SYNC_STRATEGY || 'real-time'
  };
}

/**
 * Clear sync queue (emergency only)
 */
function clearSyncQueue() {
  const count = syncQueue.length;
  syncQueue.length = 0;
  console.log(`🗑️ Cleared ${count} items from sync queue`);
  return count;
}

module.exports = {
  insertWithSync,
  updateWithSync,
  deleteWithSync,
  bulkInsertWithSync,
  bulkDeleteWithSync,
  forceSyncCollection,
  getSyncStatus,
  clearSyncQueue,
  queueSync
};
