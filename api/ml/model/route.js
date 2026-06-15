const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getModelInfo,
  trainModel,
  deleteModel,
  getCurrentTrainingStatus,
  getTrainingStatus,
} = require('../../../utils/mlService.util');
const { verifyToken, requireAdmin } = require('../../../middleware/authMiddleware');

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel files
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

// Get model information
router.get('/info', verifyToken, requireAdmin, async (req, res) => {
  try {
    const modelInfo = await getModelInfo();
    res.json({
      success: true,
      data: modelInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Train model with uploaded Excel file
router.post('/train', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const sheetName = req.body.sheet_name || 'Sheet1';
    const result = await trainModel(req.file.buffer, req.file.originalname, sheetName);

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

// Get current (active) training job status — admin only (ML Dashboard is admin-only)
router.get('/train/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    // FastAPI already returns a { success, data } envelope; forward as-is.
    const result = await getCurrentTrainingStatus();
    res.json(result);
  } catch (error) {
    const status = error.statusCode || error.response?.status || 502;
    res.status(status).json({
      success: false,
      error: error.response?.data?.detail || error.message || 'Failed to get training status',
    });
  }
});

// Get a specific training job status by id — admin only
router.get('/train/status/:jobId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await getTrainingStatus(req.params.jobId);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || error.response?.status || 502;
    res.status(status).json({
      success: false,
      error: error.response?.data?.detail || error.message || 'Failed to get training status',
    });
  }
});

// Delete trained model
router.delete('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await deleteModel();
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

module.exports = router;
