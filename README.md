# IPTV Monitoring Backend

Express backend for the IPTV Monitoring System. This service is the main gateway between the Next.js frontend, MongoDB Atlas, Telegram bot, Gemini AI, the auto-fix service, and the FastAPI ML service.

## Architecture

```text
Next.js frontend
  -> Express backend
  -> MongoDB Atlas
  -> FastAPI ML service
  -> Telegram bot / Gemini AI
  -> optional Supabase mirror
```

MongoDB Atlas is the source of truth. Supabase sync is optional legacy mirroring and should not be used as the production backup strategy.

## Tech Stack

- Node.js and Express 5
- MongoDB Atlas
- JWT and bcrypt authentication
- Google OAuth
- Telegram bot integration
- Gemini AI integration
- Optional Supabase sync mirror
- Nginx reverse proxy in the production compose stack
- FastAPI ML service in `ml-service/`

## Important Paths

```text
server.js                         Main Express server and primary route handlers
db.js                             MongoDB connection and data helpers
autofix-db.js                     Auto-fix log storage helpers
middleware/authMiddleware.js      JWT auth and admin guard
utils/                            Shared backend utilities
services/                         Auto-fix, schedulers, and domain services
api/                              Modular route handlers
scripts/                          Maintenance and migration scripts
ml-service/                       Python FastAPI ML service
docker-compose.yml                Production compose stack
nginx.conf                        Reverse proxy config
```

## Requirements

- Node.js 20 or newer
- npm
- MongoDB Atlas or a MongoDB-compatible database
- Python 3.11 or 3.12 for the ML service
- Docker and Docker Compose for the production stack

## Backend Environment

Create `.env.local` for local development:

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

For production, use `.env.production` on the server or a secret manager. Do not commit real credentials.

## Run Locally

Install dependencies:

```bash
npm install
```

Load local environment and start the backend:

```bash
set -a && . ./.env.local && set +a
npm run dev
```

Backend URL:

```text
http://localhost:3001
```

Basic health check:

```bash
curl http://localhost:3001/api/health
```

If a deployment uses a different health endpoint, check `server.js` for the active route.

## ML Service

From `backend/ml-service`:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/ml-service/.env.local`:

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

Run the ML service:

```bash
set -a && . ./.env.local && set +a
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Run the Full Local Stack

From the frontend repository root:

```bash
npm run dev:all
```

This starts:

- Next.js frontend on port 3000
- Express backend on port 3001
- FastAPI ML service on port 8001

## Backend Features

- Email/password and Google OAuth authentication.
- Role guards for admin and guest users.
- Channel, Chromecast, and Hospitality TV APIs.
- Notification lifecycle, stats, filtering, and export data.
- Auto-fix trigger, retry, history, dashboard, and stats.
- Pending auto-fix review for items that are stale, not executable, or require onsite handling.
- ML gateway for model info, training status, training, model deletion, and prediction.
- ML feedback dataset for admin corrections and retraining.
- IPTV Support Assistant chat with deterministic operational data answers and Gemini fallback.
- Telegram bot notifications and inline review actions.
- Optional Supabase sync for legacy mirror use only.

## Endpoint Access

Authenticated endpoints include:

- `/api/channels/*`
- `/api/chromecast/*`
- `/api/hospitality/*`
- `/api/notifications/*`
- `/api/network/*`
- `/api/config`
- `/api/chat/*`

Admin-only endpoints include:

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

Infrastructure or public endpoints include:

- `/health`
- `/api/status`
- `/metrics`
- `/api/ml/health`
- auth login/register/OAuth callback

`/api/internal/*` requires a valid JWT or an `x-internal-token` generated by the backend for server-to-server integration such as the Telegram bot.

## Auto-Fix Flow

1. A device or notification produces an issue category.
2. The backend calls the ML service for classification when needed.
3. The auto-fix service chooses the action.
4. Executable actions are run automatically when safe.
5. Onsite-only or stale actions are moved into pending review.
6. Results are stored in auto-fix history with device metadata.
7. The frontend displays that history in ML Dashboard and device detail pages.

Manual auto-fix buttons should only stay enabled when the category/action can be handled remotely. Onsite-only categories should be disabled or routed to review/manual handling.

## ML Training, Feedback, and QoS

The uploaded XLSX training file trains the classifier and recommended-fix mapping. It does not directly rewrite QoS data.

QoS is calculated from stored notifications and device/network metrics. After retraining, future classifications can affect future notification categories and auto-fix analytics. Historical QoS data only changes if historical notification data is explicitly regenerated or reclassified.

Admins can improve the model without an LLM through the feedback flow:

1. Review incorrect predictions or add corrected samples in ML Dashboard.
2. Approve or reject feedback.
3. Export approved feedback as a dataset.
4. Retrain the ML model with curated data.

This workflow reduces label noise and keeps model evolution controlled.

## Database and Backup

MongoDB Atlas is the production source of truth. Use MongoDB Atlas backups/snapshots or a MongoDB-native backup strategy for restore-capable backups.

Supabase sync is optional and disabled by default in example configuration. Supabase free-tier projects can become inactive after inactivity, so it should not be used as the only production backup.

## Docker and Production

Production uses:

- `Dockerfile` for the backend Node.js app.
- `Dockerfile.nginx` for Nginx reverse proxy.
- `Dockerfile.prometheus` for Prometheus with route-prefix support.
- `docker-compose.yml` for backend, ML service, Nginx, Prometheus, Grafana, Jenkins, and exporters.

Run from `backend/`:

```bash
docker compose up -d --build
```

Logs:

```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f ml-service
```

## Reverse Proxy Paths

Nginx routes production services:

- `/api/*` to the backend.
- `/grafana/` to Grafana.
- `/prometheus/` to Prometheus.
- `/jenkins/` to Jenkins.

If Grafana or Jenkins login fails under a subpath, check `nginx.conf`, the service root URL, route prefix, and cookie path settings.

## Cloudflare Tunnel on the VPS

Production public access is routed through Cloudflare Tunnel to the VPS reverse proxy. The VPS uses:

- `cloudflared.service` with automatic restart.
- `cloudflared-watchdog.timer` for local tunnel health checks.
- `cloudflared-refresh.timer` for periodic connector refresh.

Diagnostics:

```bash
systemctl status cloudflared --no-pager -l
systemctl list-timers 'cloudflared-*' --no-pager
journalctl -u cloudflared -n 100 --no-pager
journalctl -t cloudflared-watchdog -n 50 --no-pager
```

Cloudflare SSH tunneling depends on Cloudflare Access/plan capabilities. If Access is not available, keep an alternate admin path such as a direct LAN/VMware route, Windows host remote access, Tailscale, or ZeroTier.

## Validation Before Deployment

Syntax checks:

```bash
node --check server.js
node --check api/auto-fix/route.js
node --check api/backup/route.js
node --check api/monitoring/route.js
node --check api/ml/predict/route.js
node --check services/autoFixService.js
```

From the frontend root, run:

```bash
npm run build
```

## Jenkins and Branch Deployment

The Jenkins pipeline can build either `main` or `dev` depending on job parameters. A multibranch pipeline is recommended when both branches should auto-build from GitHub webhooks.

For a parameterized single pipeline, ensure the selected branch is passed consistently to checkout and deploy stages. Otherwise the job may trigger on `dev` and then deploy `main`.

## Deploying Dev

```bash
git switch dev
git push origin dev
```

If the remote `dev` branch intentionally needs to be reset to match the latest `main`:

```bash
git push --force-with-lease origin dev:dev
```

Use `--force-with-lease`, not `--force`, so the push fails if the remote branch changed after the last fetch.
