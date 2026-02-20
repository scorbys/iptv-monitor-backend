#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates ALL MongoDB collections with proper indexes and sample data
 *
 * Usage: node init-database.js
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URL;
const DB_NAME = 'iptv';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectToMongoDB() {
  try {
    log('\n🔗 Connecting to MongoDB...', 'cyan');

    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 20000,
      connectTimeoutMS: 15000
    });

    await client.connect();
    log('✅ Connected to MongoDB successfully!', 'green');

    const db = client.db(DB_NAME);

    // List existing collections
    const existingCollections = await db.listCollections().toArray();
    log(`\n📊 Existing collections:`, 'cyan');
    if (existingCollections.length === 0) {
      log('   (none)', 'yellow');
    } else {
      existingCollections.forEach(col => {
        log(`   - ${col.name}`, 'blue');
      });
    }

    return { client, db };
  } catch (error) {
    log(`❌ Failed to connect to MongoDB: ${error.message}`, 'red');
    throw error;
  }
}

async function createStaffCollection(db) {
  try {
    log('\n👥 Creating staff collection...', 'cyan');

    // Create collection
    const staffCollection = db.collection('staff');

    // Create indexes
    await staffCollection.createIndex({ email: 1 }, { unique: true });
    await staffCollection.createIndex({ userId: 1 }); // Link to login_page
    await staffCollection.createIndex({ department: 1 });
    await staffCollection.createIndex({ isActive: 1 });
    await staffCollection.createIndex({ createdAt: -1 });

    log('✅ Staff collection created with indexes', 'green');

    // Check if sample data already exists
    const existingStaff = await staffCollection.countDocuments();
    if (existingStaff === 0) {
      // Insert sample staff data
      const sampleStaff = [
        {
          userId: new ObjectId(), // Would link to login_page._id
          name: 'Admin User',
          email: 'admin@iptv.com',
          phone: '+6281234567890',
          department: 'IT Support',
          role: 'Admin',
          isActive: true,
          avatar: null,
          stats: {
            totalAssigned: 0,
            totalResolved: 0,
            avgResolutionTime: 0,
            successRate: 0
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          userId: new ObjectId(),
          name: 'John Technician',
          email: 'john@iptv.com',
          phone: '+6281234567891',
          department: 'Network',
          role: 'Technician',
          isActive: true,
          avatar: null,
          stats: {
            totalAssigned: 0,
            totalResolved: 0,
            avgResolutionTime: 0,
            successRate: 0
          },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const result = await staffCollection.insertMany(sampleStaff);
      log(`   Inserted ${result.insertedCount} sample staff records`, 'blue');
    } else {
      log(`   Staff collection already has ${existingStaff} documents, skipping sample data`, 'yellow');
    }

    return staffCollection;
  } catch (error) {
    if (error.code === 48) {
      log('   Staff collection already exists, skipping creation', 'yellow');
      return db.collection('staff');
    }
    throw error;
  }
}

async function createNotificationsCollection(db) {
  try {
    log('\n🔔 Creating notifications collection...', 'cyan');

    const notificationsCollection = db.collection('notifications');

    // Create indexes
    await notificationsCollection.createIndex({ notificationId: 1 }, { unique: true });
    await notificationsCollection.createIndex({ source: 1 });
    await notificationsCollection.createIndex({ currentStatus: 1 });
    await notificationsCollection.createIndex({ createdAt: -1 });
    await notificationsCollection.createIndex({ errorCategory: 1 });
    await notificationsCollection.createIndex({ reportedByStaffId: 1 });
    await notificationsCollection.createIndex({ assignedStaffId: 1 });
    await notificationsCollection.createIndex({ handledByStaffId: 1 });
    await notificationsCollection.createIndex({ reportStatus: 1 });
    await notificationsCollection.createIndex({ priority: 1 });

    log('✅ Notifications collection created with indexes', 'green');

    // Check if sample data already exists
    const existingNotifications = await notificationsCollection.countDocuments();
    if (existingNotifications === 0) {
      // Insert sample notification
      const sampleNotification = {
        notificationId: 'sample-chromecast-' + Date.now(),
        title: 'Sample Chromecast Offline',
        message: 'This is a sample notification for testing',
        source: 'chromecast',
        type: 'error',
        deviceName: 'Living Room TV',
        roomNo: '101',
        ipAddr: '192.168.1.100',
        error: 'No device found',
        errorCategory: 'Device',
        currentStatus: 'offline',
        previousStatus: 'online',
        isStatusChange: true,
        responseTime: 5000,
        signalLevel: 'weak',
        suggestedSolutions: ['Check power connection', 'Verify network'],
        rawDate: new Date(),

        // Staff tracking
        reportedByStaffId: null,
        assignedStaffId: null,
        handledByStaffId: null,
        handlingStartTime: null,
        handlingEndTime: null,
        notes: [],
        reportStatus: 'pending',
        priority: 'medium',

        createdAt: new Date(),
        updatedAt: new Date()
      };

      await notificationsCollection.insertOne(sampleNotification);
      log('   Inserted 1 sample notification', 'blue');
    } else {
      log(`   Notifications collection already has ${existingNotifications} documents, skipping sample data`, 'yellow');
    }

    return notificationsCollection;
  } catch (error) {
    if (error.code === 48) {
      log('   Notifications collection already exists, skipping creation', 'yellow');
      return db.collection('notifications');
    }
    throw error;
  }
}

async function createAutoFixLogsCollection(db) {
  try {
    log('\n🔧 Creating auto_fix_logs collection...', 'cyan');

    const autoFixLogsCollection = db.collection('auto_fix_logs');

    // Create indexes
    await autoFixLogsCollection.createIndex({ fixId: 1 }, { unique: true });
    await autoFixLogsCollection.createIndex({ notificationId: 1 });
    await autoFixLogsCollection.createIndex({ status: 1 });
    await autoFixLogsCollection.createIndex({ executedAt: -1 });
    await autoFixLogsCollection.createIndex({ mlPredictionId: 1 });
    await autoFixLogsCollection.createIndex({ triggeredBy: 1 });
    await autoFixLogsCollection.createIndex({ executedBy: 1 });

    log('✅ Auto-fix logs collection created with indexes', 'green');

    // Check if sample data already exists
    const existingAutoFixLogs = await autoFixLogsCollection.countDocuments();
    if (existingAutoFixLogs === 0) {
      // Get the sample notification ID
      const sampleNotification = await notificationsCollection.findOne({ notificationId: /sample/ });
      const notificationId = sampleNotification?.notificationId || 'sample-chromecast-' + Date.now();

      // Insert sample auto-fix log
      const sampleAutoFixLog = {
        fixId: 'sample-fix-' + Date.now(),
        notificationId: notificationId,
        mlPredictionId: null,
        fixType: 'automatic',
        category: 'Kategori-1',
        action: 'restart_chromecast',
        description: 'Restart Chromecast device via network',
        command: 'restart_chromecast',
        status: 'pending',
        confidence: 0.85,
        createdBy: 'ml',
        triggeredBy: null,
        approvedBy: null,
        executedBy: null,
        createdAt: new Date(),
        executedAt: null,
        completedAt: null,
        result: null,
        errorMessage: null,
        retryCount: 0,
        maxRetries: 3,
        notes: []
      };

      await autoFixLogsCollection.insertOne(sampleAutoFixLog);
      log('   Inserted 1 sample auto-fix log', 'blue');
    } else {
      log(`   Auto-fix logs collection already has ${existingAutoFixLogs} documents, skipping sample data`, 'yellow');
    }

    return autoFixLogsCollection;
  } catch (error) {
    if (error.code === 48) {
      log('   Auto-fix logs collection already exists, skipping creation', 'yellow');
      return db.collection('auto_fix_logs');
    }
    throw error;
  }
}

async function createMLPredictionsCollection(db) {
  try {
    log('\n🤖 Creating ml_predictions collection...', 'cyan');

    const mlPredictionsCollection = db.collection('ml_predictions');

    // Create indexes
    await mlPredictionsCollection.createIndex({ predictionId: 1 }, { unique: true });
    await mlPredictionsCollection.createIndex({ notificationId: 1 });
    await mlPredictionsCollection.createIndex({ predictedCategory: 1 });
    await mlPredictionsCollection.createIndex({ confidence: -1 });
    await mlPredictionsCollection.createIndex({ createdAt: -1 });

    log('✅ ML predictions collection created with indexes', 'green');

    // Check if sample data already exists
    const existingMLPredictions = await mlPredictionsCollection.countDocuments();
    if (existingMLPredictions === 0) {
      // Get the sample notification ID
      const notificationsCollection = db.collection('notifications');
      const sampleNotification = await notificationsCollection.findOne({ notificationId: /sample/ });
      const notificationId = sampleNotification?.notificationId || 'sample-chromecast-' + Date.now();

      // Insert sample ML prediction (linked to the sample notification)
      const sampleMLPrediction = {
        predictionId: 'sample-pred-' + Date.now(),
        notificationId: notificationId,
        inputText: 'Chromecast Offline No device found Device',
        cleanedText: 'chromecast offline device found',
        predictedCategory: 'Kategori-1',
        confidence: 0.85,
        probabilities: [
          { label: 'Kategori-1', probability: 0.85 },
          { label: 'Kategori-2', probability: 0.10 },
          { label: 'Kategori-3', probability: 0.05 }
        ],
        features: {
          has_device_keyword: true,
          has_offline_keyword: true,
          error_length: 14
        },
        suggestedSolutions: [
          'Check power connection',
          'Verify network connectivity',
          'Restart Chromecast device'
        ],
        createdAt: new Date()
      };

      await mlPredictionsCollection.insertOne(sampleMLPrediction);
      log('   Inserted 1 sample ML prediction', 'blue');
    } else {
      log(`   ML predictions collection already has ${existingMLPredictions} documents, skipping sample data`, 'yellow');
    }

    return mlPredictionsCollection;
  } catch (error) {
    if (error.code === 48) {
      log('   ML predictions collection already exists, skipping creation', 'yellow');
      return db.collection('ml_predictions');
    }
    throw error;
  }
}

async function displayStatistics(db) {
  try {
    log('\n📈 Database Statistics:', 'cyan');

    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      const collection = db.collection(col.name);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();

      log(`\n   ${col.name}:`, 'yellow');
      log(`     Documents: ${count}`, 'blue');
      log(`     Indexes: ${indexes.length}`, 'blue');

      indexes.forEach(idx => {
        const keys = Object.keys(idx.key).join(', ');
        log(`       - ${keys} ${idx.unique ? '(unique)' : ''}`, 'blue');
      });
    }

    log('\n' + '='.repeat(60), 'cyan');
  } catch (error) {
    log(`\n⚠️  Could not retrieve statistics: ${error.message}`, 'yellow');
  }
}

async function runInitialization() {
  let client;

  try {
    log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
    log('║     MongoDB Database Initialization Script             ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════╝', 'cyan');

    // Connect to MongoDB
    const { client: mongoClient, db } = await connectToMongoDB();
    client = mongoClient;

    // Create collections
    await createStaffCollection(db);
    await createNotificationsCollection(db);
    await createAutoFixLogsCollection(db);
    await createMLPredictionsCollection(db);

    // Display statistics
    await displayStatistics(db);

    log('\n✨ Database initialization completed successfully!', 'green');
    log('\n📚 Next steps:', 'cyan');
    log('   1. Verify collections in your MongoDB client (DBSchema)', 'blue');
    log('   2. Run: node setup-autofix.js (for auto-fix system)', 'blue');
    log('   3. Test creating notifications via API', 'blue');
    log('   4. Check collections now have data:', 'blue');
    log('      - staff', 'blue');
    log('      - notifications', 'blue');
    log('      - auto_fix_logs', 'blue');
    log('      - ml_predictions', 'blue');

  } catch (error) {
    log('\n❌ Initialization failed:', 'red');
    log(`   ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      log('\n🔌 MongoDB connection closed', 'yellow');
    }
  }
}

// Run the initialization
runInitialization()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
