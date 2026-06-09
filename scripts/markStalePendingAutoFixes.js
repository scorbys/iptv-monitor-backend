#!/usr/bin/env node
/**
 * Mark stale pending auto_fix_logs as cancelled instead of deleting them.
 *
 * Dry-run by default:
 *   node scripts/markStalePendingAutoFixes.js
 *
 * Apply:
 *   node scripts/markStalePendingAutoFixes.js --apply
 *
 * Optional age threshold:
 *   node scripts/markStalePendingAutoFixes.js --hours=24 --apply
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const hoursArg = process.argv.find(arg => arg.startsWith('--hours='));
const STALE_HOURS = hoursArg ? parseInt(hoursArg.split('=')[1], 10) : 24;

if (!process.env.MONGO_URL) {
  console.error('MONGO_URL is required');
  process.exit(1);
}

if (!Number.isFinite(STALE_HOURS) || STALE_HOURS <= 0) {
  console.error('--hours must be a positive number');
  process.exit(1);
}

function normalizeCategory(category) {
  if (!category) return category;
  return String(category).replace(/^Katagori-/i, 'Kategori-');
}

function needsReview(log) {
  const category = normalizeCategory(log.category);
  return (
    !log.action ||
    log.action === 'analyze' ||
    !category ||
    category === 'External' ||
    category === 'Unknown' ||
    category === 'Uncategorized' ||
    /^Katagori-/i.test(String(log.category || ''))
  );
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();

  const db = client.db('iptv');
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
  const candidates = await db.collection('auto_fix_logs')
    .find({
      status: 'pending',
      createdAt: { $lt: staleCutoff }
    })
    .project({
      fixId: 1,
      category: 1,
      action: 1,
      deviceType: 1,
      deviceId: 1,
      deviceName: 1,
      roomNo: 1,
      description: 1,
      createdAt: 1
    })
    .sort({ createdAt: 1 })
    .toArray();

  const staleLogs = candidates.filter(needsReview);

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    staleAfterHours: STALE_HOURS,
    candidates: candidates.length,
    willMarkCancelled: staleLogs.length,
    sample: staleLogs.slice(0, 10).map(log => ({
      fixId: log.fixId,
      category: log.category,
      action: log.action,
      device: log.deviceName || log.deviceId || log.roomNo || null,
      createdAt: log.createdAt
    }))
  }, null, 2));

  if (APPLY && staleLogs.length > 0) {
    const fixIds = staleLogs.map(log => log.fixId).filter(Boolean);
    const result = await db.collection('auto_fix_logs').updateMany(
      { fixId: { $in: fixIds }, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          updatedAt: new Date(),
          errorMessage: `Stale pending queue item marked cancelled after ${STALE_HOURS} hours`,
          staleResolution: {
            action: 'mark_cancelled',
            reason: 'stale_pending_requires_manual_review',
            resolvedAt: new Date()
          }
        }
      }
    );

    console.log(`Marked ${result.modifiedCount} stale pending auto-fix log(s) as cancelled.`);
  }

  await client.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
