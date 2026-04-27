# 🚀 Deployment Action Plan - Production

## ⚡ Sebelum Deploy

### ✅ Pre-Deployment Checklist

- [ ] `.env` sudah update dengan:
  - `SUPABASE_URL="https://xxxxx.supabase.co"`
  - `SUPABASE_KEY="eyJhbGc..."`
  - `ENABLE_SUPABASE_SYNC=true`

- [ ] Di Supabase SQL Editor sudah jalankan `supabase-schema.sql`

- [ ] Dependency sudah install:
  ```bash
  npm install @supabase/supabase-js
  ```

- [ ] server.js sudah update dengan monitoring route

---

## 📦 Deployment Steps

### Step 1: Deploy Backend
```bash
# Push to production (Vercel/Railway/Docker/etc)
git add .
git commit -m "Add Supabase sync monitoring"
git push origin main
```

### Step 2: Verify Initial Sync (Dalam 2 menit setelah deploy)
```bash
# Test endpoint
curl https://your-domain.com/api/monitoring/quick-check

# Expected: HTTP 200 response
```

### Step 3: Force Initial Sync
```bash
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'

# Expected: HTTP 200, response with results
# Wait 30-60 seconds for initial sync
```

### Step 4: Verify Data Consistency (Setelah 1 menit)
```bash
curl https://your-domain.com/api/monitoring/consistency

# Expected: "allConsistent": true
```

### Step 5: Sample Verification (Optional tapi recommended)
```bash
curl https://your-domain.com/api/monitoring/compare/international_channels
curl https://your-domain.com/api/monitoring/compare/login_page
curl https://your-domain.com/api/monitoring/compare/notifications

# Expected: All documents have "match": true
```

---

## 🔍 Monitoring dalam 24 Jam Pertama

### Jam 0-15 Minutes (Critical)
- [ ] Backend deploy successful
- [ ] `/api/monitoring/quick-check` returns 200
- [ ] Force sync initiated
- [ ] Watch logs for errors

### Jam 15 Minutes - 1 Hour (Verification)
- [ ] Consistency check shows allConsistent: true
- [ ] Sample documents match
- [ ] No major errors in logs
- [ ] Real-time operations working (test create/update)

### Jam 1-6 Hours (Monitoring)
- [ ] New creates/updates syncing
- [ ] No spike in errors
- [ ] Success rate > 99%
- [ ] Data counts consistent

### Jam 6-24 Hours (Stabilization)
- [ ] Continuous monitoring
- [ ] Check periodic sync metrics
- [ ] Verify no data loss

---

## 📊 Monitoring Script untuk DevOps/Terminal

### Real-time Health Check (Linux/Mac)
```bash
watch -n 5 'curl -s https://your-domain.com/api/monitoring/quick-check | jq ".health"'
```

### Full Report Loop (Linux/Mac)
```bash
while true; do
  clear
  echo "=== Supabase Sync Status ==="
  echo "Time: $(date)"
  curl -s https://your-domain.com/api/monitoring/quick-check | jq '.'
  echo ""
  echo "Next update in 10 seconds..."
  sleep 10
done
```

### PowerShell (Windows)
```powershell
while ($true) {
  Clear-Host
  "=== Supabase Sync Status ==="
  "Time: " + (Get-Date)
  Invoke-RestMethod -Uri "https://your-domain.com/api/monitoring/quick-check" | ConvertTo-Json
  "Next update in 10 seconds..."
  Start-Sleep -Seconds 10
}
```

---

## 🚨 Jika Ada Issues

### Issue: Data tidak sync

**Check points:**
```bash
# 1. Verify Supabase connection
curl https://your-domain.com/api/monitoring/quick-check

# 2. Check sync metrics  
curl https://your-domain.com/api/monitoring/sync-metrics
# Look at totalSynced, totalErrors

# 3. Check specific collection
curl https://your-domain.com/api/monitoring/consistency/international_channels

# 4. Check logs
# Look for: "Connected to Supabase" ✓
# Look for: "❌ Sync Error"
```

