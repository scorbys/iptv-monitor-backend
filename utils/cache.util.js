// In-Memory Cache Utility with TTL and Size Limits
const NodeCache = require('node-cache');

// Create cache instances with different TTL policies
const cacheConfig = {
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Performance optimization - don't clone objects
  maxKeys: 1000 // Maximum number of keys to prevent memory overflow
};

// Channel data cache (frequently accessed, changes rarely)
const channelCache = new NodeCache({
  ...cacheConfig,
  stdTTL: 600, // 10 minutes
  maxKeys: 500
});

// TV data cache (changes infrequently)
const tvCache = new NodeCache({
  ...cacheConfig,
  stdTTL: 300, // 5 minutes
  maxKeys: 500
});

// Chromecast data cache
const chromecastCache = new NodeCache({
  ...cacheConfig,
  stdTTL: 300, // 5 minutes
  maxKeys: 200
});

// User data cache (security sensitive, shorter TTL)
const userCache = new NodeCache({
  ...cacheConfig,
  stdTTL: 60, // 1 minute
  maxKeys: 1000
});

// System context cache (very short TTL for real-time data)
const systemContextCache = new NodeCache({
  ...cacheConfig,
  stdTTL: 30, // 30 seconds
  maxKeys: 100
});

class CacheManager {
  constructor(cacheInstance, cacheName) {
    this.cache = cacheInstance;
    this.cacheName = cacheName;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.stats.hits++;
      return value;
    }
    this.stats.misses++;
    return null;
  }

  set(key, value, ttl) {
    this.stats.sets++;
    return this.cache.set(key, value, ttl);
  }

  del(key) {
    this.stats.deletes++;
    return this.cache.del(key);
  }

  flushAll() {
    return this.cache.flushAll();
  }

  getStats() {
    const stats = this.cache.getStats();
    return {
      ...this.stats,
      keys: stats.keys,
      vsize: stats.vsize, // Approximate size in bytes
      ksize: stats.ksize // Approximate key size in bytes
    };
  }

  // Cleanup old entries based on memory pressure
  cleanup() {
    const stats = this.cache.getStats();
    if (stats.keys > this.cache.options.maxKeys * 0.9) {
      // If we're at 90% capacity, flush and start fresh
      console.log(`[${this.cacheName}] Cache cleanup triggered - flushing ${stats.keys} keys`);
      this.flushAll();
    }
  }
}

// Export cache instances and managers
module.exports = {
  channelCache,
  tvCache,
  chromecastCache,
  userCache,
  systemContextCache,

  createManager: (cache, name) => new CacheManager(cache, name),

  // Global cleanup function - run periodically
  cleanupAllCaches: () => {
    channelCache.flushAll();
    tvCache.flushAll();
    chromecastCache.flushAll();
    userCache.flushAll();
    systemContextCache.flushAll();
    console.log('All caches flushed');
  },

  // Get statistics for monitoring
  getAllStats: () => ({
    channel: channelCache.getStats(),
    tv: tvCache.getStats(),
    chromecast: chromecastCache.getStats(),
    user: userCache.getStats(),
    systemContext: systemContextCache.getStats()
  }),

  // System cache alias for dashboard stats
  system: {
    get: (key) => systemContextCache.get(key),
    set: (key, value, ttl) => systemContextCache.set(key, value, ttl),
    del: (key) => systemContextCache.del(key)
  }
};
