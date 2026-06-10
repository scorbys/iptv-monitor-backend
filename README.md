# IPTV Monitoring Backend

Backend Express untuk IPTV Monitoring System. Service ini menjadi gateway utama antara frontend, MongoDB, Telegram bot, Gemini AI, auto-fix service, dan FastAPI ML service.

## Stack

- Node.js + Express 5
- MongoDB Atlas
- JWT + bcrypt authentication
- Google OAuth
- Telegram bot integration
- Gemini AI integration
- Optional Supabase sync mirror (not a backup source of truth)
- Nginx reverse proxy for production compose stack
- FastAPI ML service di `ml-service/`

## Struktur Penting

```text
server.js                         Main Express server and primary route handlers
db.js                             MongoDB connection and data access helpers
autofix-db.js                     Auto-fix log storage helpers
middleware/authMiddleware.js      JWT auth and admin guard
utils/                            Shared backend utilities
services/                         Auto-fix, schedulers, and domain services
api/                              Modular route handlers
ml-service/                       Python FastAPI ML service
docker-compose.yml                Production compose stack
nginx.conf                        Reverse proxy config
```

## Prasyarat

- Node.js 20 atau lebih baru
- npm
- MongoDB Atlas atau MongoDB compatible database
- Python 3.11/3.12 untuk ML service
- Docker dan Docker Compose untuk production stack

## Environment Backend

Buat file `.env.local` untuk development lokal:

```env
NODE_ENV=development
PORT=3001
PUBLIC_BASE_URL=http://localhost:3001
BASE_URL=http://localhost:3001
INTERNAL_API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
COOKIE_DOMAIN=

JWT_SECRET=change-me-for-local-development
MONGO_URL=mongodb+srv://user:password@cluster.example.mongodb.net/?retryWrites=true&w=majority

ML_SERVICE_URL=http://localhost:8001
ML_SERVICE_TIMEOUT=60000

GEMINI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TELEGRAM_BOT_TOKEN=

SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENABLE_SUPABASE_SYNC=false
ENABLE_TWO_WAY_SYNC=false
SYNC_STRATEGY=manual
SYNC_INTERVAL=5000
```

Untuk production, gunakan `.env.production` atau secret manager di server/deployment platform. Jangan commit credential asli.

## Menjalankan Backend Lokal

Install dependency:

```bash
npm install
```

Jalankan backend:

```bash
set -a && . ./.env.local && set +a
npm run dev
```

Backend akan berjalan di:

```text
http://localhost:3001
```

Health check dasar:

```bash
curl http://localhost:3001/api/health
```

Jika endpoint health berbeda pada deployment tertentu, cek `server.js` untuk route health yang aktif.

## Menjalankan ML Service Lokal

Masuk ke folder ML service:

```bash
cd ml-service
```

Buat virtual environment dengan Python 3.11/3.12:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Buat `ml-service/.env.local`:

```env
PORT=8001
ML_SERVICE_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
ARTIFACTS_DIR=./artifacts
DATA_DIR=./data
LOG_LEVEL=info
PYTHONUNBUFFERED=1
UVICORN_RELOAD=0
```

Jalankan:

