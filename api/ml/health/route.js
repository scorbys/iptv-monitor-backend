const express = require('express');
const router = express.Router();
const { healthCheck } = require('../../../utils/mlService.util');

// Health check endpoint for ML service
router.get('/', async (req, res) => {
  try {
    const health = await healthCheck();
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
