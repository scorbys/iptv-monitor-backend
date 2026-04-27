require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const uri = process.env.MONGO_URL;
const { insertWithSync, updateWithSync, deleteWithSync, bulkInsertWithSync } = require('./utils/dbSyncWrapper');

let client = null;
let isConnecting = false;

async function connectDB() {
  if (client && client.topology?.isConnected()) {
    try {
      // Test connection with a quick ping
      await client.db('iptv').admin().ping();
      const db = client.db('iptv');
      return {
        international: db.collection('international_channels'),
        local: db.collection('local_channels'),
        hospitality: db.collection('tv_hospitality'),
        users: db.collection('login_page'),
        chromecast: db.collection('chromecast'),
        autoFixHistory: db.collection('auto_fix_history'),
        staff: db.collection('staff'),
        notifications: db.collection('notifications'),
        client: client
      };
    } catch (error) {
      console.log('Connection test failed, reconnecting...');
      client = null;
    }
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 50) { // Max 5 seconds wait
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (client && client.topology?.isConnected()) {
      const db = client.db('iptv');
      return {
        international: db.collection('international_channels'),
        local: db.collection('local_channels'),
        hospitality: db.collection('tv_hospitality'),
        users: db.collection('login_page'),
        chromecast: db.collection('chromecast'),
        autoFixHistory: db.collection('auto_fix_history'),
        staff: db.collection('staff'),
        notifications: db.collection('notifications'),
        client: client
      };
    }
  }

  try {
    isConnecting = true;
    console.log('Connecting to MongoDB...');

    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.log('Error closing existing client:', closeError.message);
      }
    }

    client = new MongoClient(uri, {
      maxPoolSize: 5, // Reduced pool size
      serverSelectionTimeoutMS: 15000, // Reduced timeout
      socketTimeoutMS: 20000,
      connectTimeoutMS: 15000,
      retryWrites: true,
      retryReads: true,
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      heartbeatFrequencyMS: 10000 // Check connection every 10 seconds
    });

    await client.connect();
    console.log('Connected to MongoDB successfully');

    const db = client.db('iptv');
    return {
      international: db.collection('international_channels'),
      local: db.collection('local_channels'),
      hospitality: db.collection('tv_hospitality'),
      users: db.collection('login_page'),
      chromecast: db.collection('chromecast'),
      autoFixHistory: db.collection('auto_fix_history'),
      client: client
    };
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    client = null;
    throw new Error('Database connection failed');
  } finally {
    isConnecting = false;
  }
}

// ==================== CHANNEL FUNCTIONS ====================

async function getInternationalChannels() {
  try {
    const { international } = await connectDB();
    const channels = await international.find({}).toArray();
    return channels;
  } catch (error) {
    console.error('Error fetching international channels:', error);
    return [];
  }
}

async function getLocalChannels() {
  try {
    const { local } = await connectDB();
    const channels = await local.find({}).toArray();
    return channels;
  } catch (error) {
    console.error('Error fetching local channels:', error);
    return [];
  }
}

// ==================== HOSPITALITY TV FUNCTIONS ====================

async function getHospitalityTVs() {
  try {
    const { hospitality } = await connectDB();
    const tvs = await hospitality.find({}).toArray();
    return tvs;
  } catch (error) {
    console.error('Error fetching hospitality TVs:', error);
    return [];
  }
}

async function getHospitalityTVByRoomNo(roomNo) {
  try {
    const { hospitality } = await connectDB();
    const tv = await hospitality.findOne({ roomNo: roomNo });
    return tv;
  } catch (error) {
    console.error(`Error fetching TV for room ${roomNo}:`, error);
    return null;
  }
}

async function updateHospitalityTVStatus(roomNo, statusData) {
  try {
    const { hospitality } = await connectDB();
    
    // Try update
    const result = await updateWithSync(
      hospitality,
      { roomNo: roomNo },
      { ...statusData, lastUpdated: new Date() },
      'tv_hospitality'
    );

    if (result.matchedCount === 0) {
      console.log(`TV for room ${roomNo} not found`);
      return null;
    }

    console.log(`Updated status for room ${roomNo}`);
    return result;
  } catch (error) {
    console.error(`Error updating status for room ${roomNo}:`, error);
    // Sync failure tidak throw error, hanya log
    return null;
  }
}

