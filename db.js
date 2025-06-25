const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = 'mongodb+srv://mekd1bro:727PlayingCards@cluster0.wnmnw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
let client = null;
let isConnecting = false;

async function connectDB() {
  if (client && client.topology?.isConnected()) {
    const db = client.db('iptv');
    return {
      international: db.collection('international_channels'),
      local: db.collection('local_channels'),
      hospitality: db.collection('tv_hospitality'),
      users: db.collection('login_page'),
      chromecast : db.collection('chromecast'),
      client: client
    };
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (client && client.topology?.isConnected()) {
      const db = client.db('iptv');
      return {
        international: db.collection('international_channels'),
        local: db.collection('local_channels'),
        hospitality: db.collection('tv_hospitality'),
        users: db.collection('login_page'),
        chromecast: db.collection('chromecast'),
        client: client
      };
    }
  }

  try {
    isConnecting = true;
    console.log('Connecting to MongoDB...');
    
    if (!client) {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 30000, // Increased timeout
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true
        });
    }
    
    await client.connect();
    console.log('Connected to MongoDB successfully');
    
    const db = client.db('iptv');
    return {
      international: db.collection('international_channels'),
      local: db.collection('local_channels'),
      hospitality: db.collection('tv_hospitality'),
      users: db.collection('login_page'),
      chromecast: db.collection('chromecast'),
      client: client
    };
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    client = null;
    throw error;
  } finally {
    isConnecting = false;
  }
}

// ==================== CHANNEL FUNCTIONS ====================

async function getInternationalChannels() {
  try {
    const { international } = await connectDB();
    const channels = await international.find({}).toArray();
    console.log(`Retrieved ${channels.length} international channels`);
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
    console.log(`Retrieved ${channels.length} local channels`);
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
    console.log(`Retrieved ${tvs.length} hospitality TVs`);
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
    if (tv) {
      console.log(`Retrieved TV for room ${roomNo}`);
    } else {
      console.log(`No TV found for room ${roomNo}`);
    }
    return tv;
  } catch (error) {
    console.error(`Error fetching TV for room ${roomNo}:`, error);
    return null;
  }
}

async function updateHospitalityTVStatus(roomNo, statusData) {
  try {
    const { hospitality } = await connectDB();
    const result = await hospitality.updateOne(
      { roomNo: roomNo },
      { 
        $set: { 
          ...statusData,
          lastUpdated: new Date()
        } 
      }
    );
    
    console.log(`Updated status for room ${roomNo}`);
    return result;
  } catch (error) {
    console.error(`Error updating status for room ${roomNo}:`, error);
    return null;
  }
}

async function addHospitalityTV(tvData) {
  try {
    const { hospitality } = await connectDB();
    const result = await hospitality.insertOne({
      ...tvData,
      createdAt: new Date(),
      lastUpdated: new Date()
    });
    
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
    
    const result = await hospitality.insertMany(tvsWithTimestamps);
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
    const result = await hospitality.deleteOne({ roomNo: roomNo });
    
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

// ==================== USER CRUD FUNCTIONS ====================

async function getUserByEmailOrUsername(identifier) {
  try {
    console.log('🔍 Searching for user with identifier:', identifier);
    
    const { users } = await connectDB();
    
    const user = await users.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier }
      ],
      isActive: { $ne: false }
    });
    
    if (user) {
      console.log('✅ User found:', { id: user._id, username: user.username, email: user.email });
      return user;
    } else {
      console.log('❌ User not found with identifier:', identifier);
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching user by email/username:', error);
    throw new Error('Database query failed');
  }
}

async function getUserById(userId) {
  try {
    console.log('Searching for user with ID:', userId);

    const { users } = await connectDB();
    
    const user = await users.findOne({ 
      _id: new ObjectId(userId),
      isActive: { $ne: false }
    });
    
    if (user) {
      console.log('User found by ID:', { id: user._id, username: user.username });
      // Remove password from returned user object
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } else {
      console.log('User not found with ID:', userId);
      return null;
    }
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    throw new Error('Database query failed');
  }
}

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
    
    const result = await users.insertOne(userDoc);
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

