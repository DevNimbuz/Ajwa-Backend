const NodeCache = require('node-cache');

// Standard cache for public API responses
// stdTTL: 1800 (30 minutes)
// checkperiod: 600 (check for expired keys every 10 mins)
const apiCache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });

/**
 * Middleware: Cache GET requests
 * @param {number} duration - Cache duration in seconds
 */
const cacheMiddleware = (duration) => (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') return next();

  const key = `__express__${req.originalUrl || req.url}`;
  const cachedResponse = apiCache.get(key);

  if (cachedResponse) {
    return res.json(cachedResponse);
  } else {
    // Intercept res.json to store the response
    res.sendResponse = res.json;
    res.json = (body) => {
      apiCache.set(key, body, duration);
      res.sendResponse(body);
    };
    next();
  }
};

/**
 * Manually clear cache for a specific pattern or key
 * Useful after mutations (Create/Update/Delete)
 */
const clearCache = (key) => {
  if (!key) {
    apiCache.flushAll();
  } else {
    const keys = apiCache.keys();
    const matches = keys.filter(k => k.includes(key));
    apiCache.del(matches);
  }
};

module.exports = { apiCache, cacheMiddleware, clearCache };
