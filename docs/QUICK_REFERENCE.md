# 🎯 Production Sync Verification - QUICK REFERENCE

## ⚡ 30-Second Health Check

```bash
curl https://your-domain.com/api/monitoring/quick-check
```

**✅ GOOD if you see:**
```
"status": "✅ HEALTHY"
"allConsistent": true
"failed": 0
"successRate": "99%+"
```

**⚠️ ACTION if you see:**
```
"status": "⚠️ ISSUES"
"inconsistentCollections": ["some_collection"]
"failed": > 5
```

---

## 📋 Essential Endpoints to Test (In Order)

### 1️⃣ **Verify Supabase Connection**
```bash
curl https://your-domain.com/api/monitoring/quick-check
```
Expected: HTTP 200 + status field present

### 2️⃣ **Force Initial Sync (After Deploy)**
```bash
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'
```
Expected: 200 OK response

### 3️⃣ **Check Data Count Match (Verify)**
```bash
curl https://your-domain.com/api/monitoring/consistency
```
Expected: `"allConsistent": true` in response

### 4️⃣ **Compare Sample Data**
```bash
curl https://your-domain.com/api/monitoring/compare/international_channels
```
Expected: All `"match": true`

### 5️⃣ **Get Full Report**
```bash
curl https://your-domain.com/api/monitoring/report
```
Expected: Everything green ✅

---

## 🚨 If Something's Wrong

### Check Collection-Specific Consistency
```bash
# Replace with your collection name
curl https://your-domain.com/api/monitoring/consistency/international_channels
curl https://your-domain.com/api/monitoring/consistency/login_page
curl https://your-domain.com/api/monitoring/consistency/notifications
```

### View Real-time Metrics
```bash
curl https://your-domain.com/api/monitoring/sync-metrics
# Look for "byCollection" to see per-collection counts
# Look for "recentErrors" to see what failed
```

### Resync Specific Collection
```bash
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "international_channels"}'
```

---

## 📊 What Each Endpoint Returns

| Endpoint | Purpose | Response Time | What to Check |
|----------|---------|----------------|---------------|
| `/api/monitoring/quick-check` | Overall health | < 2s | `status` field |
| `/api/monitoring/sync-metrics` | Sync stats | < 1s | `totalSynced`, `successRate` |
| `/api/monitoring/consistency` | Data match | 5-10s | `allConsistent: true` |
| `/api/monitoring/consistency/:collection` | Specific match | 2-5s | `isConsistent: true` |
| `/api/monitoring/compare/:collection` | Sample verify | 3-5s | All `match: true` |
| `/api/monitoring/report` | Full report | 10-15s | `databaseStatus: ✅` |

---

## 🟢 🟡 🔴 Status Meanings

### ✅ HEALTHY (Green)
- Consistency check: ✅
- Error count: 0-2
- Success rate: > 99%
- **Action:** None, everything good

### ⚠️ ISSUES (Yellow)  
- Some collections inconsistent
- Error count: 5-20
- Success rate: 95-99%
- **Action:** Run force-sync on problematic collections

### 🔴 CRITICAL (Red)
- Multiple collections inconsistent  
- Error count: > 20
- Success rate: < 95%
- **Action:** Check logs, verify Supabase credentials

---

## 🔐 Verification Checklist

Before declaring "sync working":

```
□ /api/monitoring/quick-check returns HEALTHY
□ /api/monitoring/consistency shows allConsistent: true
□ /api/monitoring/sync-metrics shows successRate > 99%
□ /api/monitoring/compare/international_channels shows all match: true
□ /api/monitoring/compare/login_page shows all match: true
□ /api/monitoring/compare/notifications shows all match: true
□ No errors in MongoDB logs
□ No errors in Supabase logs
```

---

## 🐛 Common Issues & Fixes

| Issue | Check | Fix |
|-------|-------|-----|
| No data syncing | `totalSynced` = 0 | POST `/api/backup/force-sync` |
| Data mismatch | `variance` > 0 | POST `/api/backup/force-sync` on that collection |
| High errors | `totalErrors` > 10 | Verify credentials, check logs |
| Supabase unreachable | `status` = error | Check SUPABASE_URL, SUPABASE_KEY in .env |
| Slow sync | Check logs | Increase `SYNC_INTERVAL` or check network |

---

## 🔗 Full Endpoints Reference

**Base:** `https://your-domain.com/api/monitoring`

```
GET  /quick-check                    → Overall health
GET  /sync-metrics                   → Sync statistics
GET  /consistency                    → All collections match check
GET  /consistency/:collection        → Specific collection check
GET  /compare/:collection            → Sample document comparison
GET  /report                         → Full detailed report
```

**Backup routes:**
```
GET  /api/backup/status              → Overall backup status
POST /api/backup/force-sync          → Force sync operation
GET  /api/backup/collections-info    → Collection document counts
```

---

## 📱 Browser Monitoring

Open in browser and refresh:
```
https://your-domain.com/api/monitoring/quick-check
https://your-domain.com/api/monitoring/sync-metrics
https://your-domain.com/api/monitoring/consistency
```

For live monitoring (refresh every 5 sec):
```bash
# In terminal
while true; do 
  clear
  curl -s https://your-domain.com/api/monitoring/quick-check | jq .health
  sleep 5
done
```

---

## ✨ Success Indicators

After deployment, you should see:

1. **First 2 minutes:** Initial data syncing (`totalSynced` increasing)
2. **After 5 minutes:** `allConsistent: true` 
3. **After 10 minutes:** All collections show matching counts
4. **Ongoing:** New creates/updates syncing in real-time

---

**TL;DR:** Just hit `/api/monitoring/quick-check` → if you see `"✅ HEALTHY"` → everything works! 🎉
