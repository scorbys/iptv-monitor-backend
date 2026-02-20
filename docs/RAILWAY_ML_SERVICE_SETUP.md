# Railway ML Service Setup Guide

## Masalah dan Solusi

### Problem: Health Check Fails
Error: `1/1 replicas never became healthy!`

**Root Cause:**
1. Anda set `ML_SERVICE_HOST="https://iptv-monitor-ml.up.railway.app"` di Railway dashboard
2. Health check gagal karena service tidak bisa diakses
3. Port mismatch antara config dan Railway's PORT

### Penjelasan Penting

#### 1. ML_SERVICE_HOST harus `0.0.0.0`, BUKAN URL!

❌ **SALAH:**
```bash
ML_SERVICE_HOST="https://iptv-monitor-ml.up.railway.app"
```

✅ **BENAR:**
```bash
ML_SERVICE_HOST="0.0.0.0"
```

**Kenapa?**
- `ML_SERVICE_HOST` adalah **bind address** untuk uvicorn di dalam container
- `0.0.0.0` berarti "listen on ALL network interfaces"
- URL seperti `https://iptv-monitor-ml.up.railway.app` adalah **external URL**, bukan bind address
- Jika Anda gunakan URL sebagai host, uvicorn akan gagal start

#### 2. Railway Port Handling

Railway secara otomatis menyediakan environment variable `PORT`. JANGAN set `ML_SERVICE_PORT` di Railway dashboard!

**Di Dockerfile:**
```dockerfile
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001} --workers 1"]
```

Ini akan:
1. Cek environment variable `PORT` dari Railway
2. Jika tidak ada, fallback ke `8001`
3. Railway akan otomatis routing traffic ke port ini

## Setup di Railway Dashboard

### Langkah 1: Environment Variables

Di Railway Dashboard > ML Service > Variables, set:

```bash
# ⚠️ PENTING: JANGAN set ML_SERVICE_PORT atau PORT!
# Railway akan otomatis provide PORT

# Service Configuration
ML_SERVICE_HOST=0.0.0.0

# CORS Configuration (comma-separated, NO spaces)
CORS_ORIGINS=https://iptv-monitor.vercel.app,https://iptv-monitor-backend-production.up.railway.app,https://iptv-monitor-ml.up.railway.app

# Paths
ARTIFACTS_DIR=./artifacts
DATA_DIR=./data

# Logging
LOG_LEVEL=info

# Python
PYTHONUNBUFFERED=1
```

### Langkah 2: Volume Setup (Opsional tapi Disarankan)

Untuk ML artifacts yang besar:

1. Di Railway Dashboard > ML Service > Variables
2. Scrol down ke "Volumes"
3. Create volume:
   - **Path**: `/app/artifacts`
   - **Name**: `ml_artifacts`

4. Upload artifacts menggunakan Railway CLI:
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Pilih project
railway project cd

# Upload artifacts (jika Anda punya file .pkl)
railway volume upload ml_artifacts -f backend/ml-service/artifacts/*.pkl
```

### Langkah 3: Redeploy

Setelah mengubah environment variables:

1. Klik "Deploy" button di Railway dashboard
2. Atau trigger deploy via git push
3. Tunggu deployment selesai (~1-2 menit)

### Langkah 4: Verify Deployment

Cek health endpoint:

```bash
# Ganti dengan actual Railway URL
curl https://iptv-monitor-ml.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "IPTV ML Prediction Service",
  "model_loaded": false  // atau true jika artifacts uploaded
}
```

## Troubleshooting

### Problem: Health check fails
**Solution:**
1. Pastikan `ML_SERVICE_HOST=0.0.0.0` (bukan URL!)
2. JANGAN set `ML_SERVICE_PORT` di Railway dashboard
3. Cek logs: `railway logs` atau di dashboard

### Problem: Model not loaded
**Solution:**
1. Upload artifacts ke volume `/app/artifacts`
2. Atau train model melalui endpoint: `POST /api/model/train`

### Problem: CORS error
**Solution:**
1. Tambahkan domain frontend/backend ke `CORS_ORIGINS`
2. Pastikan format: comma-separated, NO spaces
3. Contoh: `https://domain1.com,https://domain2.com`

### Problem: Service tidak bisa diakses dari backend
**Solution:**
1. Pastikan backend URL ada di `CORS_ORIGINS`
2. Cek security group / network policy di Railway
3. Verify service healthy: curl `/health` endpoint

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Railway Infrastructure                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              ML Service Container                     │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Uvicorn (FastAPI)                             │  │  │
│  │  │  Host: 0.0.0.0  (ALL interfaces) ✅            │  │  │
│  │  │  Port: ${PORT:-8001} (Railway's PORT)          │  │  │
│  │  └──────────────┬─────────────────────────────────┘  │  │
│  │                 │                                      │  │
│  │                 ▼                                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Container Network                             │  │  │
│  │  │  eth0: Railway internal network                │  │  │
│  │  │  Public URL: https://iptv-monitor-ml.up...    │  │  │
│  │  └──────────────┬─────────────────────────────────┘  │  │
│  └─────────────────┼──────────────────────────────────────┘  │
│                    │                                           │
│                    ▼                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Railway Proxy / Load Balancer                │   │
│  │         Routes external traffic to container         │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                         │
└─────────────────────┼─────────────────────────────────────────┘
                      │
                      │ Accessible from:
                      │ - Frontend (Vercel)
                      │ - Backend (Railway)
                      │ - Public internet
                      ▼
              Internet / Railway Network
```

## Environment Variables Reference

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `PORT` | Auto-set by Railway | ❌ Don't set! | Railway provides this |
| `ML_SERVICE_HOST` | `0.0.0.0` | ✅ Yes | NOT a URL! |
| `ML_SERVICE_PORT` | Don't set in Railway | ❌ Don't set! | Use Dockerfile default |
| `CORS_ORIGINS` | Comma-separated URLs | ✅ Yes | NO spaces between URLs |
| `ARTIFACTS_DIR` | `./artifacts` | ✅ Yes | Relative path |
| `DATA_DIR` | `./data` | ✅ Yes | Relative path |
| `LOG_LEVEL` | `info` | ❌ Optional | debug, info, warning, error |
| `PYTHONUNBUFFERED` | `1` | ✅ Yes | Python output buffering |

## Quick Checklist

Sebelum deploy ke Railway:

- [ ] `ML_SERVICE_HOST=0.0.0.0` (bukan URL!)
- [ ] JANGAN set `ML_SERVICE_PORT` di Railway dashboard
- [ ] `CORS_ORIGINS` includes frontend & backend URLs
- [ ] Volume `/app/artifacts` created (jika perlu)
- [ ] Artifacts uploaded (jika perlu)
- [ ] Health check path: `/health`
- [ ] Railway redeploy triggered

Setelah deploy:

- [ ] Health check returns 200 OK
- [ ] Service accessible via Railway URL
- [ ] Logs show no errors
- [ ] Backend can call ML service endpoints
