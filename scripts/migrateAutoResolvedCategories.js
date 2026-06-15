#!/usr/bin/env node
/**
 * Migrate legacy auto_fix_logs whose category === "Auto-Resolved" to a real
 * issue category.
 *
 * Resolution order:
 *   1. notification.errorCategory, if it is a valid Kategori-X/Katagori-X.
 *   2. Inference from log + notification text, action, source and device type.
 *   3. "Uncategorized" when no strong signal exists.
 *
 * "Auto-resolved" is a status/action, never a category. This script is DRY-RUN
 * by default; pass --apply to write updates.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const { normalizeCategory } = require('../utils/deviceMeta.util');

const APPLY = process.argv.includes('--apply');
const LEGACY = 'Auto-Resolved';

const CATEGORY_MAPPINGS = {
  'Kategori-1': {
    device: 'chromecast',
    priority: 1,
    keywords: ['no device found', 'chromecast not found', 'device not detected', 'chromecast offline', 'chromecast unreachable'],
  },
  'Kategori-2': {
    device: 'iptv',
    priority: 2,
    keywords: ['weak signal', 'no signal', 'iptv offline', 'tv offline', 'no signal detected', 'connection timeout'],
  },
  'Kategori-3': {
    device: 'iptv',
    priority: 3,
    keywords: ['unplug', 'lan cable', 'lan in', 'lan out', 'cable disconnected', 'device not responding'],
  },
  'Kategori-4': {
    device: 'chromecast',
    priority: 2,
    keywords: ['setup ios', 'iphone', 'google home', 'local network'],
  },
  'Kategori-5': {
    device: 'channel',
    priority: 1,
    keywords: ['error playing', 'stream issue', 'video stream', 'reset channel stream'],
  },
  'Kategori-6': {
    device: 'channel',
    priority: 3,
    keywords: ['player error', 'player_error', 'hbrowser', 'widget', 'reload igmp'],
  },
  'Kategori-7': {
    device: 'channel',
    priority: 2,
    keywords: ['connection failure', 'connection_failure', 'ip conflict', 'multicast stream unavailable', 'stream timeout', 'network issue'],
  },
  'Kategori-8': {
    device: 'chromecast',
    priority: 3,
    keywords: ['reset configuration', 'reset chromecast config', 'restart chromecast'],
  },
  'Kategori-9': {
    device: 'iptv',
    priority: 2,
    keywords: ['no device logged', 'logged', 'login', 'authentication'],
  },
  'Kategori-10': {
    device: 'chromecast',
    priority: 1,
    keywords: ['black screen', 'power adapter', 'adaptor', 'screen'],
  },
  'Kategori-11': {
    device: 'channel',
    priority: 1,
    keywords: ['channel not found', 'missing channel'],
  },
  'Kategori-12': {
    device: 'chromecast',
    priority: 2,
    keywords: ['network connection', 'connection failed', 'wifi', 'router', 'connection refused'],
  },
  'Kategori-13': {
    device: 'iptv',
    priority: 3,
    keywords: ['initialization', 'system error', 'firmware', 'boot'],
  },
  'Kategori-14': {
    device: 'chromecast',
    priority: 2,
    keywords: ['logined', 'logged in', 'registered'],
  },
};

const SOURCE_TO_DEVICE = {
  chromecast: 'chromecast',
  channel: 'channel',
  tv: 'iptv',
  hospitality: 'iptv',
};

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '';
  }
}

function buildEvidenceText(log, notification) {
  return [
    log.description,
    log.action,
    log.fixType,
    log.deviceType,
    log.deviceName,
    log.source,
    log.result && log.result.action,
    log.result && log.result.message,
    log.result && log.result.details,
    notification && notification.title,
    notification && notification.message,
    notification && notification.error,
    notification && notification.deviceName,
    notification && notification.source,
  ].map(asText).join(' ').toLowerCase();
}

function inferCategory(log, notification) {
  const text = buildEvidenceText(log, notification);
  const expectedDevice =
    SOURCE_TO_DEVICE[log.deviceType] ||
    SOURCE_TO_DEVICE[log.source] ||
    (notification && SOURCE_TO_DEVICE[notification.source]) ||
    null;

  const scored = Object.entries(CATEGORY_MAPPINGS)
    .map(([category, config]) => {
      let score = 0;
      if (!expectedDevice || config.device === expectedDevice) score += 10;
      else score -= 6;

      const matchedKeywords = config.keywords.filter((keyword) => text.includes(keyword));
      score += matchedKeywords.length * 7;
      score += 4 - config.priority;

      return { category, score, matchedKeywords };
    })
    .filter((item) => item.score > 12 && item.matchedKeywords.length > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0] || null;
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('ERROR: MONGO_URL is not set (load backend/.env.local).');
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? 'APPLY (will write to DB)' : 'DRY-RUN (no writes)'}`);

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  try {
    const db = client.db('iptv');
    const logs = db.collection('auto_fix_logs');
    const notifications = db.collection('notifications');

    const matched = await logs.find({ category: LEGACY }).toArray();
    console.log(`Total auto_fix_logs with category "${LEGACY}": ${matched.length}`);
    if (matched.length === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    const notifIds = [...new Set(matched.map((l) => l.notificationId).filter(Boolean))];
    const notifs = notifIds.length
      ? await notifications
          .find({ notificationId: { $in: notifIds } })
          .project({
            notificationId: 1,
            errorCategory: 1,
            title: 1,
            message: 1,
            error: 1,
            deviceName: 1,
            source: 1,
          })
          .toArray()
      : [];

    const notifMap = {};
    notifs.forEach((n) => { notifMap[n.notificationId] = n; });

    const targetCounts = {};
    const reasonCounts = {};
    const samples = [];
    const ops = [];

    for (const log of matched) {
      const notif = log.notificationId ? notifMap[log.notificationId] : null;
      const norm = notif ? normalizeCategory(notif.errorCategory) : null;
      const inferred = norm ? null : inferCategory(log, notif);
      const target = norm || (inferred && inferred.category) || 'Uncategorized';
      const reason = norm
        ? 'notification.errorCategory'
        : inferred
          ? `inferred:${inferred.matchedKeywords.join('|')}`
          : 'fallback';

      targetCounts[target] = (targetCounts[target] || 0) + 1;
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

      if (samples.length < 10) {
        samples.push({
          fixId: log.fixId,
          notificationId: log.notificationId,
          before: log.category,
          after: target,
          reason,
        });
      }

      if (target !== log.category) {
        ops.push({
          updateOne: {
            filter: { _id: log._id },
            update: {
              $set: {
                category: target,
                categoryMigration: {
                  from: LEGACY,
                  to: target,
                  reason,
                  migratedAt: new Date(),
                },
              },
            },
          },
        });
      }
    }

    console.log('\nTarget category counts:');
    Object.entries(targetCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    console.log('\nResolution reason counts:');
    Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    console.log('\nSample (up to 10) before -> after:');
    samples.forEach((s) =>
      console.log(`  ${s.fixId} (notif ${s.notificationId || 'n/a'}): "${s.before}" -> "${s.after}" [${s.reason}]`)
    );

    console.log(`\nLogs needing change: ${ops.length} / ${matched.length}`);

    if (APPLY) {
      if (ops.length) {
        const res = await logs.bulkWrite(ops, { ordered: false });
        console.log(`APPLIED: modified ${res.modifiedCount} documents.`);
      } else {
        console.log('APPLIED: nothing to change.');
      }
    } else {
      console.log(`DRY-RUN complete. Re-run with --apply to write ${ops.length} updates.`);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('Migration error:', e);
  process.exit(1);
});
