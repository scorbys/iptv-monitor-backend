const express = require('express');
const router = express.Router();
const { predict, batchPredict } = require('../../../utils/mlService.util');
const { verifyToken, requireAdmin } = require('../../../middleware/authMiddleware');

router.use(verifyToken, requireAdmin);

// Predict single text
router.post('/', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
      });
    }

    if (typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text must be a string',
      });
    }

    if (text.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (max 10000 characters)',
      });
    }

    const result = await predict(text);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Batch predict multiple texts
router.post('/batch', async (req, res) => {
  try {
    const { texts } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required',
      });
    }

    if (texts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one text is required',
      });
    }

    const results = await batchPredict(texts);
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
