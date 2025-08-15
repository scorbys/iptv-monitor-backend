require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const uri = process.env.MONGO_URL;

let client = null;
let isConnecting = false;

async function connectDB() {
  if (client && client.topology?.isConnected()) {
    try {
      // Test connection with a quick ping
      await client.db('iptv').admin().ping();
      const db = client.db('iptv');
      return {
        users: db.collection('login_page'),
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
        users: db.collection('login_page'),
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
      users: db.collection('login_page'),
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
    const result = await users.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          googleId: googleData.googleId,
          avatar: googleData.avatar,
          name: googleData.name || null,
          provider: 'google',
          updatedAt: new Date()
        }
      }
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
      console.log('✅ User found:', { id: user._id, username: user.username, email: user.email });
      return user;
    } else {
      console.log('❌ User not found with identifier:', identifier);
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
    console.log('Searching for user with ID:', userId);

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
      console.log('User found by ID:', { id: user._id, username: user.username });
      // Remove password from returned user object
      const { password, ...userWithoutPassword } = user;
      userWithoutPassword.password = hasValidPassword(password) ? "exists" : null;
      
      return userWithoutPassword;
    } else {
      console.log('User not found with ID:', userId);
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

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateDoc }
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

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
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

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          avatar: avatarUrl,
          updatedAt: new Date()
        }
      }
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
      email: user.email
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


// ==================== EXPORTS ====================

module.exports = {
  // Database connection
  connectDB,

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
  updateUserWithGoogleInfo
};