**Fix:**
```bash
# Resync all data
curl -X POST https://your-domain.com/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'

# Wait 1-2 minutes, then verify
curl https://your-domain.com/api/monitoring/consistency
```

### Issue: High error rate (> 5%)

**Debug:**
```bash
curl https://your-domain.com/api/monitoring/sync-metrics | jq '.data.recentErrors'
# Look for pattern in errors
```

**Common causes:**
- Network timeout → Check internet
- Auth error → Verify SUPABASE_KEY
- Rate limit → Wait 5-10 minutes
- Schema mismatch → Verify SQL ran successfully

### Issue: Supabase connection failed

**Verify credentials:**
```bash
# Check if variables set (should not be empty)
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Test Supabase direct
curl -H "Authorization: Bearer YOUR_KEY" \
  https://your-project.supabase.co/rest/v1/international_channels?limit=1
```

---

## ✅ Sign-off Criteria (Success = All True)

- [ ] `/api/monitoring/quick-check` returns `status: "✅ HEALTHY"`
- [ ] `allConsistent: true` dalam consistency check
- [ ] `successRate > 99%` dalam sync metrics  
- [ ] No unresolved errors in recent 5 errors log
- [ ] Sample documents comparison shows `match: true`
- [ ] New data (created post-deploy) appears in Supabase within 5 seconds
- [ ] No critical errors in application logs

---

## 📈 Performance Expectations

| Metric | Expected | Threshold |
|--------|----------|-----------|
| Sync latency | < 1 second | Acceptable: < 5s |
| Success rate | > 99.9% | Minimum: > 95% |
| Data consistency | 100% match | Acceptable: > 99% |
| Query time | < 100ms | Acceptable: < 500ms |
| Error rate | < 0.1% | Acceptable: < 5% |

---

## 🔄 Ongoing Maintenance

### Daily (Automated)
- Monitor `/api/monitoring/quick-check`
- Alert if status != "HEALTHY"
- Track error trends

### Weekly
- Run full consistency check
- Review sync metrics report
- Check for data anomalies

### Monthly  
- Archive logs
- Analyze trends
- Optimize if needed

---

## 📞 Troubleshooting Contacts

**If issues persist:**

1. Check backend logs:
   ```bash
   # Docker logs
   docker logs your-backend-container
   
   # Or check platform logs (Vercel/Railway/etc)
   ```

2. Check Supabase status:
   - Visit: https://status.supabase.com
   - Check for outages

3. Verify MongoDB:
   - Check MongoDB Atlas status
   - Verify connection string

4. Test API manually:
   ```bash
   # Create test record
   curl -X POST https://your-domain.com/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","email":"test@test.com","password":"123456"}'
   
   # Verify in Supabase
   curl https://your-domain.com/api/monitoring/compare/login_page
   ```

---

## 📋 Post-Deploy Verification Checklist

After you mark all steps complete, have someone verify:

```
□ System shows as HEALTHY
□ New records sync instantly  
□ Existing records match between DBs
□ Updates sync in real-time
□ Deletes sync properly
□ No data loss observed
□ Performance acceptable
□ Error rate < 1%
```

---

## 🎯 Timeline

| Time | Action | Expected Result |
|------|--------|-----------------|
| T+0 | Deploy | Backend online |
| T+2min | Quick check | 200 OK |
| T+5min | Force sync | Initial data syncing |
| T+10min | Consistency check | allConsistent: true |
| T+30min | Sample compare | All documents match |
| T+1hr | Full report | ✅ HEALTHY status |
| T+6hr | Monitor | Stable sync |
| T+24hr | Review | All good, go to production support |

---

## 🎉 Success!

If you're here and everything checks out:

```
✅ MongoDB ↔ Supabase sync working
✅ Real-time synchronization active  
✅ Data consistency verified
✅ Error rate acceptable
✅ Production ready!
```

**Congratulations! 🚀**

Now you have:
- Real-time backup to Supabase
- 24/7 data redundancy
- Production monitoring
- Disaster recovery ready

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-04-27  
**Status:** Production Ready
