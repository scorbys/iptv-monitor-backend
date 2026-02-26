/**
 * Script untuk test ML training dan debug error
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const ML_SERVICE_URL = 'http://localhost:8001';

async function testMLTraining() {
  console.log('=== ML Training Test ===\n');

  try {
    // 1. Check ML service health
    console.log('1. Checking ML Service health...');
    const healthResponse = await axios.get(`${ML_SERVICE_URL}/health`);
    console.log('✅ ML Service is healthy');
    console.log('   Status:', healthResponse.data.status);
    console.log('   Model loaded:', healthResponse.data.model_loaded);
    console.log();

    // 2. Check model info
    console.log('2. Checking current model info...');
    const modelInfoResponse = await axios.get(`${ML_SERVICE_URL}/api/model/info`);
    console.log('Model info:', JSON.stringify(modelInfoResponse.data, null, 2));
    console.log();

    // 3. List available training files
    console.log('3. Looking for training data files...');
    const dataDir = path.join(__dirname, '../ml-service/data');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'));

    if (files.length === 0) {
      console.log('❌ No training files found in', dataDir);
      console.log('   Please place an Excel/CSV file with training data in this directory.');
      console.log('   Required columns:');
      console.log('   - Comment/Keterangan: The error message or description');
      console.log('   - Kategori/Category: The category label (Kategori-1 to Kategori-14)');
      console.log('   - Solusi/Solution (optional): Recommended solutions');
      return;
    }

    console.log(`Found ${files.length} file(s):`);
    files.forEach(f => console.log(`  - ${f}`));
    console.log();

    // 4. Test training with first file
    const testFile = files[0];
    const filePath = path.join(dataDir, testFile);

    console.log(`4. Testing training with file: ${testFile}`);
    console.log('   Reading file...');

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('sheet_name', 'Sheet1');

    console.log('   Sending to ML service...');
    console.log('   ⏳ This may take 1-2 minutes...');

    const trainResponse = await axios.post(
      `${ML_SERVICE_URL}/api/model/train`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 300000, // 5 minutes
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    console.log('\n✅ Training successful!');
    console.log('\nTraining Results:');
    console.log('  Accuracy:', (trainResponse.data.accuracy * 100).toFixed(2) + '%');
    console.log('  OOB Score:', trainResponse.data.oob_score?.toFixed(4) || 'N/A');
    console.log('  Classes:', trainResponse.data.n_classes);
    console.log('  Categories:', trainResponse.data.classes?.join(', '));
    console.log('  Features:', trainResponse.data.n_features);
    console.log();

    // 5. Verify model is trained
    console.log('5. Verifying model is trained...');
    const verifyResponse = await axios.get(`${ML_SERVICE_URL}/api/model/info`);

    if (verifyResponse.data.is_trained) {
      console.log('✅ Model successfully trained and loaded!');
    } else {
      console.log('❌ Model training completed but not loaded');
    }

    console.log('\n=== Test Complete ===');
    console.log('\nYou can now use the ML prediction service!');

  } catch (error) {
    console.log('\n❌ Error during test:');

    if (error.response) {
      // Server responded with error
      console.log(`Status: ${error.response.status}`);
      console.log(`Error: ${error.response.data?.detail || JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // No response from server
      console.log('No response from ML service');
      console.log('Make sure ML service is running on port 8001');
    } else {
      // Other error
      console.log(error.message);
    }

    console.log('\nTroubleshooting:');
    console.log('1. Make sure ML service is running: cd backend/ml-service && python -m app.main');
    console.log('2. Check ML service logs for detailed error messages');
    console.log('3. Verify training file has correct format:');
    console.log('   - Must have columns: "Comment"/"Keterangan" and "Kategori"/"Category"');
    console.log('   - Categories should be: Kategori-1, Kategori-2, etc.');
    console.log('4. Try with a smaller dataset first (50-100 rows)');
  }
}

// Run the test
testMLTraining()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error.message);
    process.exit(1);
  });
