const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../db');
const autoFixService = require('../../services/autoFixService');
const { Logger } = require('../../utils/logger.util');

const logger = new Logger('ChannelAPI');

// Get database instance
async function getDatabase() {
  const db = await connectDB();
  return db;
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');

// Authentication middleware
const authenticateToken = (req, res, next) => {
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access denied. No token provided.",
      authenticated: false
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: "Invalid or expired token",
      authenticated: false
    });
  }
};

// Apply authentication to all routes
router.use(authenticateToken);

// Helper function to create slug from channel name
function createSlug(channelName) {
  if (!channelName) return '';
  return channelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * GET /api/channels/:channelId/auto-fix?history=true
 * Get auto-fix history for a specific channel
 */
router.get('/:channelId/auto-fix', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { history } = req.query;

    if (history !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters. Use ?history=true'
      });
    }

    logger.info(`Fetching auto-fix history for channel: ${channelId}`);

    // Decode the channel ID
    const decodedChannelId = decodeURIComponent(channelId);

    // Find the channel in the database
    const db = await getDatabase();
    let channel = null;

    // Search in both international and local channels collections
    const searchInCollections = async (searchFunc) => {
      let result = await searchFunc(db.international);
      if (!result) {
        result = await searchFunc(db.local);
      }
      return result;
    };

    // Try by channelNumber (numeric)
    if (!isNaN(decodedChannelId)) {
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          channelNumber: parseInt(decodedChannelId)
        });
      });
    }

    // Try by slug/name
    if (!channel) {
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          $or: [
            { slug: decodedChannelId },
            { channelName: decodedChannelId },
            { name: decodedChannelId }
          ]
        });
      });
    }

    // Try by matching slug pattern (e.g., "nhk-premium" -> "NHK Premium", "bloomberg" -> "Bloomberg")
    if (!channel) {
      logger.info(`Trying to match slug pattern: ${decodedChannelId}`);
      const allChannels = await db.international.find({}).toArray();
      const localChannels = await db.local.find({}).toArray();
      allChannels.push(...localChannels);

      channel = allChannels.find(ch => {
        const channelSlug = createSlug(ch.channelName || ch.name || '');
        return channelSlug === decodedChannelId;
      });
    }

    // Try by ObjectId
    if (!channel && ObjectId.isValid(decodedChannelId)) {
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          _id: new ObjectId(decodedChannelId)
        });
      });
    }

    if (!channel) {
      logger.error(`Channel not found: ${decodedChannelId}`);
      return res.status(404).json({
        success: false,
        error: `Channel not found: ${decodedChannelId}`
      });
    }

    logger.info(`Found channel: ${channel.channelName || channel.name} (${channel.channelNumber})`);

    // Get auto-fix logs for this channel
    const channelNumberStr = channel.channelNumber.toString();
    const autoFixLogs = await db.autoFixHistory
      .find({
        $or: [
          { 'channel.channelNumber': channel.channelNumber },
          { 'channel.channelNumber': parseInt(channelNumberStr) }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    logger.info(`Found ${autoFixLogs.length} auto-fix logs for channel ${channel.channelName}`);

    res.status(200).json({
      success: true,
      data: {
        channel: {
          id: channel._id.toString(),
          channelNumber: channel.channelNumber,
          channelName: channel.channelName,
          slug: channel.slug
        },
        autoFixHistory: autoFixLogs,
        total: autoFixLogs.length
      }
    });
  } catch (error) {
    logger.error('Error fetching channel auto-fix history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch auto-fix history for channel'
    });
  }
});

/**
 * POST /api/channels/:channelId/auto-fix
 * Trigger auto-fix for a specific channel
 */
