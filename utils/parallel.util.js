// Parallel Processing Utility for Batch Operations
const { performance } = require('perf_hooks');

/**
 * Process array items in parallel batches with concurrency control
 * @param {Array} items - Items to process
 * @param {Function} asyncFn - Async function to apply to each item
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Array of results
 */
async function processInBatches(items, asyncFn, options = {}) {
  const {
    concurrency = 10, // Process N items at a time
    batchSize = 50, // If array > batchSize, use batch processing
    timeout = 30000, // 30 second timeout per item
    stopOnError = false
  } = options;

  if (!items || items.length === 0) {
    return [];
  }

  // For small arrays, just use Promise.all
  if (items.length <= batchSize) {
    try {
      return await Promise.all(
        items.map(item => withTimeout(asyncFn(item), timeout))
      );
    } catch (error) {
      if (stopOnError) throw error;
      console.error('Batch processing error:', error);
      return [];
    }
  }

  // For large arrays, process in concurrent batches
  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(item =>
        withTimeout(asyncFn(item), timeout).catch(error => {
          errors.push({ item, error: error.message });
          return null;
        })
      )
    );

    // Extract values from fulfilled promises
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value !== null) {
        results.push(result.value);
      }
    });

    // Log progress for large operations
    if (items.length > 100 && i % 100 === 0) {
      console.log(`Processed ${i}/${items.length} items`);
    }
  }

  if (errors.length > 0) {
    console.warn(`Processing complete with ${errors.length} errors`);
  }

  return results;
}

/**
 * Wrap async function with timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Check connectivity for multiple devices in parallel
 * @param {Array} devices - Array of devices with {id, ipAddr/IpMulticast}
 * @param {Function} checkFn - Connectivity check function
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Array of {deviceId, result}
 */
async function checkDeviceConnectivity(devices, checkFn, options = {}) {
  const {
    concurrency = 20, // Check 20 devices simultaneously
    timeout = 5000, // 5 second timeout per device
    progressCallback = null
  } = options;

  const startTime = performance.now();
  const results = [];
  let checkedCount = 0;

  for (let i = 0; i < devices.length; i += concurrency) {
    const batch = devices.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (device) => {
        try {
          const result = await withTimeout(checkFn(device.ipAddr || device.ipMulticast), timeout);
          return {
            success: true,
            deviceId: device.id || device.roomNo || device.idCast,
            result
          };
        } catch (error) {
          return {
            success: false,
            deviceId: device.id || device.roomNo || device.idCast,
            error: error.message
          };
        }
      })
    );

    results.push(...batchResults.map(r => r.value));

    checkedCount += batch.length;
    if (progressCallback) {
      progressCallback(checkedCount, devices.length);
    } else if (devices.length > 50) {
      console.log(`Connectivity check: ${checkedCount}/${devices.length} devices checked`);
    }
  }

  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`Checked ${devices.length} devices in ${duration}s (${(devices.length / duration).toFixed(0)} devices/sec)`);

  return results;
}

/**
 * Parallel database query with caching
 * @param {Array} queryFns - Array of query functions
 * @param {Object} cacheManager - Cache manager instance
 * @param {string} cacheKeyPrefix - Prefix for cache keys
 * @returns {Promise<Array>} - Array of query results
 */
async function parallelQueriesWithCache(queryFns, cacheManager, cacheKeyPrefix) {
  const results = [];

  await Promise.all(
    queryFns.map(async ({ key, fn }) => {
      const cacheKey = `${cacheKeyPrefix}:${key}`;

      // Try cache first
      const cached = cacheManager.get(cacheKey);
      if (cached !== null) {
        results.push({ key, data: cached, cached: true });
        return;
      }

      // Not in cache, execute query
      try {
        const data = await fn();
        cacheManager.set(cacheKey, data);
        results.push({ key, data, cached: false });
      } catch (error) {
        console.error(`Query failed for ${key}:`, error);
        results.push({ key, error: error.message, cached: false });
      }
    })
  );

  return results;
}

/**
 * Throttle function execution
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(fn, delay) {
  let lastCall = 0;
  let timeoutId = null;

  return function executedFunction(...args) {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
      }, delay - (now - lastCall));
    }
  };
}

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(fn, delay) {
  let timeoutId = null;

  return function executedFunction(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

module.exports = {
  processInBatches,
  withTimeout,
  checkDeviceConnectivity,
  parallelQueriesWithCache,
  throttle,
  debounce
};
