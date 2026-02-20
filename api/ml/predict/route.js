const express = require('express');
const router = express.Router();
const { predict, batchPredict } = require('../../../utils/mlService.util');

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
