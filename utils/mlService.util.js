const axios = require('axios');

// ML Service configuration
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
const ML_SERVICE_TIMEOUT = parseInt(process.env.ML_SERVICE_TIMEOUT || '60000'); // 60 seconds (increased from 30)
const ML_SERVICE_MAX_RETRIES = 3; // Number of retries for failed requests
const ML_SERVICE_RETRY_DELAY = 2000; // Delay between retries in ms

// Helper function to retry failed requests
async function retryWithBackoff(fn, retries = ML_SERVICE_MAX_RETRIES) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    // Don't retry if it's a 4xx error (client error)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      throw error;
    }

    // Retry for network errors or 5xx errors
    console.log(`[ML Service] Request failed, retrying... (${ML_SERVICE_MAX_RETRIES - retries + 1}/${ML_SERVICE_MAX_RETRIES})`);

    await new Promise(resolve => setTimeout(resolve, ML_SERVICE_RETRY_DELAY));
    return retryWithBackoff(fn, retries - 1);
  }
}

// Create axios instance for ML service
const mlServiceClient = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: ML_SERVICE_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Check if ML service is healthy
 */
async function healthCheck() {
  try {
    const response = await mlServiceClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('ML Service health check failed:', error.message);
    throw new Error('ML Service is not available');
  }
}

/**
 * Get model information
 */
async function getModelInfo() {
  return retryWithBackoff(async () => {
    try {
      console.log(`[ML Service] Fetching model info from ${ML_SERVICE_URL}/api/model/info`);
      const response = await mlServiceClient.get('/api/model/info', {
        timeout: 30000 // 30 second timeout for model info
      });
      console.log('[ML Service] Model info fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('[ML Service] Connection refused - ML service may be down');
        throw new Error('ML Service is not available. Please check if the ML service is running.');
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error('[ML Service] Connection timeout - ML service may be starting up');
        throw new Error('ML Service is temporarily unavailable (timeout). Please try again in a moment.');
      } else if (error.response) {
        console.error('[ML Service] Error response:', error.response.status, error.response.data);
        const errorMsg = error.response.data?.detail || error.response.data?.message || 'Failed to get model information';
        throw new Error(`ML Service error (${error.response.status}): ${errorMsg}`);
      }
      console.error('[ML Service] Failed to get model info:', error.message);
      throw new Error(`Failed to connect to ML Service: ${error.message}`);
    }
  });
}

/**
 * Make prediction on text
 * @param {string} text - Text to predict
 */
async function predict(text) {
  try {
    // Input validation
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (trimmedText.length > 10000) {
      throw new Error('Text too long (max 10000 characters)');
    }

    const response = await mlServiceClient.post('/api/predict', { text: trimmedText });
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Prediction failed:', error.response.data);
      throw new Error(error.response.data.detail || 'Prediction failed');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('ML Service unavailable');
      throw new Error('ML Service is currently unavailable. Please try again later.');
    }
    console.error('Prediction error:', error.message);
    throw new Error('Failed to make prediction');
  }
}

/**
 * Train model with Excel file
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {string} filename - Original filename
 * @param {string} sheetName - Sheet name to read from (default: "Sheet1")
 */
async function trainModel(fileBuffer, filename, sheetName = 'Sheet1') {
  try {
    // Input validation
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename');
    }

    if (!sheetName || typeof sheetName !== 'string' || sheetName.trim().length === 0) {
      throw new Error('Invalid sheet name');
    }

    // Check file size (max 50MB)
    if (fileBuffer.length > 50 * 1024 * 1024) {
      throw new Error('File size exceeds 50MB limit');
    }

    console.log(`[ML Service] Starting training for file: ${filename}, sheet: ${sheetName}`);
    const FormData = require('form-data');
    const form = new FormData();

    form.append('file', fileBuffer, {
      filename: filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    form.append('sheet_name', sheetName);

    const response = await mlServiceClient.post('/api/model/train', form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 300000, // 5 minutes for training
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log('[ML Service] Training completed successfully');
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('[ML Service] Training failed:', error.response.status, error.response.data);
      const errorMsg = error.response.data?.detail || error.response.data?.message || 'Training failed';
      throw new Error(`ML Service error (${error.response.status}): ${errorMsg}`);
    } else if (error.code === 'ECONNABORTED') {
      console.error('[ML Service] Training timeout - operation took too long');
      throw new Error('Training timeout. The operation took too long. Please try with a smaller dataset.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('[ML Service] Service unavailable');
      throw new Error('ML Service is currently unavailable. Please try again later.');
    }
    console.error('[ML Service] Training error:', error.message);
    throw new Error(`Failed to train model: ${error.message}`);
  }
}

/**
 * Delete trained model
 */
async function deleteModel() {
  try {
    const response = await mlServiceClient.delete('/api/model');
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Delete model failed:', error.response.data);
      throw new Error(error.response.data.detail || 'Delete model failed');
    }
    console.error('Delete model error:', error.message);
    throw new Error('Failed to delete model');
  }
}

/**
 * Batch predict multiple texts
 * @param {string[]} texts - Array of texts to predict
 */
async function batchPredict(texts) {
  try {
    const predictions = await Promise.all(
      texts.map(text => predict(text))
    );
    return predictions;
  } catch (error) {
    console.error('Batch prediction error:', error.message);
    throw new Error('Failed to make batch predictions');
  }
}

module.exports = {
  healthCheck,
  getModelInfo,
  predict,
  trainModel,
  deleteModel,
  batchPredict,
  ML_SERVICE_URL,
};
