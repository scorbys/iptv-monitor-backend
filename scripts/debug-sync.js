/**
 * Debug script: test insert satu dokumen per koleksi yang gagal
 * Jalankan: node scripts/debug-sync.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient, ObjectId } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Sama persis dengan supabaseSync.js
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  if (typeof value === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}/.test(value)) {
    const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (match) {
      const [, day, month, year, h='00', m='00', s='00'] = match;
      const d = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${h}:${m}:${s}.000Z`);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  try { const d = new Date(value); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; }
}
function parseBoolean(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') { const l = v.toLowerCase().trim(); if (l==='true'||l==='yes'||l==='1') return true; if (l==='false'||l==='no'||l==='0') return false; }
  if (v===1) return true; if (v===0) return false; return null;
}
function parseNumeric(v) {
  if (v===null||v===undefined||v==='') return null;
  if (typeof v==='number') return isNaN(v)?null:v;
  const n=Number(v); return isNaN(n)?null:n;
}

function convertDoc(doc, collectionName) {
  const converted = { ...doc };
  if (converted._id) { converted.id = converted._id.toString(); delete converted._id; }
  if (!converted.id && doc.id !== undefined) converted.id = String(doc.id);

  Object.keys(converted).forEach(key => {
    const val = converted[key];
    if (val && typeof val === 'object' && (val._bsontype === 'ObjectId' || val instanceof ObjectId)) {
      converted[key] = val.toString();
    }
  });

  // Date fields
  const dateFields = { login_page: ['createdAt','lastLogin','updatedAt','roleUpdatedAt','deactivatedAt'], auto_fix_history: ['createdAt','updatedAt','resolvedAt'] };
  (dateFields[collectionName]||[]).forEach(f => { if (converted[f]!==undefined) converted[f]=parseDate(converted[f]); });
  Object.keys(converted).forEach(k => { if (converted[k] instanceof Date) converted[k]=parseDate(converted[k]); });

  // Numerics
  const numericFields = { login_page: ['loginCount','userId'], international_channels: ['channelNumber'], local_channels: ['channelNumber'] };
  (numericFields[collectionName]||[]).forEach(f => { if (converted[f]!==undefined) converted[f]=parseNumeric(converted[f]); });

  converted.synced_at = new Date().toISOString();
  converted.collection_name = collectionName;
  return converted;
}

async function testCollection(mongoDb, mongoColName, supabaseTable) {
  const col = mongoDb.collection(mongoColName);
  const sample = await col.findOne({});
  if (!sample) { console.log(`\n[${supabaseTable}] EMPTY — skip`); return; }

  const converted = convertDoc(sample, supabaseTable);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${supabaseTable}] Converted doc fields:`);
  for (const [k, v] of Object.entries(converted)) {
    const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    console.log(`  ${k}: [${type}] = ${JSON.stringify(v)?.slice(0,80)}`);
  }

  console.log(`\n[${supabaseTable}] Attempting upsert...`);
  const { data, error } = await supabase
    .from(supabaseTable)
    .upsert([converted], { onConflict: 'id' });

  if (error) {
    console.log(`❌ ERROR: code=${error.code}`);
    console.log(`   message=${error.message}`);
    console.log(`   details=${error.details}`);
    console.log(`   hint=${error.hint}`);
  } else {
    console.log(`✅ SUCCESS`);
  }
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('iptv');

  const targets = [
    { mongo: 'international_channels', supabase: 'international_channels' },
    { mongo: 'local_channels',         supabase: 'local_channels' },
    { mongo: 'tv_hospitality',         supabase: 'tv_hospitality' },
    { mongo: 'login_page',             supabase: 'login_page' },
    { mongo: 'auto_fix_history',       supabase: 'auto_fix_history' },
  ];

  for (const { mongo, supabase: supa } of targets) {
    await testCollection(db, mongo, supa);
  }

  await client.close();
  console.log('\n✅ Debug selesai');
}

main().catch(e => { console.error(e); process.exit(1); });