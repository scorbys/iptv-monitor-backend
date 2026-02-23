# Dockerfile untuk Railway ML Service Deployment
# Base image with Python 3.10 (smaller than 3.14, more stable)
FROM python:3.10-slim

# Set labels for better tracking
LABEL service="iptv-ml-service"
LABEL version="2.0"
LABEL description="IPTV ML Prediction Service - Fixed for Railway"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app/ ./app/
COPY utils/ ./utils/

# Create artifacts directory
# NOTE: ML model artifacts are large (263MB+) and not included in git
# For Railway deployment:
# Option 1: Set up a Railway persistent volume mounted at /app/artifacts
# Option 2: Use Railway's deployment variables to download artifacts from S3/R2/URL
# Option 3: SSH into the container and upload artifacts manually
# Option 4: Build a separate image with artifacts included
RUN mkdir -p ./artifacts

# Uncomment the following line if you're including artifacts in the build context
# COPY artifacts/ ./artifacts/

# Create data directory for uploads
RUN mkdir -p /app/data

# Environment variables (defaults - Railway will override PORT)
ENV ML_SERVICE_HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Expose port for Railway (Railway will set PORT dynamically)
EXPOSE 8080

# NOTE: Disabled health check temporarily to diagnose connection issues
# HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
#     CMD python -c "import urllib.request, os, sys; port = os.getenv('PORT', '8080'); sys.stdout.write(f'Health check on port {port}...\n'); urllib.request.urlopen(f'http://0.0.0.0:{port}/health', timeout=5)" || exit 1

# Run the application
# IMPORTANT: Must use $PORT (not ${PORT:-8080}) because Railway sets it dynamically
# Using exec form for proper signal handling
CMD ["sh", "-c", "sleep 5 && echo '=== Railway ML Service Starting ===' && echo 'PORT:' $PORT && echo 'Host: 0.0.0.0' && echo '================================' && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --log-level debug --timeout-keep-alive 300"]
