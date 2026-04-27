# Supabase Integration & Real-time Sync Guide

## 📋 Overview

Setup lengkap untuk backup data MongoDB ke Supabase dengan fitur:
- ✅ Real-time synchronization two-way
- ✅ Async queue-based sync (non-blocking)
- ✅ Automatic retry logic
- ✅ Bulk operations
- ✅ Manual backup & restore API
- ✅ Sync status monitoring

---

## 🚀 Setup Instructions

### Step 1: Konfigurasi Supabase

1. **Buat project baru di Supabase:**
   - Go to https://app.supabase.com
   - Click "New Project"
   - Nama project: `iptv-backup`
   - Choose region terdekat

2. **Dapatkan credentials:**
   - Go ke Settings → API
   - Copy `Project URL` (SUPABASE_URL)
   - Copy `anon public` key (SUPABASE_KEY)
   - Copy `service_role` key untuk admin operations

3. **Setup database schema:**
   - Go ke SQL Editor
   - Copy-paste isi file: `backend/config/supabase-schema.sql`
   - Click "Run"

### Step 2: Install Dependencies

```bash
cd backend
npm install @supabase/supabase-js
```

### Step 3: Update .env

Tambahkan ke `.env`:

```env
# Supabase Configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Sync Configuration
ENABLE_SUPABASE_SYNC=true
SYNC_STRATEGY="real-time"
SYNC_INTERVAL=5000
ENABLE_TWO_WAY_SYNC=true
```

### Step 4: Integrate dengan Server

Tambahkan ke `backend/server.js`:

```javascript
// Di bagian imports (setelah imports yang ada)
const { initSupabase } = require('./config/supabase.config');

// Tambahkan route untuk backup API
app.use('/api/backup', require('./api/backup/route'));

// Initialize Supabase saat server start
const startServer = async () => {
  await initSupabase();
  
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

// Call startServer() di akhir file atau di startup function yang ada
```

---

## 💡 Cara Menggunakan

### Automatic Real-time Sync

Ketika `ENABLE_SUPABASE_SYNC=true`, setiap operasi database akan otomatis di-sync:

```javascript
// INSERT - otomatis ke Supabase
await collection.insertOne(doc);

// UPDATE - otomatis ke Supabase
await collection.updateOne(filter, { $set: updateData });

// DELETE - otomatis ke Supabase
await collection.deleteOne(filter);
```

### Manual API Endpoints

#### 1. Check Backup Status
```bash
GET /api/backup/status
```

Response:
```json
{
  "backup": {
    "enabled": true,
    "status": "Connected",
    "lastCheck": "2026-04-27T10:30:00.000Z"
  },
  "sync": {
    "enabled": true,
    "queueLength": 0,
    "isProcessing": false,
    "strategy": "real-time"
  }
}
```

#### 2. Force Sync Semua Data
```bash
POST /api/backup/force-sync
Content-Type: application/json

{
  "collection": "all"
}
```

#### 3. Force Sync Collection Tertentu
```bash
POST /api/backup/force-sync
Content-Type: application/json

{
  "collection": "international_channels"
}
```

Supported collections:
- `international_channels`
- `local_channels`
- `tv_hospitality`
- `login_page`
- `chromecast`
- `auto_fix_history`
- `notifications`
- `staff`

#### 4. Check Queue Status
```bash
GET /api/backup/queue-status
```

#### 5. Collections Info
```bash
GET /api/backup/collections-info
```

---

## 🔄 Integrasi dengan Existing db.js

Untuk menggunakan sync wrapper di db.js, modifikasi operasi INSERT/UPDATE/DELETE:

### Sebelumnya (Original):
```javascript
async function insertUser(userData) {
  const { users } = await connectDB();
  const result = await users.insertOne(userDoc);
  return result.insertedId;
}
```

### Sesudahnya (Dengan Sync):
```javascript
const { insertWithSync } = require('../utils/dbSyncWrapper');

async function insertUser(userData) {
  const { users } = await connectDB();
  const result = await insertWithSync(users, userDoc, 'login_page');
  return result.insertedId;
}
```

---

## 📊 Monitoring & Troubleshooting

### Check Sync Queue
```bash
curl http://localhost:3001/api/backup/queue-status
```

### Check Collections Size
```bash
curl http://localhost:3001/api/backup/collections-info
```

### Monitor Logs
```bash
# Terminal
tail -f logs/server.log | grep "✅\|❌\|🔄"
```

### Emergency: Clear Queue
```bash
POST /api/backup/clear-queue
```

---

## ⚙️ Configuration Options

### Sync Strategies

1. **Real-time** (Default)
   ```env
   SYNC_STRATEGY="real-time"
   ```
   - Setiap operasi langsung di-queue
   - Processed dalam batch setiap detik
   - Non-blocking, tidak mempengaruhi performance

2. **Periodic**
   ```env
   SYNC_STRATEGY="periodic"
   SYNC_INTERVAL=5000  # 5 detik
   ```
   - Sync dilakukan setiap N milliseconds
   - Lebih efficient untuk high-volume operations

3. **Manual**
   ```env
   SYNC_STRATEGY="manual"
   ```
   - Hanya sync saat dipanggil via API
   - Gunakan untuk testing atau specific scenarios

### Two-Way Sync

```env
ENABLE_TWO_WAY_SYNC=true
```

Ketika enabled:
- Changes di Supabase dapat di-replicate ke MongoDB
- Gunakan endpoint `/api/backup/restore`

---

## 🔒 Security Considerations

1. **RLS (Row Level Security)** - sudah di-setup di schema
   - Enable di Supabase untuk restrict access
   - Configure policies per table

2. **Service Role Key** - gunakan hanya di backend
   - Jangan expose di client-side
   - Gunakan untuk admin operations

3. **Anon Key** - untuk public operations
   - Bisa di-expose di client
   - RLS policies akan control access

---

## 🆘 Troubleshooting

### Sync tidak jalan
```bash
# Check env
echo $ENABLE_SUPABASE_SYNC

# Check credentials
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
  https://your-project.supabase.co/rest/v1/international_channels?limit=1
```

### Connection timeout
- Check internet connection
- Verify SUPABASE_URL format
- Check firewall/proxy settings

### Data inconsistency
```bash
# Force full resync
POST /api/backup/force-sync
{ "collection": "all" }
```

### Queue backing up
```bash
# Check queue status
GET /api/backup/queue-status

# If stuck, clear queue (data loss!)
POST /api/backup/clear-queue
```

---

## 📈 Performance Notes

- Sync queue process: **50 items per batch**
- Batch interval: **1 second**
- Max queue before warning: **10,000 items**
- Typical latency: **50-500ms**

---

## 🎯 Next Steps

1. ✅ Setup Supabase project
2. ✅ Add credentials to .env
3. ✅ Install @supabase/supabase-js
4. ✅ Run SQL schema in Supabase
5. ✅ Update server.js with new route
6. ✅ Test API endpoints
7. ✅ Monitor sync status

---

## 📞 Support

- Check logs: `backend/logs/sync.log`
- Test credentials: Run `node backend/config/supabase.config.js`
- API docs: See `/api/backup` endpoints

---

## 📝 File Structure

```
backend/
├── config/
│   ├── supabase.config.js          # Supabase connection
│   └── supabase-schema.sql         # Database schema
├── utils/
│   ├── supabaseSync.js             # Sync functions
│   └── dbSyncWrapper.js            # Wrapper untuk db ops
├── api/
│   └── backup/
│       └── route.js                # Backup API endpoints
└── .env.supabase.example           # Example env config
```

---

Generated: 2026-04-27
Version: 1.0.0