```bash
set -a && . ./.env.local && set +a
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Menjalankan Semua Service dari Root

Dari root repository frontend:

```bash
npm run dev:all
```

Command ini menjalankan:

- Next.js frontend di port 3000
- Express backend di port 3001
- FastAPI ML service di port 8001

## Fitur Backend

- Auth email/password dan Google OAuth.
- Role guard untuk admin dan guest.
- Channel, Chromecast, dan Hospitality TV APIs.
- Notification lifecycle dan stats.
- Auto-fix trigger, retry, history, dashboard, dan stats.
- ML gateway untuk model info, train status, train, delete model, dan prediction.
- ML feedback dataset untuk koreksi admin dan retraining dataset.
- Telegram notification bot.
- Optional Supabase sync untuk mirror data legacy. MongoDB tetap source of truth.

## Endpoint dan Akses

Endpoint utama yang wajib login:

- `/api/channels/*`
- `/api/chromecast/*`
- `/api/hospitality/*`
- `/api/notifications/*`
- `/api/network/*`
- `/api/config`
- `/api/chat/*`

Endpoint admin-only:

- `/api/users/*`
- `/api/staff/*`
- `/api/ml/model/*`
- `/api/ml/predict/*`
- `/api/ml/feedback/*`
- `/api/auto-fix/history`, `/api/auto-fix/stats`, `/api/auto-fix/dashboard`
- `/api/auto-fix/trigger`, `/api/auto-fix/process-*`
- `/api/backup/*`
- `/api/monitoring/*`
- `/api/debug/routes`
- device manual auto-fix endpoints

Endpoint yang sengaja tetap terbuka atau digunakan oleh infrastructure:

- `/health`
- `/api/status`
- `/metrics`
- `/api/ml/health`
- auth login/register/OAuth callback

`/api/internal/*` hanya boleh diakses dengan JWT valid atau `x-internal-token`
yang dibuat oleh backend untuk server-to-server integration seperti Telegram bot.

## Database dan Backup

MongoDB Atlas adalah database utama dan source of truth untuk data operasional.
Backup production sebaiknya memakai fitur backup/snapshot MongoDB Atlas atau
mekanisme backup database MongoDB lain yang memang didesain untuk restore.

Supabase pada project ini hanya integrasi opsional untuk mirror/sync legacy,
bukan backup database utama. Default `.env.example` mematikan Supabase sync
karena free tier Supabase bisa inactive jika tidak ada aktivitas, sehingga tidak
aman dijadikan satu-satunya cadangan production.

## Auto-Fix Flow

1. Device atau notifikasi menghasilkan issue category.
2. Backend memanggil ML service untuk klasifikasi bila diperlukan.
3. Auto-fix service menentukan action yang sesuai.
4. Hasil auto-fix disimpan ke `auto_fix_history` dengan metadata device.
5. Frontend menampilkan riwayat ini di ML dashboard dan halaman detail Channel/TV/Chromecast.

Pending auto-fix yang tidak executable atau butuh onsite handling akan muncul
sebagai item review di ML Dashboard. Admin bisa approve menjadi manual required
atau reject/cancel jika item tersebut stale/tidak valid.

## ML Feedback Flow

Admin dapat menambahkan koreksi dataset dari ML Dashboard:

1. Masukkan teks keluhan atau hasil prediksi yang keliru.
2. Pilih kategori yang benar dan outcome fix.
3. Feedback masuk status `pending_review`.
4. Admin approve/reject feedback.
5. Feedback approved dapat diekspor sebagai dataset tambahan untuk retraining.

Flow ini membuat ML service bisa berkembang tanpa LLM, tetapi retraining tetap
harus dilakukan dengan dataset yang sudah dikurasi agar kualitas model tidak
turun karena label noise.

## Docker/Production

Production stack menggunakan:

- `Dockerfile` untuk backend Node.js
- `Dockerfile.nginx` untuk Nginx reverse proxy
- `Dockerfile.prometheus` untuk Prometheus dengan route prefix
- `docker-compose.yml` untuk backend, ML service, Nginx, Prometheus, Grafana, Jenkins, dan exporter terkait

Jalankan compose dari folder backend:

```bash
docker compose up -d --build
```

Lihat log:

```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f ml-service
```

## Reverse Proxy Paths

Nginx mengatur akses ke service production, termasuk:

- `/api/*` ke backend
- `/grafana/` ke Grafana
- `/prometheus/` ke Prometheus
- `/jenkins/` ke Jenkins

Jika Grafana atau Jenkins gagal login di subpath, cek kombinasi `nginx.conf`, environment `root_url`/prefix service, dan cookie path service terkait.

## Cloudflare Tunnel di VPS

Production web diakses melalui Cloudflare Tunnel ke Nginx pada port internal.
Untuk mengurangi insiden `Error 1033`, VPS memakai:

- `cloudflared.service` dengan `Restart=always`.
- `cloudflared-watchdog.timer` untuk cek metrics lokal tunnel.
- `cloudflared-refresh.timer` untuk refresh connector berkala.

Jika 1033 masih bertahan lebih dari 1-2 menit, cek:

```bash
systemctl status cloudflared --no-pager -l
systemctl list-timers 'cloudflared-*' --no-pager
journalctl -u cloudflared -n 100 --no-pager
journalctl -t cloudflared-watchdog -n 50 --no-pager
```

SSH via Cloudflare Access bergantung pada fitur/plan Cloudflare. Untuk opsi
free yang lebih stabil, gunakan akses admin alternatif seperti Tailscale/ZeroTier
atau remote host Windows/VMware.

## Validasi Sebelum Deploy

```bash
node --check server.js
node --check api/auto-fix/route.js
node --check api/backup/route.js
node --check api/monitoring/route.js
node --check api/ml/predict/route.js
node --check services/autoFixService.js
```

Untuk frontend, jalankan dari root:

```bash
npm run build
```

## Deploy Branch Dev

```bash
git switch dev
git push origin dev
```

Jika branch remote `dev` sengaja harus disamakan dengan `main` yang terbaru:

```bash
git push --force-with-lease origin dev:dev
```

Gunakan `--force-with-lease`, bukan `--force`, supaya push gagal bila remote berubah sejak fetch terakhir.
