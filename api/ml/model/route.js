const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getModelInfo, trainModel, deleteModel } = require('../../../utils/mlService.util');

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
router.get('/info', async (req, res) => {
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
router.post('/train', upload.single('file'), async (req, res) => {
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

// Delete trained model
router.delete('/', async (req, res) => {
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
