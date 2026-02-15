# ==================== BASE IMAGE ====================
# Use lightweight Node.js image
FROM node:20-alpine AS base

# Install dependencies for native modules (bcrypt, mongodb)
# Some native modules need Python and make tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# ==================== DEPENDENCIES ====================
FROM base AS dependencies

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --include=dev && \
    npm cache clean --force

# ==================== BUILDER ====================
FROM base AS builder

# Copy dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# ==================== PRODUCTION ====================
FROM base AS production

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy only production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership of app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/auth/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
