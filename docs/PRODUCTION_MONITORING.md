# 🚀 Production Monitoring Guide - Supabase Sync Verification

> Panduan lengkap untuk verify data sync real-time dari MongoDB ke Supabase tanpa testing lokal

---

## 📊 **Quick Start - Monitoring Endpoints**

### **1️⃣ Quick Health Check (5 detik)**
```bash
curl https://your-domain.com/api/monitoring/quick-check
```

Response:
```json
{
  "success": true,
  "status": "✅ HEALTHY",
  "health": {
    "syncOperations": {
      "total": 156,
      "succeeded": 155,
      "failed": 1,
      "successRate": "99.36%"
    },
    "dataConsistency": {
      "allConsistent": true,
      "consistentCollections": 8,
      "inconsistentCollections": 0,
      "issues": []
    },
    "lastSyncTime": "2026-04-27T10:45:32.123Z",
    "lastErrorTime": null
  }
}
```

**✅ Status HEALTHY jika:**
- `status: "✅ HEALTHY"`
- `allConsistent: true`
- `failed: 0` atau sangat kecil
- `successRate > 95%`

---

## 🔍 **Detailed Monitoring Endpoints**

### **2️⃣ Get Sync Metrics**
Lihat jumlah data yang sudah tersinkronisasi
```bash
curl https://your-domain.com/api/monitoring/sync-metrics
```

Response:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalSynced": 1245,
      "totalErrors": 3,
      "successRate": "99.76%",
      "lastSyncTime": "2026-04-27T10:45:32.123Z",
      "lastErrorTime": "2026-04-27T10:30:15.456Z"
    },
    "byCollection": {
      "international_channels": 245,
      "local_channels": 89,
      "tv_hospitality": 142,
      "login_page": 15,
      "chromecast": 28,
      "auto_fix_history": 512,
      "notifications": 178,
      "staff": 36
    },
    "recentErrors": [
      {
        "timestamp": "2026-04-27T10:30:15.456Z",
        "collection": "notifications",
        "operation": "update",
        "error": "Network timeout"
      }
    ]
  }
}
```

**Interpretasi:**
- `totalSynced`: Jumlah operasi sync yang berhasil
- `successRate > 99%`: Sangat baik ✅
- `byCollection`: Breakdown per collection

---

### **3️⃣ Check Data Consistency ALL Collections**
Verifikasi bahwa MongoDB dan Supabase punya jumlah data yang sama
```bash
curl https://your-domain.com/api/monitoring/consistency
```

Response:
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-04-27T10:45:45.789Z",
    "results": {
      "international_channels": {
        "success": true,
        "collection": "international_channels",
        "mongoCount": 245,
        "supabaseCount": 245,
        "isConsistent": true,
        "variance": 0
      },
      "local_channels": {
        "success": true,
        "collection": "local_channels",
        "mongoCount": 89,
        "supabaseCount": 89,
        "isConsistent": true,
        "variance": 0
      },
      // ... other collections
    },
    "allConsistent": true,
    "consistentCollections": [
      "international_channels",
      "local_channels",
      "tv_hospitality",
      "login_page",
      "chromecast",
      "auto_fix_history",
      "notifications",
      "staff"
    ],
    "inconsistentCollections": []
  }
}
```

**✅ GOOD:**
- Semua `isConsistent: true`
- `allConsistent: true`
- `variance: 0` di semua collection

**⚠️ ISSUES (perlu perbaikan):**
- Ada collection dengan `variance > 0`
- `inconsistentCollections` tidak kosong

---

### **4️⃣ Check Specific Collection Consistency**
Fokus ke satu collection saja
```bash
# Check international channels
curl https://your-domain.com/api/monitoring/consistency/international_channels

# Check users
curl https://your-domain.com/api/monitoring/consistency/login_page

# Check notifications
curl https://your-domain.com/api/monitoring/consistency/notifications
```

---

### **5️⃣ Compare Sample Documents**
Verifikasi bahwa data yang tersinkronisasi sama antara MongoDB dan Supabase
```bash
# Compare 5 sample documents (default)
curl https://your-domain.com/api/monitoring/compare/international_channels

# Compare 10 sample documents
curl https://your-domain.com/api/monitoring/compare/international_channels?limit=10
```

Response:
```json
{
  "success": true,
  "data": {
    "collection": "international_channels",
    "mongoSampleCount": 5,
    "supabaseSampleCount": 5,
    "documents": [
      {
        "mongoId": "507f1f77bcf86cd799439011",
        "found": true,
        "mongoFields": 15,
        "supabaseFields": 15,
        "match": true
      },
      {
        "mongoId": "507f1f77bcf86cd799439012",
        "found": true,
        "mongoFields": 15,
        "supabaseFields": 15,
        "match": true
      }
    ]
  }
}
```

**✅ GOOD:**
- `found: true` untuk semua documents
- `match: true` untuk semua documents
- Field count sama

---

### **6️⃣ Generate Full Sync Report**
Comprehensive report dengan semua informasi
```bash
curl https://your-domain.com/api/monitoring/report
```

Response:
```json
{
  "success": true,
  "data": {
    "generated": "2026-04-27T10:46:00.123Z",
    "metrics": {
      "summary": {
        "totalSynced": 1245,
        "totalErrors": 3,
        "successRate": "99.76%",
        "lastSyncTime": "2026-04-27T10:45:32.123Z",
        "lastErrorTime": "2026-04-27T10:30:15.456Z"
      },
      "byCollection": { /* ... */ }
    },
    "consistency": {
      "allConsistent": true,
      "consistentCollections": 8,
      "inconsistentCollections": []
    },
    "summary": {
      "totalOperations": 1248,
      "successRate": "99.76%",
      "databaseStatus": "✅ CONSISTENT",
      "recommendedAction": "All systems operational"
    }
  }
}
```