router.post('/:channelId/auto-fix', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { issueDescription, category } = req.body;

    logger.info(`Manual auto-fix trigger for channel: ${channelId}`);

    // Decode the channel ID (in case it's URL-encoded)
    const decodedChannelId = decodeURIComponent(channelId);
    logger.info(`Decoded channel ID: ${decodedChannelId}`);

    // Find the channel in the database
    const db = await getDatabase();

    // Try to find channel by different identifiers
    let channel = null;

    // Search in both international and local channels collections
    const searchInCollections = async (searchFunc) => {
      let result = await searchFunc(db.international);
      if (!result) {
        result = await searchFunc(db.local);
      }
      return result;
    };

    // Try by channelNumber (numeric)
    if (!isNaN(decodedChannelId)) {
      logger.info(`Trying to find channel by channelNumber: ${decodedChannelId}`);
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          channelNumber: parseInt(decodedChannelId)
        });
      });
    }

    // Try by slug/name
    if (!channel) {
      logger.info(`Trying to find channel by slug/name: ${decodedChannelId}`);
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          $or: [
            { slug: decodedChannelId },
            { channelName: decodedChannelId },
            { name: decodedChannelId }
          ]
        });
      });
    }

    // Try by matching slug pattern (e.g., "nhk-premium" -> "NHK Premium", "bloomberg" -> "Bloomberg")
    if (!channel) {
      logger.info(`Trying to match slug pattern: ${decodedChannelId}`);
      const allChannels = await db.international.find({}).toArray();
      const localChannels = await db.local.find({}).toArray();
      allChannels.push(...localChannels);

      channel = allChannels.find(ch => {
        const channelSlug = createSlug(ch.channelName || ch.name || '');
        return channelSlug === decodedChannelId;
      });
    }

    // Try by ObjectId
    if (!channel && ObjectId.isValid(decodedChannelId)) {
      logger.info(`Trying to find channel by ObjectId: ${decodedChannelId}`);
      channel = await searchInCollections(async (collection) => {
        return await collection.findOne({
          _id: new ObjectId(decodedChannelId)
        });
      });
    }

    if (!channel) {
      logger.error(`Channel not found: ${decodedChannelId} (tried by number, slug/name, and ObjectId)`);
      return res.status(404).json({
        success: false,
        error: `Channel not found: ${decodedChannelId}`
      });
    }

    logger.info(`Found channel: ${channel.channelName || channel.name} (${channel.channelNumber})`);

    // Check if there's an active notification for this channel
    const notification = await db.notifications.findOne({
      channelId: channel.channelNumber.toString(),
      reportStatus: { $in: ['open', 'pending', 'investigating'] }
    });

    if (!notification) {
      logger.info(`No active notification found for channel ${channel.channelName}, creating temporary notification`);

      // Create a temporary notification object for auto-fix
      const tempNotification = {
        notificationId: new ObjectId().toString(),
        channelId: channel.channelNumber.toString(),
        channelName: channel.channelName,
        errorCategory: category || 'Kategori-5',
        issue: issueDescription || 'Channel offline',
        source: 'manual',
        createdAt: new Date()
      };

      // Trigger auto-fix directly using autoFixService
      const result = await autoFixService.manualTriggerAutoFix(
        tempNotification.notificationId,
        'all'
      );

      res.status(200).json({
        success: true,
        data: {
          channel: {
            id: channel._id.toString(),
            channelNumber: channel.channelNumber,
            channelName: channel.channelName,
            slug: channel.slug
          },
          notification: tempNotification,
          autoFixResult: result
        },
        message: `Auto-fix triggered for channel ${channel.channelName}`
      });
    } else {
      logger.info(`Found active notification: ${notification.notificationId}`);

      // Trigger auto-fix using the existing notification
      const result = await autoFixService.manualTriggerAutoFix(
        notification.notificationId,
        'all'
      );

      res.status(200).json({
        success: true,
        data: {
          channel: {
            id: channel._id.toString(),
            channelNumber: channel.channelNumber,
            channelName: channel.channelName,
            slug: channel.slug
          },
          notification: {
            id: notification.notificationId,
            title: notification.title,
            errorCategory: notification.errorCategory
          },
          autoFixResult: result
        },
        message: `Auto-fix triggered for channel ${channel.channelName}`
      });
    }
  } catch (error) {
    logger.error('Error triggering channel auto-fix:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger auto-fix for channel'
    });
  }
});

module.exports = router;
