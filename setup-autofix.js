#!/usr/bin/env node

/**
 * Auto-Fix System Setup Script
 * Initializes database collections, indexes, and verifies ML service connection
 */

const autofixDB = require('./autofix-db');
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkMLService() {
  try {
    log('\n📡 Checking ML Service connection...', 'cyan');

    const response = await fetch('http://localhost:8001/health');

    if (response.ok) {
      const data = await response.json();
      log('✅ ML Service is running!', 'green');
      log(`   Status: ${data.status}`, 'blue');
      log(`   Model Loaded: ${data.model_loaded ? 'Yes' : 'No'}`, 'blue');
      return true;
    } else {
      log('❌ ML Service returned error status', 'red');
      return false;
    }
  } catch (error) {
    log('❌ Cannot connect to ML Service at http://localhost:8001', 'red');
    log('   Make sure ML service is running:', 'yellow');
    log('   cd backend/ml-service && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001', 'blue');
    return false;
  }
}

async function checkDatabase() {
  try {
    log('\n💾 Checking database connection...', 'cyan');

    const { client } = await autofixDB.connectDB();

    // Test connection
    await client.db('iptv').admin().ping();

    log('✅ Database connected successfully!', 'green');

    const db = client.db('iptv');
    const collections = await db.listCollections().toArray();

    log(`\n📊 Existing collections:`, 'cyan');
    collections.forEach(col => {
      log(`   - ${col.name}`, 'blue');
    });

    return true;
  } catch (error) {
    log('❌ Database connection failed', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

async function verifyIndexes() {
  try {
    log('\n🔍 Verifying database indexes...', 'cyan');

    const { notifications, autoFixLogs, mlPredictions } = await autofixDB.connectDB();

    const checkIndexes = async (collection, name) => {
      const indexes = await collection.indexes();
      log(`\n   ${name}:`, 'yellow');
      indexes.forEach(idx => {
        const keys = Object.keys(idx.key).join(', ');
        log(`     - ${keys} ${idx.unique ? '(unique)' : ''}`, 'blue');
      });
    };

    await checkIndexes(notifications, 'notifications');
    await checkIndexes(autoFixLogs, 'auto_fix_logs');
    await checkIndexes(mlPredictions, 'ml_predictions');

    log('\n✅ All indexes verified!', 'green');
    return true;
  } catch (error) {
    log('❌ Index verification failed', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

async function testSampleData() {
  try {
    log('\n🧪 Testing with sample notification...', 'cyan');

    const sampleNotification = {
      id: 'test-chromecast-' + Date.now(),
      title: 'Chromecast Device Offline',
      message: 'Test device for auto-fix verification',
      source: 'chromecast',
      type: 'warning',
      deviceName: 'Test Device',
      ipAddr: '192.168.1.100',
      error: 'No device found',
      errorCategory: 'Device',
      currentStatus: 'offline',
      rawDate: new Date().toISOString()
    };

    // Save notification
    await autofixDB.saveNotification(sampleNotification);
    log('✅ Sample notification saved', 'green');

    // Retrieve it back
    const retrieved = await autofixDB.getNotificationById(sampleNotification.id);
    if (retrieved) {
      log('✅ Sample notification retrieved successfully', 'green');
    } else {
      log('❌ Failed to retrieve sample notification', 'red');
      return false;
    }

    // Clean up test data
    const { notifications } = await autofixDB.connectDB();
    await notifications.deleteOne({ notificationId: sampleNotification.id });
    log('✅ Test data cleaned up', 'green');

    return true;
  } catch (error) {
    log('❌ Sample data test failed', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

async function displayStatistics() {
  try {
    log('\n📈 Current statistics:', 'cyan');

    const stats = await autofixDB.getAutoFixStats();

    log(`   Total Auto-fixes: ${stats.total}`, 'blue');
    log(`   Successful: ${stats.success}`, 'green');
    log(`   Failed: ${stats.failed}`, 'red');
    log(`   Pending: ${stats.pending}`, 'yellow');
    log(`   Executing: ${stats.executing}`, 'cyan');
    log(`   Success Rate: ${stats.successRate}%`, 'blue');

    // Get notification counts
    const { notifications, mlPredictions } = await autofixDB.connectDB();
    const notifCount = await notifications.countDocuments();
    const predCount = await mlPredictions.countDocuments();

    log(`\n   Total Notifications: ${notifCount}`, 'blue');
    log(`   Total ML Predictions: ${predCount}`, 'blue');
  } catch (error) {
    log(`⚠️  Could not retrieve statistics: ${error.message}`, 'yellow');
  }
}

async function runSetup() {
  log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
  log('║     IPTV ML Auto-Fix System Setup Wizard             ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════╝', 'cyan');

  const results = {
    mlService: false,
    database: false,
    indexes: false,
    testData: false
  };

  // Step 1: Check ML Service
  results.mlService = await checkMLService();

  // Step 2: Check Database
  results.database = await checkDatabase();

  if (!results.database) {
    log('\n❌ Cannot proceed without database connection', 'red');
    process.exit(1);
  }

  // Step 3: Verify Indexes
  results.indexes = await verifyIndexes();

  // Step 4: Test Sample Data
  if (results.indexes) {
    results.testData = await testSampleData();
  }

  // Step 5: Display Statistics
  await displayStatistics();

  // Summary
  log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
  log('║                   Setup Summary                        ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════╝', 'cyan');

  log(`\n   ML Service:      ${results.mlService ? '✅ Connected' : '❌ Not Available'}`, results.mlService ? 'green' : 'red');
  log(`   Database:        ${results.database ? '✅ Connected' : '❌ Failed'}`, results.database ? 'green' : 'red');
  log(`   Indexes:         ${results.indexes ? '✅ Verified' : '❌ Failed'}`, results.indexes ? 'green' : 'red');
  log(`   Test Data:       ${results.testData ? '✅ Passed' : '❌ Failed'}`, results.testData ? 'green' : 'red');

  const allPassed = Object.values(results).every(v => v === true);

  if (allPassed) {
    log('\n✨ Setup completed successfully! The auto-fix system is ready.', 'green');
    log('\nNext steps:', 'cyan');
    log('   1. Train your ML model at: http://localhost:3000/ml-dashboard', 'blue');
    log('   2. Upload training data with categories Kategori-1 through Kategori-11', 'blue');
    log('   3. Monitor notifications at: http://localhost:3000/notifications', 'blue');
    log('   4. Click "Auto-Fix" button on offline devices to trigger automatic fixes', 'blue');
  } else {
    log('\n⚠️  Setup completed with some issues. Please fix the errors above.', 'yellow');
  }

  log('\n📚 For more information, see: ML_AUTOFIX_IMPLEMENTATION.md\n', 'cyan');

  process.exit(allPassed ? 0 : 1);
}

// Run the setup
runSetup().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