async function addHospitalityTV(tvData) {
  try {
    const { hospitality } = await connectDB();
    const result = await insertWithSync(
      hospitality,
      {
        ...tvData,
        createdAt: new Date(),
        lastUpdated: new Date()
      },
      'tv_hospitality'
    );

    console.log(`Added new TV for room ${tvData.roomNo}`);
    return result;
  } catch (error) {
    console.error(`Error adding TV for room ${tvData.roomNo}:`, error);
    return null;
  }
}

async function bulkInsertHospitalityTVs(tvData) {
  try {
    const { hospitality } = await connectDB();

    const tvsWithTimestamps = tvData.map(tv => ({
      ...tv,
      createdAt: new Date(),
      lastUpdated: new Date()
    }));

    const result = await bulkInsertWithSync(hospitality, tvsWithTimestamps, 'tv_hospitality');
    console.log(`Inserted ${result.insertedCount} hospitality TVs`);
    return result;
  } catch (error) {
    console.error('Error bulk inserting hospitality TVs:', error);
    return null;
  }
}

async function deleteHospitalityTV(roomNo) {
  try {
    const { hospitality } = await connectDB();
    const result = await deleteWithSync(hospitality, { roomNo: roomNo }, 'tv_hospitality');

    console.log(`Deleted TV for room ${roomNo}`);
    return result;
  } catch (error) {
    console.error(`Error deleting TV for room ${roomNo}:`, error);
    return null;
  }
}

// ==================== AUTHENTICATION HELPER FUNCTIONS ====================

async function hashPassword(password) {
  try {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('Password hashed successfully');
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

async function comparePassword(password, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    console.log('Password comparison completed');
    return isMatch;
  } catch (error) {
    console.error('Error comparing password:', error);
    throw new Error('Failed to compare password');
  }
}

async function updateUserWithGoogleInfo(email, googleData) {
  try {
    const { users } = await connectDB();
    const result = await updateWithSync(
      users,
      { email: email.toLowerCase() },
      {
        googleId: googleData.googleId,
        avatar: googleData.avatar,
        name: googleData.name || null,
        provider: 'google',
        updatedAt: new Date()
      },
      'login_page'
    );
    return result;
  } catch (error) {
    console.error('Error updating user with Google info:', error);
    return null;
  }
}

// Helper function to check if user has a valid password
async function hasValidPassword(passwordField) {
  return passwordField &&
    typeof passwordField === 'string' &&
    passwordField.trim() !== "" &&
    passwordField !== "null" &&
    passwordField !== "undefined" &&
    passwordField.length > 10; // bcrypt hash minimal length
}

// ==================== USER CRUD FUNCTIONS ====================

// Get user by email or username with timeout
async function getUserByEmailOrUsername(identifier) {
  try {
    console.log('🔍 Searching for user with identifier:', identifier);

    const { users } = await connectDB();

    // Add timeout for database query
    const queryPromise = users.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier }
      ],
      isActive: { $ne: false }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const user = await Promise.race([queryPromise, timeoutPromise]);

    if (user) {
      return user;
    } else {
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching user by email/username:', error);
    if (error.message === 'Database query timeout') {
      throw new Error('Database query timeout');
    }
    throw new Error('Database query failed');
  }
}

