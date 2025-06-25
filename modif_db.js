const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = 'mongodb+srv://mekd1bro:727PlayingCards@cluster0.wnmnw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
let client = null;
let isConnecting = false;

async function connectDB() {
  if (client && client.topology?.isConnected()) {
    const db = client.db('iptv');
    return {
      users: db.collection('login_page'),
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
        users: db.collection('login_page'),
        client: client
      };
    }
  }

  try {
    isConnecting = true;
    console.log('🔄 Connecting to MongoDB...');
    
    if (!client) {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000, // Increased timeout
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true
      });
    }
    
    await client.connect();
    
    // Test the connection
    await client.db('iptv').admin().ping();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db('iptv');
    
    // Ensure indexes exist for better performance
    try {
      await db.collection('login_page').createIndex({ email: 1 }, { unique: true });
      await db.collection('login_page').createIndex({ username: 1 }, { unique: true });
      console.log('📊 Database indexes ensured');
    } catch (indexError) {
      // Indexes might already exist, which is fine
      console.log('📊 Database indexes already exist or couldn\'t be created');
    }
    
    return {
      users: db.collection('login_page'),
      client: client
    };
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    client = null;
    throw new Error(`Database connection failed: ${error.message}`);
  } finally {
    isConnecting = false;
  }
}

// ==================== AUTHENTICATION HELPER FUNCTIONS ====================

async function hashPassword(password) {
  try {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('🔐 Password hashed successfully');
    return hashedPassword;
  } catch (error) {
    console.error('❌ Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

async function comparePassword(password, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    console.log('🔍 Password comparison result:', isMatch);
    return isMatch;
  } catch (error) {
    console.error('❌ Error comparing password:', error);
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
        { email: identifier.toLowerCase() }, // Make email search case-insensitive
        { username: identifier }
      ],
      isActive: { $ne: false } // Only get active users
    });
    
    if (user) {
      console.log('✅ User found:', { id: user._id, username: user.username, email: user.email });
    } else {
      console.log('❌ User not found with identifier:', identifier);
    }
    
    return user;
  } catch (error) {
    console.error('❌ Error fetching user by email/username:', error);
    throw new Error('Failed to fetch user');
  }
}

async function getUserById(userId) {
  try {
    console.log('🔍 Searching for user with ID:', userId);
    
    const { users } = await connectDB();
    
    const user = await users.findOne({ 
      _id: new ObjectId(userId),
      isActive: { $ne: false }
    });
    
    if (user) {
      console.log('✅ User found by ID:', { id: user._id, username: user.username });
      // Remove password from returned user object
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } else {
      console.log('❌ User not found with ID:', userId);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching user by ID:', error);
    throw new Error('Failed to fetch user by ID');
  }
}

async function insertUser(userData) {
  try {
    console.log('➕ Creating new user:', { username: userData.username, email: userData.email });
    
    const { users } = await connectDB();
    
    const userDoc = {
      ...userData,
      email: userData.email.toLowerCase(), // Store email in lowercase
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await users.insertOne(userDoc);
    console.log(`✅ User created with ID: ${result.insertedId}`);
    return result.insertedId;
  } catch (error) {
    console.error('❌ Error inserting user:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = error.keyPattern?.email ? 'email' : 'username';
      throw new Error(`This ${field} is already registered`);
    }
    
    throw new Error('Failed to create user');
  }
}

async function updateUserProfile(userId, updateData) {
  try {
    console.log('📝 Updating user profile:', userId);
    
    const { users } = await connectDB();
    
    // Remove sensitive fields from update
    const { password, _id, createdAt, ...safeUpdateData } = updateData;
    
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: {
          ...safeUpdateData,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated user profile: ${userId}`);
    return result;
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    throw new Error('Failed to update user profile');
  }
}

// ==================== AUTHENTICATION MAIN FUNCTIONS ====================

async function createUser({ username, email, password }) {
  try {
    console.log('🚀 Starting user creation process:', { username, email });
    
    // Normalize inputs
    const normalizedEmail = email.toLowerCase().trim();
    const trimmedUsername = username.trim();
    
    // Check if user already exists by email
    console.log('🔍 Checking if email exists:', normalizedEmail);
    const existingUserByEmail = await getUserByEmailOrUsername(normalizedEmail);
    if (existingUserByEmail) {
      console.log('❌ Email already exists');
      return {
        success: false,
        error: 'An account with this email already exists'
      };
    }

    // Check if username exists
    console.log('🔍 Checking if username exists:', trimmedUsername);
    const existingUserByUsername = await getUserByEmailOrUsername(trimmedUsername);
    if (existingUserByUsername) {
      console.log('❌ Username already exists');
      return {
        success: false,
        error: 'This username is already taken'
      };
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await hashPassword(password);
    
    // Create user
    console.log('➕ Inserting user into database...');
    const userId = await insertUser({
      username: trimmedUsername,
      email: normalizedEmail,
      password: hashedPassword
    });

    console.log('✅ User created successfully:', { userId, username: trimmedUsername });
    return {
      success: true,
      userId: userId
    };
  } catch (error) {
    console.error('❌ User creation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create user'
    };
  }
}

async function authenticateUser(identifier, password) {
  try {
    console.log('🔐 Starting authentication process for:', identifier);
    
    // Normalize identifier
    const normalizedIdentifier = identifier.toLowerCase().trim();
    
    // Find user by email or username
    console.log('🔍 Finding user...');
    const user = await getUserByEmailOrUsername(normalizedIdentifier);
    
    if (!user) {
      console.log('❌ User not found');
      return {
        success: false,
        error: 'Invalid email/username or password'
      };
    }
    
    console.log('✅ User found, verifying password...');
    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password');
      return {
        success: false,
        error: 'Invalid email/username or password'
      };
    }

    console.log('✅ Authentication successful for user:', user.username);
    return {
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    };
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed due to server error'
    };
  }
}

async function changeUserPassword(userId, currentPassword, newPassword) {
  try {
    console.log('🔑 Changing password for user:', userId);
    
    const { users } = await connectDB();
    
    // Get current user
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return { success: false, error: 'Current password is incorrect' };
    }
    
    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);
    
    // Update password
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          password: hashedNewPassword,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Password changed for user: ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error changing password:', error);
    return { success: false, error: 'Failed to change password' };
  }
}

// ==================== UTILITY FUNCTIONS ====================

async function testConnection() {
  try {
    console.log('🧪 Testing database connection...');
    const { client } = await connectDB();
    await client.db('iptv').admin().ping();
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}

async function updateConnectedDB() {
  try {
    return await connectDB();
  } catch (error) {
    console.error('❌ Error connecting to updated DB:', error);
    throw error;
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down MongoDB connection...');
  if (client) {
    try {
      await client.close();
      console.log('✅ MongoDB connection closed');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down MongoDB connection...');
  if (client) {
    try {
      await client.close();
      console.log('✅ MongoDB connection closed');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
    }
  }
  process.exit(0);
});

// ==================== EXPORTS ====================

module.exports = {
  // Database connection
  connectDB,
  updateConnectedDB,
  testConnection,

  // User CRUD functions
  getUserById,
  getUserByEmailOrUsername,
  insertUser,
  updateUserProfile,
  
  // Authentication functions
  createUser,
  authenticateUser,
  changeUserPassword,
  hashPassword,
  comparePassword
};