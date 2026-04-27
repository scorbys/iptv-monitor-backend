# Backup & Sync API Documentation

## Base URL
```
http://localhost:3001/api/backup
```

---

## 📊 GET /api/backup/status

Get complete backup and sync status

### Request
```bash
curl -X GET http://localhost:3001/api/backup/status
```

### Response
```json
{
  "success": true,
  "backup": {
    "enabled": true,
    "status": "Connected",
    "lastCheck": "2026-04-27T10:30:00.000Z"
  },
  "sync": {
    "enabled": true,
    "twoWaySync": true,
    "queueLength": 5,
    "isProcessing": true,
    "strategy": "real-time"
  },
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### Status Codes
- `200` - OK
- `500` - Server error

---

## 🔄 POST /api/backup/force-sync

Force sync data dari MongoDB ke Supabase

### Request
```bash
curl -X POST http://localhost:3001/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'
```

### Query Parameters
- `collection` (string) - Collection name atau "all"
  - Accepted: `international_channels`, `local_channels`, `tv_hospitality`, `login_page`, `chromecast`, `auto_fix_history`, `notifications`, `staff`, `all`

### Request Body
```json
{
  "collection": "international_channels"
}
```

### Response - Single Collection
```json
{
  "success": true,
  "message": "Synced 42 documents",
  "result": {
    "success": true,
    "count": 42,
    "data": []
  },
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### Response - All Collections
```json
{
  "success": true,
  "message": "Full database sync initiated",
  "results": {
    "international_channels": {
      "success": true,
      "count": 150
    },
    "local_channels": {
      "success": true,
      "count": 45
    },
    "tv_hospitality": {
      "success": true,
      "count": 200
    },
    "login_page": {
      "success": true,
      "count": 15
    },
    "chromecast": {
      "success": true,
      "count": 30
    },
    "auto_fix_history": {
      "success": true,
      "count": 500
    },
    "notifications": {
      "success": true,
      "count": 1200
    },
    "staff": {
      "success": true,
      "count": 20
    }
  },
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Unknown collection: invalid_name"
}
```

---

## ♻️ POST /api/backup/restore

Restore data dari Supabase ke MongoDB (two-way sync)

### Request
```bash
curl -X POST http://localhost:3001/api/backup/restore \
  -H "Content-Type: application/json" \
  -d '{"collection": "international_channels"}'
```

### Request Body
```json
{
  "collection": "international_channels"
}
```

### Response
```json
{
  "success": true,
  "message": "Restore initiated for international_channels",
  "info": "Restore functionality requires two-way sync implementation",
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### Notes
- Requires `ENABLE_TWO_WAY_SYNC=true` in .env
- Restore happens asynchronously

---

## 📈 GET /api/backup/queue-status

Get current sync queue status

### Request
```bash
curl -X GET http://localhost:3001/api/backup/queue-status
```

### Response
```json
{
  "success": true,
  "queue": {
    "length": 23,
    "processing": true,
    "strategy": "real-time"
  },
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### Interpretation
- `length: 0` - All items synced, no backlog
- `length > 100` - Check performance, might need tuning
- `processing: true` - Queue is actively being processed

---

## 📋 GET /api/backup/collections-info

Get information about all collections (document count)

### Request
```bash
curl -X GET http://localhost:3001/api/backup/collections-info
```

### Response
```json
{
  "success": true,
  "collections": {
    "international_channels": 150,
    "local_channels": 45,
    "tv_hospitality": 200,
    "login_page": 15,
    "chromecast": 30,
    "auto_fix_history": 500,
    "notifications": 1200,
    "staff": 20
  },
  "totalDocuments": 3160,
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

---

## 🗑️ POST /api/backup/clear-queue

**⚠️ EMERGENCY ONLY** - Clear sync queue (potential data loss)

### Request
```bash
curl -X POST http://localhost:3001/api/backup/clear-queue
```

### Response
```json
{
  "success": true,
  "message": "Cleared 45 items from sync queue",
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

### ⚠️ Warning
- This will discard unsync'd items
- Only use if queue is stuck
- Manual sync recommended after clearing

---

## 🔍 Common Use Cases

### Case 1: Initial Backup of Everything
```bash
# 1. Check status first
curl http://localhost:3001/api/backup/status

# 2. Force sync all
curl -X POST http://localhost:3001/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "all"}'

# 3. Monitor queue
curl http://localhost:3001/api/backup/queue-status
```

### Case 2: Backup Single Collection
```bash
# Backup only international channels
curl -X POST http://localhost:3001/api/backup/force-sync \
  -H "Content-Type: application/json" \
  -d '{"collection": "international_channels"}'
```

### Case 3: Check Data Size
```bash
curl http://localhost:3001/api/backup/collections-info | jq '.collections'
```

### Case 4: Monitor Sync Health
```bash
# Create monitoring script
while true; do
  clear
  echo "=== Backup Status ==="
  curl -s http://localhost:3001/api/backup/status | jq '.'
  echo ""
  echo "=== Queue Status ==="
  curl -s http://localhost:3001/api/backup/queue-status | jq '.queue'
  sleep 5
done
```

---

## 🔐 Authentication

Currently, all endpoints are **public**. For production, add authentication:

```javascript
// In api/backup/route.js, add middleware
const authenticateToken = (req, res, next) => {
  // Your auth logic
  next();
};

router.use(authenticateToken); // Add this before routes
```

---

## ⏱️ Response Times

Typical response times:

| Endpoint | Small DB | Large DB |
|----------|----------|----------|
| `/status` | 50-100ms | 100-200ms |
| `/force-sync` | 500ms-5s | 5s-30s (async) |
| `/queue-status` | <50ms | <50ms |
| `/collections-info` | 200-500ms | 500ms-2s |
| `/clear-queue` | <10ms | <10ms |

---

## 🐛 Error Handling

### Error: "Supabase not available"
```json
{
  "success": false,
  "error": "Supabase not available"
}
```
**Solution**: Check SUPABASE_URL and SUPABASE_KEY in .env

### Error: "Unknown collection"
```json
{
  "success": false,
  "error": "Unknown collection: invalid_name"
}
```
**Solution**: Use correct collection name from the list above

### Error: "Connection timeout"
**Solution**: Check internet connection, verify Supabase credentials

---

## 📊 Example Dashboard Integration

```html
<!-- Simple status dashboard -->
<div id="backup-status"></div>

<script>
async function updateStatus() {
  const res = await fetch('/api/backup/status');
  const data = await res.json();
  
  document.getElementById('backup-status').innerHTML = `
    <div>
      <strong>Backup Status:</strong> ${data.backup.status}
      <strong>Queue:</strong> ${data.sync.queueLength} items
      <strong>Strategy:</strong> ${data.sync.strategy}
    </div>
  `;
}

// Update every 5 seconds
setInterval(updateStatus, 5000);
updateStatus();
</script>
```

---

## 📝 Logging

All sync operations are logged:

```bash
# View sync logs
tail -f backend/logs/sync.log

# Filter errors
grep "❌" backend/logs/sync.log

# Filter successes
grep "✅" backend/logs/sync.log
```

---

Generated: 2026-04-27
Version: 1.0.0
