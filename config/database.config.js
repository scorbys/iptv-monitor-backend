// Optimized Database Configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
  // Connection Pool Settings
  maxPoolSize: isProduction ? 50 : 10, // Increased for production
  minPoolSize: isProduction ? 10 : 2,
  maxIdleTimeMS: isProduction ? 60000 : 30000, // 60s production, 30s dev

  // Timeout Settings
  serverSelectionTimeoutMS: 10000, // Reduced from 15000
  socketTimeoutMS: 45000, // Increased for long-running queries
  connectTimeoutMS: 10000, // Reduced from 15000

  // Retry Settings
  retryWrites: true,
  retryReads: true,

  // Monitoring
  heartbeatFrequencyMS: 10000,

  // Compression
  compress: true,
  zlibCompressionLevel: 6,

  // Application-specific optimization
  // Enable connection monitoring in production
  monitorCommands: isProduction ? ['slowms'] : [],

  // Slow query threshold (ms)
  slowMs: 100,

  // Read preference for secondary reads when available
  readPreference: isProduction ? 'secondaryPreferred' : 'primary',

  // Write concern - acknowledge writes
  writeConcern: {
    w: isProduction ? 'majority' : 1,
    j: true, // journal writes
    wtimeout: 5000
  },

  // Read concern
  readConcern: {
    level: 'local'
  },

  // Enable auto-reconnect
  autoReconnect: true,
  reconnectTries: 30,
  reconnectInterval: 1000,

  // Keep connection alive
  keepAlive: true,
  keepAliveInitialDelay: 30000,

  // UseNewUrlParser and useUnifiedTopology are default in MongoDB 6.x
  // Family: 4 for IPv4 (can use 0 for both IPv4 and IPv6)
  family: 4
};