// getUserById to also provide password status indication
async function getUserById(userId) {
  try {
    const { users } = await connectDB();

    // Add timeout for database query
    const queryPromise = users.findOne({
      _id: new ObjectId(userId),
      isActive: { $ne: false }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const user = await Promise.race([queryPromise, timeoutPromise]);

    if (user) {
      // Remove password from returned user object
      const { password, ...userWithoutPassword } = user;
      userWithoutPassword.password = hasValidPassword(password) ? "exists" : null;

      return userWithoutPassword;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    if (error.message === 'Database query timeout') {
      throw new Error('Database query timeout');
    }
    throw new Error('Database query failed');
  }
}

// Get user by email (for login)
async function getUserByEmail(email) {
  try {
    console.log('🔍 Searching for user by email:', email);

    const { users } = await connectDB();

    // Add timeout for database query
    const queryPromise = users.findOne({
      email: email.toLowerCase(),
      isActive: { $ne: false }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const user = await Promise.race([queryPromise, timeoutPromise]);

    if (user) {
      console.log('✅ User found by email:', { id: user._id, username: user.username, email: user.email });
      return user;
    } else {
      console.log('❌ User not found with email:', email);
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching user by email:', error);
    if (error.message === 'Database query timeout') {
      throw new Error('Database query timeout');
    }
    throw new Error('Database query failed');
  }
}

// Enhanced getUserById untuk return password info yang lebih akurat
async function getUserByUsername(username) {
  try {
    console.log('🔍 Searching for user by username:', username);

    const { users } = await connectDB();

    const queryPromise = users.findOne({
      username: username,
      isActive: { $ne: false }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const user = await Promise.race([queryPromise, timeoutPromise]);

    if (user) {
      console.log('✅ User found by username:', { id: user._id, username: user.username });
      return user;
    } else {
      console.log('❌ User not found with username:', username);
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching user by username:', error);
    if (error.message === 'Database query timeout') {
      throw new Error('Database query timeout');
    }
    throw new Error('Database query failed');
  }
}

// Enhanced getUserById to return complete user data including Google info
async function getUserByIdComplete(userId) {
  try {
    console.log('Searching for complete user data with ID:', userId);

    const { users } = await connectDB();

    const queryPromise = users.findOne(
      { _id: new ObjectId(userId), isActive: { $ne: false } },
      {
        projection: {
        }
      }
    );

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const user = await Promise.race([queryPromise, timeoutPromise]);

    if (user) {
      console.log('Complete user found by ID:', {
        id: user._id,
        username: user.username,
        hasAvatar: !!user.avatar,
        provider: user.provider,
        hasPassword: hasValidPassword(user.password)
      });
      // Return password info untuk frontend validation, tapi hash tetap hidden
      const userResponse = { ...user };
      if (user.password) {
        // Instead of removing password completely, give indication
        userResponse.password = hasValidPassword(user.password) ? "exists" : null;
      }

      return userResponse;
    } else {
      console.log('User not found with ID:', userId);
      return null;
    }
  } catch (error) {
    console.error('Error fetching complete user by ID:', error);
    if (error.message === 'Database query timeout') {
      throw new Error('Database query timeout');
    }
    throw new Error('Database query failed');
  }
}

// Insert a new user into the database
async function insertUser(userData) {
  try {
    console.log('Creating new user:', { username: userData.username, email: userData.email });

    const { users } = await connectDB();

    const userDoc = {
      ...userData,
      email: userData.email.toLowerCase(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await insertWithSync(users, userDoc, 'login_page');
    console.log(`User created with ID: ${result.insertedId}`);
    return result.insertedId;
  } catch (error) {
    console.error('Error inserting user:', error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.email ? 'email' : 'username';
      throw new Error(`This ${field} is already registered`);
    }

    throw new Error('Failed to create user in database');
  }
}

// Update user password
async function updateUserProfile(userId, profileData) {
  try {
    console.log('Updating user profile:', { userId, profileData });

    const { users } = await connectDB();

    const updateDoc = {
      updatedAt: new Date()
    };

    if (profileData.username) {
      updateDoc.username = profileData.username;
    }

    if (profileData.name !== undefined) {
      updateDoc.name = profileData.name;
    }

    const result = await updateWithSync(
      users,
      { _id: new ObjectId(userId) },
      updateDoc,
      'login_page'
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    console.log('User profile updated successfully');
    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error('Error updating user profile:', error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.username ? 'username' : 'email';
      return {
        success: false,
        error: `This ${field} is already taken`
      };
    }

    return {
      success: false,
      error: 'Failed to update profile'
    };
  }
}

// Update user profile (username and name)
async function updateUserPassword(userId, newPassword) {
  try {
    console.log('Updating user password for userId:', userId);

    const { users } = await connectDB();

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    const result = await updateWithSync(
      users,
      { _id: new ObjectId(userId) },
      {
        password: hashedPassword,
        updatedAt: new Date()
      },
      'login_page'
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    console.log('User password updated successfully');
    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error('Error updating user password:', error);
    return {
      success: false,
      error: 'Failed to update password'
    };
  }
}

// Update user avatar
async function updateUserAvatar(userId, avatarUrl) {
  try {
    console.log('Updating user avatar:', { userId, avatarUrl });

    const { users } = await connectDB();

    const result = await updateWithSync(
      users,
      { _id: new ObjectId(userId) },
      {
        avatar: avatarUrl,
        updatedAt: new Date()
      },
      'login_page'
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    console.log('User avatar updated successfully');
    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error('Error updating user avatar:', error);
    return {
      success: false,
      error: 'Failed to update avatar'
    };
  }
}

// ==================== AUTHENTICATION MAIN FUNCTIONS ====================

async function authenticateUser(identifier, password) {
  try {
    console.log('Starting authentication process for:', identifier);

    // Add timeout wrapper
    const authPromise = performAuthentication(identifier, password);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Authentication timeout')), 10000);
    });

    const result = await Promise.race([authPromise, timeoutPromise]);
    return result;
  } catch (error) {
    console.error('Authentication error:', error);

    // Return specific error messages
    if (error.message === 'Authentication timeout') {
      return {
        success: false,
        error: 'Authentication request timed out. Please try again.'
      };
    }

    if (error.message === 'Database connection failed') {
      return {
        success: false,
        error: 'Database connection failed. Please try again later.'
      };
    }

    return {
      success: false,
      error: 'Authentication failed. Please check your credentials and try again.'
    };
  }
}

async function performAuthentication(identifier, password) {
  // Normalize identifier
  const normalizedIdentifier = identifier.trim();

  // Find user by email or username
  console.log('Finding user...');
  const user = await getUserByEmailOrUsername(normalizedIdentifier);

  if (!user) {
    console.log('User not found');
    return {
      success: false,
      error: 'Invalid email/username or password'
    };
  }

  console.log('User found, verifying password...');
  // Verify password
  const isValidPassword = await comparePassword(password, user.password);

  if (!isValidPassword) {
    console.log('Invalid password');
    return {
      success: false,
      error: 'Invalid email/username or password'
    };
  }

  console.log('Authentication successful for user:', user.username);
  return {
    success: true,
    user: {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role || 'guest'  // Tambahkan role
    }
  };
}

async function createUser({ username, email, password, googleId, avatar, provider, name }) {
  try {
    console.log('🔍 Creating user for provider:', provider || 'local');

    const createPromise = performUserCreation({
      username,
      email,
      password,
      googleId,
      avatar,
      provider,
      name
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('User creation timeout')), 10000);
    });

    const result = await Promise.race([createPromise, timeoutPromise]);
    return result;
  } catch (error) {
    console.error('User creation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create user'
    };
  }
}

async function performUserCreation({ username, email, password, googleId, avatar, provider, name }) {
  const normalizedEmail = email.toLowerCase().trim();
  const trimmedUsername = username.trim();

  // Check existing user
  const existingUserByEmail = await getUserByEmailOrUsername(normalizedEmail);
  if (existingUserByEmail) {
    return {
      success: false,
      error: 'An account with this email already exists'
    };
  }

  // Hash password hanya jika ada password
  let hashedPassword = null;
  if (password) {
    hashedPassword = await hashPassword(password);
  }

  // Create user document
  const userDoc = {
    username: trimmedUsername,
    name: name || trimmedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    provider: provider || 'local',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Tambahkan fields Google OAuth jika ada
  if (googleId) {
    userDoc.googleId = googleId;
    userDoc.provider = provider || 'google';
  } else {
    userDoc.provider = 'local';
  }

  if (avatar) {
    userDoc.avatar = avatar;
  }

  console.log('Creating user with complete data:', {
    username: userDoc.username,
    name: userDoc.name,
    email: userDoc.email,
    provider: userDoc.provider,
    hasAvatar: !!userDoc.avatar,
    hasGoogleId: !!userDoc.googleId
  });

  const userId = await insertUser(userDoc);
  return {
    success: true,
    userId: userId.toString()
  };
}

// ==================== CONNECTION HEALTH CHECK ====================

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const { client } = await connectDB();

    // Add timeout for ping
    const pingPromise = client.db('iptv').admin().ping();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout')), 5000);
    });

    await Promise.race([pingPromise, timeoutPromise]);
    console.log('Database connection test successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

async function closeConnection() {
  if (client) {
    try {
      await client.close();
      client = null;
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
}

process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);

// For Vercel serverless functions
process.on('beforeExit', closeConnection);

// ==================== CHROMECAST DEVICE FUNCTIONS ====================

async function getChromecastDevices() {
  try {
    const { chromecast } = await connectDB();
    const devices = await chromecast.find({}).toArray();
    return devices;
  } catch (error) {
    console.error('Error fetching Chromecast devices:', error);
    return [];
  }
}

async function getChromecastDeviceById(deviceId) {
  try {
    const { chromecast } = await connectDB();
    let device;

    // Try to find by ObjectId first, then by numeric id
    try {
      device = await chromecast.findOne({ _id: new ObjectId(deviceId) });
    } catch (objectIdError) {
      // If ObjectId conversion fails, try numeric id
      const numericId = parseInt(deviceId);
      if (!isNaN(numericId)) {
        device = await chromecast.findOne({ idCast: numericId });
      }
    }

    if (device) {
      return device;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error fetching Chromecast device ${deviceId}:`, error);
    return null;
  }
}

async function getChromecastDeviceByName(deviceName) {
  try {
    const { chromecast } = await connectDB();
    const device = await chromecast.findOne({ deviceName: deviceName });
    return device;
  } catch (error) {
    console.error(`Error fetching Chromecast device by name ${deviceName}:`, error);
    return null;
  }
}

async function addChromecastDevice(deviceData) {
  try {
    const { chromecast } = await connectDB();

    // Check if device with same IP already exists
    const existingDevice = await chromecast.findOne({ ipAddr: deviceData.ipAddr });
    if (existingDevice) {
      return {
        success: false,
        error: 'Device with this IP address already exists'
      };
    }

    const deviceDoc = {
      ...deviceData,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const result = await insertWithSync(chromecast, deviceDoc, 'chromecast');
    console.log(`Added new Chromecast device: ${deviceData.deviceName}`);

    return {
      success: true,
      deviceId: result.insertedId
    };
  } catch (error) {
    console.error(`Error adding Chromecast device ${deviceData.deviceName}:`, error);
    return {
      success: false,
      error: 'Failed to add device'
    };
  }
}

async function updateChromecastDevice(deviceName, updateData) {
  try {
    const { chromecast } = await connectDB();

    // Remove sensitive fields from update
    const { _id, createdAt, ...safeUpdateData } = updateData;

    const result = await updateWithSync(
      chromecast,
      { deviceName: deviceName },
      {
        ...safeUpdateData,
        lastUpdated: new Date()
      },
      'chromecast'
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'Device not found'
      };
    }

    console.log(`Updated Chromecast device: ${deviceName}`);
    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error(`Error updating Chromecast device ${deviceName}:`, error);
    return {
      success: false,
      error: 'Failed to update device'
    };
  }
}

async function updateChromecastDeviceStatus(deviceName, statusData) {
  try {
    const { chromecast } = await connectDB();

    const result = await updateWithSync(
      chromecast,
      { deviceName: deviceName },
      {
        ...statusData,
        lastSeen: new Date().toISOString(),
        lastUpdated: new Date()
      },
      'chromecast'
    );

    if (result.matchedCount === 0) {
      return {
        success: false,
        error: 'Device not found'
      };
    }

    console.log(`Updated status for Chromecast device: ${deviceName}`);
    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error(`Error updating Chromecast device status ${deviceName}:`, error);
    return {
      success: false,
      error: 'Failed to update device status'
    };
  }
}

async function deleteChromecastDevice(deviceId) {
  try {
    const { chromecast } = await connectDB();
    let result;

    // Try to delete by ObjectId first, then by numeric id
    try {
      result = await deleteWithSync(chromecast, { _id: new ObjectId(deviceId) }, 'chromecast');
    } catch (objectIdError) {
      // If ObjectId conversion fails, try numeric id
      const numericId = parseInt(deviceId);
      if (!isNaN(numericId)) {
        result = await deleteWithSync(chromecast, { idCast: numericId }, 'chromecast');
      } else {
        throw new Error('Invalid device ID format');
      }
    }

    if (result.deletedCount === 0) {
      return {
        success: false,
        error: 'Device not found'
      };
    }

    console.log(`Deleted Chromecast device: ${deviceId}`);
    return {
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error(`Error deleting Chromecast device ${deviceId}:`, error);
    return {
      success: false,
      error: 'Failed to delete device'
    };
  }
}

async function bulkInsertChromecastDevices(devicesData) {
  try {
    const { chromecast } = await connectDB();

    const devicesWithTimestamps = devicesData.map(device => ({
      ...device,
      createdAt: new Date(),
      lastUpdated: new Date()
    }));

    const result = await bulkInsertWithSync(chromecast, devicesWithTimestamps, 'chromecast');
    console.log(`Inserted ${result.insertedCount} Chromecast devices`);

    return {
      success: true,
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds
    };
  } catch (error) {
    console.error('Error bulk inserting Chromecast devices:', error);
    return {
      success: false,
      error: 'Failed to insert devices'
    };
  }
}

// ==================== AUTO-FIX HISTORY FUNCTIONS ====================

async function saveAutoFixHistory(autoFixData) {
  try {
    const { autoFixHistory } = await connectDB();

    const autoFixDoc = {
      timestamp: autoFixData.timestamp || new Date(),
      deviceId: autoFixData.deviceId,
      deviceType: autoFixData.deviceType || 'chromecast',
      issue: autoFixData.issue,
      mlCategory: autoFixData.mlCategory,
      originalError: autoFixData.originalError || null,
      confidence: autoFixData.confidence || null,
      probabilities: autoFixData.probabilities || [],
      action: autoFixData.action,
      params: autoFixData.params || {},
      description: autoFixData.description,
      status: autoFixData.status || 'pending',
      executedCommand: autoFixData.executedCommand || null,
      output: autoFixData.output || null,
      errorMessage: autoFixData.errorMessage || null,
      triggeredBy: autoFixData.triggeredBy || 'system',
      triggerSource: autoFixData.triggerSource || 'api',
      createdAt: new Date()
    };

    const result = await insertWithSync(autoFixHistory, autoFixDoc, 'auto_fix_history');
    console.log(`Auto-fix history saved: ${result.insertedId}`);
    return { ...autoFixDoc, _id: result.insertedId };
  } catch (error) {
    console.error('Error saving auto-fix history:', error);
    throw error;
  }
}

async function getAutoFixHistoryByDevice(deviceId, limit = 10) {
  try {
    const { autoFixHistory } = await connectDB();
    const history = await autoFixHistory
      .find({ deviceId: deviceId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return history;
  } catch (error) {
    console.error('Error getting auto-fix history:', error);
    return [];
  }
}

async function getAutoFixHistoryByCategory(category, limit = 50) {
  try {
    const { autoFixHistory } = await connectDB();
    const history = await autoFixHistory
      .find({ mlCategory: category })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return history;
  } catch (error) {
    console.error('Error getting auto-fix history by category:', error);
    return [];
  }
}

async function updateAutoFixHistoryStatus(historyId, statusData) {
  try {
    const { autoFixHistory } = await connectDB();

    const result = await updateWithSync(
      autoFixHistory,
      { _id: new ObjectId(historyId) },
      {
        ...statusData,
        updatedAt: new Date()
      },
      'auto_fix_history'
    );

    console.log(`Updated auto-fix history status: ${historyId}`);
    return result;
  } catch (error) {
    console.error('Error updating auto-fix history status:', error);
    return null;
  }
}

// ==================== STAFF FUNCTIONS (Relation with Notifications) ====================

/**
 * Get staff by user ID (linked from login_page)
 * This connects login_page users to staff records
 */
async function getStaffByUserId(userId) {
  try {
    const { staff } = await connectDB();

    const staffMember = await staff.findOne({
      userId: userId,
      isActive: { $ne: false }
    });

    if (!staffMember) {
      return null;
    }

    return staffMember;
  } catch (error) {
    console.error('Error fetching staff by user ID:', error);
    return null;
  }
}

/**
 * Get staff by ID with notification statistics
 * Returns staff profile with count of notifications they handled
 */
async function getStaffById(staffId) {
  try {
    const { staff, notifications } = await connectDB();

    const staffMember = await staff.findOne({
      _id: new ObjectId(staffId),
      isActive: { $ne: false }
    });

    if (!staffMember) {
      return null;
    }

    // Get notification statistics for this staff
    const reportedCount = await notifications.countDocuments({
      reportedByStaffId: staffId
    });

    const assignedCount = await notifications.countDocuments({
      assignedStaffId: staffId
    });

    const handledCount = await notifications.countDocuments({
      handledByStaffId: staffId
    });

    const resolvedCount = await notifications.countDocuments({
      handledByStaffId: staffId,
      reportStatus: 'resolved'
    });

    return {
      ...staffMember,
      statistics: {
        reported: reportedCount,
        assigned: assignedCount,
        handled: handledCount,
        resolved: resolvedCount,
        resolutionRate: handledCount > 0
          ? ((resolvedCount / handledCount) * 100).toFixed(2) + '%'
          : 'N/A'
      }
    };
  } catch (error) {
    console.error('Error fetching staff by ID:', error);
    return null;
  }
}

/**
 * Get all notifications assigned to or handled by a staff member
 */
async function getStaffNotifications(staffId, options = {}) {
  try {
    const { notifications } = await connectDB();

    const query = {
      $or: [
        { reportedByStaffId: staffId },
        { assignedStaffId: staffId },
        { handledByStaffId: staffId }
      ]
    };

    // Add filters if provided
    if (options.status) {
      query.reportStatus = options.status;
    }
    if (options.priority) {
      query.priority = options.priority;
    }

    const sort = options.sort || { createdAt: -1 };
    const limit = options.limit || 50;

    const notificationList = await notifications
      .find(query)
      .sort(sort)
      .limit(limit)
      .toArray();

    return notificationList;
  } catch (error) {
    console.error('Error getting staff notifications:', error);
    return [];
  }
}

/**
 * Get notifications with staff details populated
 * Joins notifications with staff collection to get staff names
 */
async function getNotificationsWithStaff(filters = {}) {
  try {
    const { notifications, staff } = await connectDB();

    const query = {};
    if (filters.status) query.reportStatus = filters.status;
    if (filters.priority) query.priority = filters.priority;

    const notificationList = await notifications
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .toArray();

    // Populate staff details
    const staffIds = new Set();
    notificationList.forEach(notif => {
      if (notif.reportedByStaffId) staffIds.add(notif.reportedByStaffId.toString());
      if (notif.assignedStaffId) staffIds.add(notif.assignedStaffId.toString());
      if (notif.handledByStaffId) staffIds.add(notif.handledByStaffId.toString());
    });

    // Fetch all staff members in one query
    const staffMembers = await staff
      .find({ _id: { $in: Array.from(staffIds).map(id => new ObjectId(id)) } })
      .toArray();

    const staffMap = {};
    staffMembers.forEach(s => {
      staffMap[s._id.toString()] = {
        id: s._id.toString(),
        name: s.name,
        email: s.email,
        department: s.department,
        position: s.position
      };
    });

    // Attach staff details to notifications
    const enrichedNotifications = notificationList.map(notif => ({
      ...notif,
      reportedByStaff: notif.reportedByStaffId ? staffMap[notif.reportedByStaffId.toString()] : null,
      assignedStaff: notif.assignedStaffId ? staffMap[notif.assignedStaffId.toString()] : null,
      handledByStaff: notif.handledByStaffId ? staffMap[notif.handledByStaffId.toString()] : null
    }));

    return enrichedNotifications;
  } catch (error) {
    console.error('Error getting notifications with staff:', error);
    return [];
  }
}

// ==================== EXPORTS ====================

module.exports = {
  // Database connection
  connectDB,

  // Chromecast functions
  getChromecastDevices,
  getChromecastDeviceById,
  getChromecastDeviceByName,
  addChromecastDevice,
  updateChromecastDevice,
  updateChromecastDeviceStatus,
  deleteChromecastDevice,
  bulkInsertChromecastDevices,

  // Channel functions
  getInternationalChannels,
  getLocalChannels,

  // Hospitality TV functions
  getHospitalityTVs,
  getHospitalityTVByRoomNo,
  updateHospitalityTVStatus,
  addHospitalityTV,
  bulkInsertHospitalityTVs,
  deleteHospitalityTV,

  // User CRUD functions
  getUserById,
  getUserByEmailOrUsername,
  getUserByEmail,
  insertUser,
  updateUserProfile,
  updateUserPassword,
  updateUserAvatar,
  getUserByUsername,
  getUserByIdComplete,

  // Authentication functions
  createUser,
  authenticateUser,
  hashPassword,
  hasValidPassword,
  comparePassword,
  updateUserWithGoogleInfo,

  // Auto-fix history functions
  saveAutoFixHistory,
  getAutoFixHistoryByDevice,
  getAutoFixHistoryByCategory,
  updateAutoFixHistoryStatus,

  // Staff functions (relation with notifications)
  getStaffByUserId,
  getStaffById,
  getStaffNotifications,
  getNotificationsWithStaff
};