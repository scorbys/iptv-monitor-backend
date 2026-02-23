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
      const response = await mlServiceClient.get('/api/model/info');
      console.log('[ML Service] Model info fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('[ML Service] Connection refused - ML service may be down');
        throw new Error('ML Service is not available');
      } else if (error.code === 'ETIMEDOUT') {
        console.error('[ML Service] Connection timeout - ML service may be starting up');
        throw new Error('ML Service is temporarily unavailable (timeout)');
      } else if (error.response) {
        console.error('[ML Service] Error response:', error.response.status, error.response.data);
        throw new Error(error.response.data.detail || 'Failed to get model information');
      }
      console.error('[ML Service] Failed to get model info:', error.message);
      throw new Error('Failed to get model information');
    }
  });
}

/**
 * Make prediction on text
 * @param {string} text - Text to predict
 */
async function predict(text) {
  try {
    const response = await mlServiceClient.post('/api/predict', { text });
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Prediction failed:', error.response.data);
      throw new Error(error.response.data.detail || 'Prediction failed');
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
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Training failed:', error.response.data);
      throw new Error(error.response.data.detail || 'Training failed');
    }
    console.error('Training error:', error.message);
    throw new Error('Failed to train model');
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
