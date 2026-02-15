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

# Install dependencies WITHOUT NODE_ENV to ensure devDependencies are installed
# Remove --include=dev flag as it's deprecated in newer npm
RUN npm ci && \
    npm cache clean --force

# ==================== PRODUCTION ====================
FROM base AS production

# Set NODE_ENV to production AFTER dependencies are installed
ENV NODE_ENV=production

# Copy all dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Install ONLY production dependencies (remove devDependencies)
RUN npm prune --production

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
