const { ObjectId } = require('mongodb');
const { getSupabaseClient } = require('../config/supabase.config');

/**
 * Parse berbagai format tanggal ke ISO string yang valid untuk PostgreSQL.
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }
  // Format Eropa: "DD.MM.YYYY HH:mm:ss" atau "DD.MM.YYYY"
  if (typeof value === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}/.test(value)) {
    const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (match) {
      const [, day, month, year, h = '00', m = '00', s = '00'] = match;
      const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${h}:${m}:${s}.000Z`;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  // Format "YYYY-MM-DD HH:mm:ss"
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) {
    const d = new Date(value.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Field tanggal per koleksi
 */
const DATE_FIELDS = {
  chromecast: ['lastSeen'],
  notifications: ['handlingStartTime', 'handlingEndTime', 'createdAt', 'updatedAt'],
  staff: ['joinedDate', 'createdAt', 'updatedAt'],
  login_page: ['createdAt', 'lastLogin', 'updatedAt', 'roleUpdatedAt', 'deactivatedAt'],
  international_channels: [],
  local_channels: [],
  tv_hospitality: [],
  auto_fix_history: ['createdAt', 'updatedAt', 'resolvedAt'],
};

/**
 * Field boolean per koleksi
 */
const BOOLEAN_FIELDS = {
  chromecast: ['isPingable', 'isOnline', 'screenOn'],
  notifications: ['isStartup'],
  staff: ['isActive'],
  login_page: ['isActive'],
  tv_hospitality: [],
  auto_fix_history: ['autoResolved'],
};

/**
 * Field numeric per koleksi
 */
const NUMERIC_FIELDS = {
  chromecast: ['noiseLevel', 'signalLevel', 'speedUp', 'speedDown', 'idCast'],
  notifications: ['mlConfidence'],
  auto_fix_history: ['resolutionTime'],
  login_page: ['loginCount', 'userId'],
  international_channels: ['channelNumber'],
  local_channels: ['channelNumber'],
};

/**
 * Field string yang harus null jika kosong (bukan free-text)
 */
const NULLABLE_STRING_FIELDS = {
  chromecast: ['offlineReason', 'apkVersion', 'htvVersion', 'currentApp', 'bssid'],
};

/**
 * Parse boolean — handle "TRUE", "FALSE", "", null, 0, 1
 */
function parseBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0') return false;
    return null;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
}

/**
 * Parse numeric — handle "", null, string angka, NaN
 */
function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/**
 * Convert ObjectId ke string
 */
function toStringId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof ObjectId) return value.toString();
  if (typeof value === 'object' && value._bsontype === 'ObjectId') return value.toString();
  return String(value);
}

/**
 * Convert MongoDB document to Supabase format
 */
function mongoToSupabase(doc, collectionName) {
  if (!doc) return null;

  const converted = { ...doc };

  // PRIMARY KEY: selalu gunakan _id.toString()
  if (converted._id) {
    converted.id = toStringId(converted._id);
    delete converted._id;
  }
  if (!converted.id && doc.id !== undefined) {
    converted.id = String(doc.id);
  }

  // Convert ObjectId nested ke string
  Object.keys(converted).forEach(key => {
    const val = converted[key];
    if (val instanceof ObjectId) {
      converted[key] = val.toString();
    } else if (val && typeof val === 'object' && val._bsontype === 'ObjectId') {
      converted[key] = val.toString();
    }
  });

  // Tanggal
  const dateFields = DATE_FIELDS[collectionName] || [];
  dateFields.forEach(field => {
    if (converted[field] !== undefined) {
      converted[field] = parseDate(converted[field]);
    }
  });
  Object.keys(converted).forEach(key => {
    if (converted[key] instanceof Date) {
      converted[key] = parseDate(converted[key]);
    }
  });

  // Boolean
  const boolFields = BOOLEAN_FIELDS[collectionName] || [];
  boolFields.forEach(field => {
    if (converted[field] !== undefined) {
      converted[field] = parseBoolean(converted[field]);
    }
  });

  // Numeric
  (NUMERIC_FIELDS[collectionName] || []).forEach(field => {
    if (converted[field] !== undefined) {
      converted[field] = parseNumeric(converted[field]);
    }
  });

  // Chromecast: uptime "H:MM:SS" → total detik
  if (collectionName === 'chromecast' && converted.uptime !== undefined) {
    if (typeof converted.uptime === 'string' && converted.uptime.includes(':')) {
      const parts = converted.uptime.split(':').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        converted.uptime = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else {
        converted.uptime = null;
      }
    } else {
      converted.uptime = parseNumeric(converted.uptime);
    }
  }

  // String kosong → null untuk field yang seharusnya nullable
  (NULLABLE_STRING_FIELDS[collectionName] || []).forEach(field => {
    if (converted[field] === '') converted[field] = null;
  });

  // Metadata
  converted.synced_at = new Date().toISOString();
  converted.collection_name = collectionName;

  return converted;
}

