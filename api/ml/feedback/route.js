const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../../autofix-db');
const { verifyToken, requireAdmin } = require('../../../middleware/authMiddleware');

const router = express.Router();

const VALID_STATUSES = ['pending_review', 'approved', 'rejected'];
const VALID_OUTCOMES = ['unknown', 'worked', 'failed', 'manual_required'];

function normalizeCategory(category) {
  if (!category) return null;
  const normalized = String(category).trim().replace(/^Katagori-/i, 'Kategori-');
  return /^Kategori-(?:[1-9]|1[0-4])$/.test(normalized) ? normalized : normalized;
}

function getUserId(user) {
  return user?.userId || user?.id || user?._id || null;
}

async function getDatabase() {
  return connectDB();
}

router.use(verifyToken, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const {
      status,
      correctedCategory,
      source,
      limit = 50,
      skip = 0
    } = req.query;

    const db = await getDatabase();
    const query = {};

    if (status) query.status = status;
    if (correctedCategory) query.correctedCategory = normalizeCategory(correctedCategory);
    if (source) query.source = source;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const [items, total] = await Promise.all([
      db.mlFeedback
        .find(query)
        .sort({ createdAt: -1 })
        .skip(safeSkip)
        .limit(safeLimit)
        .toArray(),
      db.mlFeedback.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        total,
        limit: safeLimit,
        skip: safeSkip,
        hasMore: total > safeSkip + safeLimit
      }
    });
  } catch (error) {
    console.error('[MLFeedback] Failed to list feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list ML feedback'
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const db = await getDatabase();
    const [statusStats, categoryStats, outcomeStats, latest] = await Promise.all([
      db.mlFeedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      db.mlFeedback.aggregate([
        { $group: { _id: '$correctedCategory', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 14 }
      ]).toArray(),
      db.mlFeedback.aggregate([
        { $group: { _id: '$fixOutcome', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      db.mlFeedback.find({}).sort({ createdAt: -1 }).limit(5).toArray()
    ]);

    const total = await db.mlFeedback.countDocuments();
    const approved = statusStats.find(item => item._id === 'approved')?.count || 0;

    res.json({
      success: true,
      data: {
        total,
        approved,
        readyForRetrain: approved >= 50,
        minimumRecommendedFeedback: 50,
        byStatus: statusStats,
        byCorrectedCategory: categoryStats,
        byFixOutcome: outcomeStats,
        latest
      }
    });
  } catch (error) {
    console.error('[MLFeedback] Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get ML feedback stats'
    });
  }
});

router.get('/export', async (req, res) => {
  try {
    const db = await getDatabase();
    const status = req.query.status || 'approved';
    const rows = await db.mlFeedback
      .find({ status })
      .sort({ createdAt: -1 })
      .project({
        _id: 0,
        text: 1,
        correctedCategory: 1,
        predictedCategory: 1,
        confidence: 1,
        deviceType: 1,
        fixOutcome: 1,
        source: 1,
        createdAt: 1
      })
      .toArray();

    res.json({
      success: true,
      data: rows,
      meta: {
        status,
        count: rows.length,
        usage: 'Use these rows as feedback training data combined with the original Excel dataset.'
      }
    });
  } catch (error) {
    console.error('[MLFeedback] Failed to export feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export ML feedback'
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      text,
      predictedCategory,
      correctedCategory,
      confidence = null,
      recommendedFix = null,
      fixOutcome = 'unknown',
      source = 'manual',
      sourceId = null,
      deviceType = null,
      deviceId = null,
      deviceName = null,
      roomNo = null,
      notes = ''
    } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    if (!correctedCategory || typeof correctedCategory !== 'string') {
      return res.status(400).json({ success: false, error: 'correctedCategory is required' });
    }

    if (!VALID_OUTCOMES.includes(fixOutcome)) {
      return res.status(400).json({
        success: false,
        error: `fixOutcome must be one of: ${VALID_OUTCOMES.join(', ')}`
      });
    }

    const db = await getDatabase();
    const now = new Date();
    const feedback = {
      feedbackId: new ObjectId().toString(),
      text: text.slice(0, 10000),
      predictedCategory: normalizeCategory(predictedCategory),
      correctedCategory: normalizeCategory(correctedCategory),
      confidence: typeof confidence === 'number' ? confidence : null,
      recommendedFix,
      fixOutcome,
      source,
      sourceId,
      deviceType,
      deviceId: deviceId != null ? String(deviceId) : null,
      deviceName,
      roomNo,
      notes: typeof notes === 'string' ? notes.slice(0, 1000) : '',
      status: 'pending_review',
      createdBy: getUserId(req.user),
      createdAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null
    };

    await db.mlFeedback.insertOne(feedback);

    res.status(201).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('[MLFeedback] Failed to create feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create ML feedback'
    });
  }
});

router.patch('/:feedbackId', async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { status, notes } = req.body || {};

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    const db = await getDatabase();
    const update = {
      status,
      updatedAt: new Date(),
      reviewedBy: getUserId(req.user),
      reviewedAt: new Date()
    };

    if (typeof notes === 'string') {
      update.reviewNotes = notes.slice(0, 1000);
    }

    const result = await db.mlFeedback.findOneAndUpdate(
      { feedbackId },
      { $set: update },
      { returnDocument: 'after' }
    );

    const updated = result.value || result;

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Feedback not found' });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('[MLFeedback] Failed to update feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update ML feedback'
    });
  }
});

module.exports = router;
