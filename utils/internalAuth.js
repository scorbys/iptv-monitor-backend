const crypto = require('crypto');

/**
 * Shared secret for trusted server-to-server (internal) API calls,
 * e.g. the Telegram bot fetching /api/internal/* data.
 *
 * Priority:
 *   1. INTERNAL_API_SECRET env var (if explicitly set)
 *   2. A value DERIVED from JWT_SECRET via HMAC-SHA256.
 *
 * Deriving from JWT_SECRET means the internal auth works out-of-the-box
 * (JWT_SECRET is always required by the server) WITHOUT sending the raw
 * JWT signing secret over the wire. Both the server and the in-process
 * Telegram bot compute the same value, so no extra configuration is needed.
 */
function getInternalToken() {
  if (process.env.INTERNAL_API_SECRET) {
    return process.env.INTERNAL_API_SECRET;
  }
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update('iptv-internal-api').digest('hex');
}

module.exports = { getInternalToken };