/**
 * Sync single document to Supabase
 */
async function syncDocumentToSupabase(doc, collectionName, operation = 'upsert') {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      console.warn(`⚠️ Supabase not available, skipping ${operation} for ${collectionName}`);
      return null;
    }

    const convertedDoc = mongoToSupabase(doc, collectionName);
    if (!convertedDoc) return null;

    let result;
    switch (operation) {
      case 'insert':
        result = await supabase.from(collectionName).insert([convertedDoc], { onConflict: 'id' });
        break;
      case 'update':
        result = await supabase.from(collectionName).update(convertedDoc).eq('id', convertedDoc.id);
        break;
      case 'delete':
        result = await supabase.from(collectionName).delete().eq('id', convertedDoc.id);
        break;
      case 'upsert':
      default:
        result = await supabase.from(collectionName).upsert([convertedDoc], { onConflict: 'id' });
        break;
    }

    if (result.error) {
      console.error(`❌ Supabase sync error (${operation} ${collectionName}):`, result.error.message);
      return { success: false, error: result.error };
    }

    console.log(`✅ Synced ${operation} ${collectionName}: ${convertedDoc.id}`);
    return { success: true, data: result.data };

  } catch (error) {
    console.error(`❌ Error syncing document to Supabase:`, error);
    return { success: false, error };
  }
}

/**
 * Bulk sync documents to Supabase (auto-batch per 100 docs)
 */
async function bulkSyncToSupabase(docs, collectionName, operation = 'upsert') {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      console.warn(`⚠️ Supabase not available, skipping bulk ${operation}`);
      return null;
    }

    const convertedDocs = docs
      .map(doc => mongoToSupabase(doc, collectionName))
      .filter(doc => doc !== null && doc.id);

    if (convertedDocs.length === 0) {
      return { success: true, data: [], count: 0 };
    }

    const BATCH_SIZE = 100;
    let totalSynced = 0;
    let lastError = null;

    for (let i = 0; i < convertedDocs.length; i += BATCH_SIZE) {
      const batch = convertedDocs.slice(i, i + BATCH_SIZE);
      let result;

      switch (operation) {
        case 'insert':
          result = await supabase.from(collectionName).insert(batch, { onConflict: 'id' });
          break;
        case 'delete':
          result = await supabase.from(collectionName).delete().in('id', batch.map(d => d.id));
          break;
        case 'upsert':
        default:
          result = await supabase.from(collectionName).upsert(batch, { onConflict: 'id' });
          break;
      }

      if (result.error) {
        console.error(`❌ Bulk sync error batch ${i}-${i + batch.length} (${collectionName}):`, result.error.message);
        lastError = result.error;
      } else {
        totalSynced += batch.length;
        console.log(`✅ Batch synced ${collectionName}: ${i + batch.length}/${convertedDocs.length}`);
      }
    }

    if (lastError && totalSynced === 0) {
      return { success: false, error: lastError };
    }

    console.log(`✅ Bulk sync selesai ${collectionName}: ${totalSynced}/${convertedDocs.length}`);
    return { success: true, count: totalSynced, total: convertedDocs.length };

  } catch (error) {
    console.error(`❌ Error bulk syncing to Supabase:`, error);
    return { success: false, error };
  }
}

/**
 * Sync from Supabase to MongoDB (two-way sync)
 */
async function syncDocumentFromSupabase(supabaseDoc, collectionName, mongoCollection) {
  try {
    if (!supabaseDoc || !supabaseDoc.id) return null;

    const mongoDoc = { ...supabaseDoc };
    mongoDoc._id = new ObjectId(supabaseDoc.id);
    delete mongoDoc.id;
    delete mongoDoc.synced_at;
    delete mongoDoc.collection_name;

    Object.keys(mongoDoc).forEach(key => {
      if (typeof mongoDoc[key] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(mongoDoc[key])) {
        try { mongoDoc[key] = new Date(mongoDoc[key]); } catch { }
      }
    });

    const result = await mongoCollection.updateOne(
      { _id: mongoDoc._id },
      { $set: mongoDoc },
      { upsert: true }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error(`❌ Error syncing from Supabase to MongoDB:`, error);
    return { success: false, error };
  }
}

/**
 * Get backup status
 */
async function getBackupStatus() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { enabled: false, status: 'Supabase not configured' };
    }

    const { error } = await supabase
      .from('backup_status')
      .select('count()', { count: 'exact', head: true })
      .catch(() => ({ error: null }));

    return {
      enabled: !error,
      status: error ? 'Connection error' : 'Connected',
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    return { enabled: false, status: 'Error checking backup status' };
  }
}

module.exports = {
  mongoToSupabase,
  syncDocumentToSupabase,
  bulkSyncToSupabase,
  syncDocumentFromSupabase,
  getBackupStatus
};