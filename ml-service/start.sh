#!/bin/sh
set -e

echo "=== Railway ML Service Startup Script ==="

# Get PORT from environment or use default (Railway sets PORT automatically)
PORT=${PORT:-8080}

echo "Configuration:"
echo "  PORT: $PORT"
echo "  HOST: 0.0.0.0"
echo "  WORKERS: 1"
echo "  CORS Origins: $CORS_ORIGINS"
echo "  Artifacts Directory: $ARTIFACTS_DIR"
echo "=========================================="

# Wait a moment to ensure network is ready
echo "Waiting for network to be ready..."
sleep 2

# Start uvicorn with explicit settings
echo "Starting Uvicorn server..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port $PORT \
    --workers 1 \
    --log-level info \
    --timeout-keep-alive 300 \
    --loop uvloop \
    --no-access-log
