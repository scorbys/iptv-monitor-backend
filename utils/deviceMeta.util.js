// Shared helpers for auto-fix logging so device metadata and category
// resolution stay identical across server.js, autoFixService and the
// auto-resolve scheduler (single source of truth).

/**
 * Derive stable device metadata from a notification so auto-fix logs can be
 * looked up by device (not only by notificationId).
 */
function deviceMetaFromNotification(notification) {
  if (!notification) return {};
  const sourceToType = {
    channel: 'channel',
    tv: 'tv',
    hospitality: 'tv',
    chromecast: 'chromecast',
  };
  const src = notification.source || null;
  const deviceId =
    notification.deviceId != null ? String(notification.deviceId)
    : notification.channelId != null ? String(notification.channelId)
    : notification.deviceIdentifier != null ? String(notification.deviceIdentifier)
    : null;
  return {
    deviceType: sourceToType[src] || null,
    deviceId,
    deviceName:
      notification.deviceName ||
      (notification.roomNo != null ? `Room ${notification.roomNo}` : null) ||
      notification.channelName ||
      null,
    roomNo: notification.roomNo != null ? notification.roomNo : null,
    source: src || 'notification',
  };
}

/**
 * Normalise a category string to a canonical "Kategori-N", or null if it is
 * not a real category (handles the legacy "Katagori-" misspelling).
 */
function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return null;
  const norm = cat
    .replace(/katagori-/gi, 'Kategori-')
    .replace(/kategori-/gi, 'Kategori-');
  return /^Kategori-\d+$/i.test(norm) ? norm : null;
}

/**
 * Resolve the category to store on an auto-fix log. Prefers a valid predicted
 * category, then an explicit body category, then a meaningful (non
 * External/Unknown) prediction, finally "Uncategorized". Never invents an
 * operational label like "Auto-Resolved".
 */
function resolveLogCategory(predicted, bodyCategory) {
  const p = normalizeCategory(predicted);
  if (p) return p;
  const b = normalizeCategory(bodyCategory);
  if (b) return b;
  if (predicted && typeof predicted === 'string' && !/^(external|unknown)$/i.test(predicted.trim())) {
    return predicted;
  }
  return 'Uncategorized';
}

module.exports = { deviceMetaFromNotification, normalizeCategory, resolveLogCategory };
