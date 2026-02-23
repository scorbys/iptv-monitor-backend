# Dockerfile untuk Railway ML Service Deployment
# Base image with Python 3.10 (smaller than 3.14, more stable)
FROM python:3.10-slim

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
ENV PORT=8080
ENV ML_SERVICE_HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Expose port for Railway
EXPOSE 8080

# Health check - use Railway's PORT environment variable
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
    CMD python -c "import urllib.request, os, sys, time; port = os.getenv('PORT', '8080'); sys.stdout.write(f'Health check on port {port}...\n'); urllib.request.urlopen(f'http://localhost:{port}/health', timeout=5)" || exit 1

# Copy startup script
COPY start.sh .
RUN chmod +x start.sh

# Run the application using startup script
CMD ["./start.sh"]