---

## 🎯 **Step-by-Step Verification di Production**

### **STEP 1: Initial Verification (Deploy selesai)**

```bash
# 1. Check if Supabase is connected
curl https://your-domain.com/api/monitoring/quick-check

# Expected: status = "✅ HEALTHY" or "⚠️ ISSUES"
# If issues, check error logs
```

### **STEP 2: Force Initial Sync**

```bash
# Sync semua data MongoDB ke Supabase
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'

# Wait ~10-30 seconds untuk semuanya sync
```

### **STEP 3: Verify Data Consistency**

```bash
# Check semua collections
curl https://your-domain.com/api/monitoring/consistency

# Expected: allConsistent = true
# If false, see which collections have issues
```

### **STEP 4: Sample Document Comparison**

```bash
# Verify data keseluruhan correct
curl https://your-domain.com/api/monitoring/compare/international_channels
curl https://your-domain.com/api/monitoring/compare/login_page
curl https://your-domain.com/api/monitoring/compare/notifications

# Expected: All "found: true" dan "match: true"
```

### **STEP 5: Real-time Monitoring**

```bash
# Setup monitoring loop (bash/terminal)
watch -n 5 'curl -s https://your-domain.com/api/monitoring/quick-check | jq ".health"'

# Atau gunakan browser
# Open: https://your-domain.com/api/monitoring/sync-metrics
# Refresh setiap 10 detik untuk lihat real-time updates
```

---

## 📈 **How to Read the Metrics**

### **Sync Metrics Interpretation:**

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| `successRate` | > 99% | 95-99% | < 95% |
| `totalErrors` | 0-5 | 5-20 | > 20 |
| `variance` | 0 | 1-10 | > 10 |
| `lastSyncTime` | < 1 minute ago | 1-5 min ago | > 5 min ago |

### **Status Indicators:**

```
✅ HEALTHY
  - successRate > 99%
  - totalErrors < 5
  - allConsistent = true
  - lastSyncTime recent

⚠️ ISSUES  
  - successRate 95-99%
  - totalErrors 5-20
  - Some inconsistencies
  - lastSyncTime several minutes ago

🔴 CRITICAL
  - successRate < 95%
  - totalErrors > 20
  - allConsistent = false
  - No recent sync activity
```

---

## 🐛 **Troubleshooting**

### **Problem: Data tidak tersinkronisasi**

```bash
# 1. Check sync metrics
curl https://your-domain.com/api/monitoring/sync-metrics

# 2. If totalSynced = 0, force sync
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'

# 3. Check Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_KEY
# Pastikan tidak null
```

### **Problem: Sync errors tinggi**

```bash
# 1. Check detailed metrics
curl https://your-domain.com/api/monitoring/sync-metrics | jq '.data.recentErrors'

# 2. Check common errors:
# - Network timeout: Check internet connection
# - Auth error: Check credentials
# - Rate limit: Wait a few minutes
```

### **Problem: Data inconsistent**

```bash
# 1. Check which collections inconsistent
curl https://your-domain.com/api/monitoring/consistency | jq '.data.inconsistentCollections'

# 2. Force resync problematic collection
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "international_channels"}'

# 3. Verify consistency again
curl https://your-domain.com/api/monitoring/consistency/international_channels
```

---

## 📊 **Real-time Monitoring Dashboard (Browser)**

Buat simple HTML untuk monitor dari browser:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Sync Monitor</title>
  <style>
    body { font-family: monospace; padding: 20px; }
    .healthy { color: green; }
    .warning { color: orange; }
    .critical { color: red; }
  </style>
</head>
<body>
  <h1>Supabase Sync Monitor</h1>
  
  <div id="status"></div>
  <pre id="metrics"></pre>
  
  <script>
    async function update() {
      const res = await fetch('/api/monitoring/quick-check');
      const data = await res.json();
      
      const statusClass = data.status.includes('HEALTHY') 
        ? 'healthy' : data.status.includes('ISSUES') 
        ? 'warning' : 'critical';
      
      document.getElementById('status').innerHTML = 
        `<h2 class="${statusClass}">${data.status}</h2>
         <p>Last sync: ${data.health.lastSyncTime}</p>`;
      
      document.getElementById('metrics').textContent = 
        JSON.stringify(data.health, null, 2);
    }
    
    update();
    setInterval(update, 5000); // Update every 5 seconds
  </script>
</body>
</html>
```

---

## ✅ **Final Checklist untuk Production**

- [ ] SUPABASE_URL terisi di .env
- [ ] SUPABASE_KEY terisi di .env
- [ ] Schema SQL sudah dijalankan di Supabase
- [ ] npm install @supabase/supabase-js
- [ ] Server berjalan dengan: `npm run dev` atau `npm start`
- [ ] Bisa akses: `/api/monitoring/quick-check`
- [ ] Jalankan: `/api/backup/force-sync` untuk initial sync
- [ ] Verify consistency: `/api/monitoring/consistency`
- [ ] Compare samples: `/api/monitoring/compare/international_channels`
- [ ] Monitor lanjut dengan quick-check endpoint

---

## 📞 **Support**

Jika ada yang tidak jelas atau tidak berfungsi:

1. **Check logs:**
   ```bash
   tail -f logs/server.log | grep "SYNC\|❌\|✅"
   ```

2. **Verify credentials:**
   ```bash
   # Pastikan tidak error di console
   # Look for: "✅ Connected to Supabase"
   ```

3. **Test Supabase connection:**
   ```bash
   curl -H "Authorization: Bearer YOUR_ANON_KEY" \
     https://your-project.supabase.co/rest/v1/international_channels?limit=1
   ```

---

Generated: 2026-04-27  
Version: 1.0.0  
For: Production Deployment