// ==================== AUTHENTICATION MAIN FUNCTIONS ====================

async function createUser({ username, email, password }) {
  try {
    console.log('Starting user creation process:', { username, email });

    // Normalize inputs
    const normalizedEmail = email.toLowerCase().trim();
    const trimmedUsername = username.trim();
    
    // Check if user already exists by email
    console.log('Checking if email exists:', normalizedEmail);
    const existingUserByEmail = await getUserByEmailOrUsername(normalizedEmail);
    if (existingUserByEmail) {
      console.log('Email already exists');
      return {
        success: false,
        error: 'An account with this email already exists'
      };
    }

    // Check if username exists
    console.log('Checking if username exists:', trimmedUsername);
    const existingUserByUsername = await getUserByEmailOrUsername(trimmedUsername);
    if (existingUserByUsername) {
      console.log('Username already exists');
      return {
        success: false,
        error: 'This username is already taken'
      };
    }

    // Hash password
    console.log('Hashing password...');
    const hashedPassword = await hashPassword(password);
    
    // Create user
    console.log('Inserting user into database...');
    const userId = await insertUser({
      username: trimmedUsername,
      email: normalizedEmail,
      password: hashedPassword
    });

    console.log('User created successfully:', { userId, username: trimmedUsername });
    return {
      success: true,
      userId: userId.toString() // Pastikan ID dikembalikan sebagai string
    };
  } catch (error) {
    console.error('User creation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create user'
    };
  }
}

async function authenticateUser(identifier, password) {
  try {
    console.log('Starting authentication process for:', identifier);

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
        id: user._id.toString(), // Pastikan ID dikembalikan sebagai string
        username: user.username,
        email: user.email
      }
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed due to server error'
    };
  }
}

// ==================== UTILITY FUNCTIONS ====================

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const { client } = await connectDB();
    await client.db('iptv').admin().ping();
    console.log('Database connection test successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', async () => {
  console.log('Shutting down MongoDB connection...');
  if (client) {
    try {
      await client.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
});

process.on('SIGTERM', async () => {
  console.log('Shutting down MongoDB connection...');
  if (client) {
    try {
      await client.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
});

// ==================== CHROMECAST DEVICE FUNCTIONS ====================

async function getChromecastDevices() {
  try {
    const { chromecast } = await connectDB();
    const devices = await chromecast.find({}).toArray();
    console.log(`Retrieved ${devices.length} Chromecast devices`);
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
      console.log(`Retrieved Chromecast device: ${device.deviceName}`);
    } else {
      console.log(`No Chromecast device found with ID: ${deviceId}`);
    }
    return device;
  } catch (error) {
    console.error(`Error fetching Chromecast device ${deviceId}:`, error);
    return null;
  }
}

async function getChromecastDeviceByName(deviceName) {
  try {
    const { chromecast } = await connectDB();
    const device = await chromecast.findOne({ deviceName: deviceName });
    if (device) {
      console.log(`Retrieved Chromecast device by name: ${deviceName}`);
    } else {
      console.log(`No Chromecast device found with name: ${deviceName}`);
    }
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

    const result = await chromecast.insertOne(deviceDoc);
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

    const result = await chromecast.updateOne(
      { deviceName: deviceName },
      { 
        $set: {
          ...safeUpdateData,
          lastUpdated: new Date()
        }
      }
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
    
    const result = await chromecast.updateOne(
      { deviceName: deviceName },
      { 
        $set: {
          ...statusData,
          lastSeen: new Date().toISOString(),
          lastUpdated: new Date()
        }
      }
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
      result = await chromecast.deleteOne({ _id: new ObjectId(deviceId) });
    } catch (objectIdError) {
      // If ObjectId conversion fails, try numeric id
      const numericId = parseInt(deviceId);
      if (!isNaN(numericId)) {
        result = await chromecast.deleteOne({ idCast: numericId });
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

    const result = await chromecast.insertMany(devicesWithTimestamps);
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

// ==================== EXPORTS ====================

module.exports = {
  // Database connection
  connectDB,
  updateConnectedDB,

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
  insertUser,
  
  // Authentication functions
  createUser,
  authenticateUser,
  hashPassword,
  comparePassword
};