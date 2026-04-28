/**
 * Jalankan di server: node inspect-dirty-data.js
 * Untuk cek field bermasalah di setiap koleksi MongoDB
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('iptv');

  const targets = [
    { col: 'chromecast',            key: 'chromecast' },
    { col: 'international_channels', key: 'international' },
    { col: 'local_channels',        key: 'local' },
    { col: 'tv_hospitality',        key: 'hospitality' },
    { col: 'login_page',            key: 'users' },
    { col: 'auto_fix_history',      key: 'autoFixHistory' },
  ];

  for (const { col, key } of targets) {
    const collection = db.collection(col);
    const docs = await collection.find({}).limit(3).toArray();
    
    if (docs.length === 0) {
      console.log(`\n=== ${col} === EMPTY`);
      continue;
    }

    console.log(`\n=== ${col} (sample 1 doc) ===`);
    const sample = docs[0];
    
    // Tampilkan setiap field dan tipe-nya
    for (const [k, v] of Object.entries(sample)) {
      const type = v === null ? 'null' : v instanceof Date ? 'Date' : Array.isArray(v) ? 'array' : typeof v;
      const preview = v === null ? 'null'
        : v instanceof Date ? v.toISOString()
        : Array.isArray(v) ? `[${v.length} items]`
        : typeof v === 'object' ? JSON.stringify(v).slice(0,60)
        : String(v).slice(0, 60);
      
      // Flag nilai yang mencurigakan
      const flag = (type === 'string' && v === '') ? ' ⚠️ EMPTY STRING'
        : (type === 'object' && v !== null) ? ' ⚠️ OBJECT/ARRAY'
        : '';
      
      console.log(`  ${k}: [${type}] "${preview}"${flag}`);
    }
  }

  await client.close();
  console.log('\n✅ Done');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});