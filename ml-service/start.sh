#!/bin/sh
set -e

# Get PORT from environment or use default
PORT=${PORT:-8001}

echo "Starting ML Service on port $PORT..."
echo "CORS Origins: $CORS_ORIGINS"
echo "Artifacts Directory: $ARTIFACTS_DIR"

# Start uvicorn with the correct port
exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --log-level info --timeout-keep-alive 300
