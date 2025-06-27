const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dgram = require('dgram');
const net = require('net');
const { 
  getInternationalChannels, 
  getLocalChannels, 
  getHospitalityTVs, 
  getHospitalityTVByRoomNo,
  getChromecastDevices,
  getChromecastDeviceById,
  createUser,
  authenticateUser
} = require('./db');

const app = express();
const port = process.env.PORT || 3001;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'Pec@tu2024++';

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://iptv-backend-prod.up.railway.app',
    'https://iptv-monitor2.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

// Store channel status in memory
const channelStatus = new Map();
// Store TV status in memory
const tvStatus = new Map();
// Store chromecast status in memory
const chromecastStatus = new Map();

// Configuration for TV status simulation
const TV_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  RESPONSE_TIME_RANGE: { min: 5, max: 150 }, // Response time in ms
  UPDATE_INTERVAL: 120000 // 2 minutes in milliseconds
};
// Configuration for Chromecast status simulation
const CHROMECAST_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.96, // 96% chance of being online
  SIGNAL_LEVEL_RANGE: { min: -70, max: -20 }, // Signal strength in dBm
  SPEED_RANGE: { min: 10, max: 100 }, // Speed in Mbps
  RESPONSE_TIME_RANGE: { min: 10, max: 200 }, // Response time in ms
  UPDATE_INTERVAL: 120000 // 2 minutes in milliseconds
};

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt:', { identifier: req.body.identifier });
    
    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email/username and password are required'
      });
    }

    // Authenticate user
    const result = await authenticateUser(identifier, password);
    console.log('Authentication result:', { success: result.success, userId: result.user?.id });

    if (result.success && result.user) {
      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: result.user.id,
          email: result.user.email,
          username: result.user.username
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log('Login successful for user:', result.user.username);

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email
        },
        message: 'Login successful'
      });
    } else {
      console.log('Login failed:', result.error);
      res.status(401).json({
        success: false,
        error: result.error || 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login'
    });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', { 
      username: req.body.username, 
      email: req.body.email 
    });
    
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Username validation
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
    }

    // Create user
    const result = await createUser({ username, email, password });
    console.log('User creation result:', { success: result.success, userId: result.userId });

    if (result.success && result.userId) {
      // Generate JWT token for new user
      const token = jwt.sign(
        { 
          userId: result.userId,
          email: email,
          username: username
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log('Registration successful for user:', username);

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
          id: result.userId,
          username: username,
          email: email
        }
      });
    } else {
      console.log('Registration failed:', result.error);
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create account'
      });
    }
  } catch (error) {
    console.error('Register API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during registration'
    });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    console.log('User logged out successfully');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Error during logout'
    });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        userId: req.user.userId,
        username: req.user.username,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Error verifying token'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Protected API Routes - Apply authentication middleware
app.use('/api/channels', authenticateToken);
app.use('/api/hospitality', authenticateToken);
app.use('/api/config', authenticateToken);

// Function to check multicast connectivity
async function checkMulticastConnectivity(ipAddress, port = 5000, timeout = 5000) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4');
    let isResolved = false;
    
    // Set timeout
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        client.close();
        resolve({ 
          status: 'offline', 
          responseTime: null,
          error: 'Connection timeout'
        });
      }
    }, timeout);
    
    const startTime = Date.now();
    
    try {
      // Try to bind to the multicast address
      client.bind(port, () => {
        try {
          client.addMembership(ipAddress);
          
          // If we get here, the multicast group is accessible
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            const responseTime = Date.now() - startTime;
            client.close();
            resolve({ 
              status: 'online', 
              responseTime: responseTime,
              error: null
            });
          }
        } catch (membershipError) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            client.close();
            resolve({ 
              status: 'offline', 
              responseTime: null,
              error: membershipError.message
            });
          }
        }
      });
    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        client.close();
        resolve({ 
          status: 'offline', 
          responseTime: null,
          error: error.message
        });
      }
    }

    client.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        client.close();
        resolve({ 
          status: 'offline', 
          responseTime: null,
          error: error.message
        });
      }
    });
  });
}

// Function to generate dummy TV status
function generateDummyTVStatus() {
  const isOnline = Math.random() < TV_STATUS_CONFIG.ONLINE_PROBABILITY;
  const responseTime = isOnline 
    ? Math.floor(Math.random() * (TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.max - TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.min + 1)) + TV_STATUS_CONFIG.RESPONSE_TIME_RANGE.min
    : null;
  
  return {
    status: isOnline ? 'online' : 'offline',
    responseTime,
    error: isOnline ? null : 'Device unreachable'
  };
}

// Function to check TV device connectivity
async function checkTVConnectivity(ipAddress, timeout = 5000) {
  // Use dummy status if configured
  if (TV_STATUS_CONFIG.USE_DUMMY_STATUS) {
    // Add small delay to simulate network checking
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
    return generateDummyTVStatus();
  }

  // Original real connectivity check
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Create a simple TCP connection test
    const socket = new net.Socket();
    let isResolved = false;
    
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({
          status: 'offline',
          responseTime: null,
          error: 'Connection timeout'
        });
      }
    }, timeout);
    
    socket.connect(80, ipAddress, () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({
          status: 'online',
          responseTime: responseTime,
          error: null
        });
      }
    });
    
    socket.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({
          status: 'offline',
          responseTime: null,
          error: error.message
        });
      }
    });
  });
}

// Function to get all channels from database
async function getAllChannelsFromDB() {
  try {
    const [internationalChannels, localChannels] = await Promise.all([
      getInternationalChannels(),
      getLocalChannels()
    ]);
    
    return [...internationalChannels, ...localChannels];
  } catch (error) {
    console.error('Error fetching channels from database:', error);
    return [];
  }
}

// Function to check all channels status
async function checkAllChannelsStatus() {
  try {
    const allChannels = await getAllChannelsFromDB();
    
    for (const channel of allChannels) {
      try {
        const result = await checkMulticastConnectivity(channel.ipMulticast);
        channelStatus.set(channel.id, {
          ...result,
          lastChecked: new Date().toISOString()
        });
      } catch (error) {
        channelStatus.set(channel.id, {
          status: 'offline',
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString()
        });
      }
    }
    
    console.log(`Checked status for ${allChannels.length} channels`);
  } catch (error) {
    console.error('Error checking channels status:', error);
  }
}

// Function to check all TV devices status
async function checkAllTVsStatus() {
  try {
    const allTVs = await getHospitalityTVs();
    
    for (const tv of allTVs) {
      try {
        const result = await checkTVConnectivity(tv.ipAddress);
        tvStatus.set(tv.roomNo, {
          ...result,
          lastChecked: new Date().toISOString()
        });
      } catch (error) {
        tvStatus.set(tv.roomNo, {
          status: 'offline',
          responseTime: null,
          error: error.message,
          lastChecked: new Date().toISOString()
        });
      }
    }
    
    console.log(`Checked status for ${allTVs.length} TV devices${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? ' (using dummy status)' : ''}`);
  } catch (error) {
    console.error('Error checking TV status:', error);
  }
}

// Function to generate dummy Chromecast status
function generateDummyChromecastStatus() {
  const isOnline = Math.random() < CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY;
  const isPingable = isOnline; // Fixed: Added missing variable
  const signalLevel = isOnline 
    ? Math.floor(Math.random() * (CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.max - CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min + 1)) + CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE.min
    : null;
  const speed = isOnline
    ? Math.floor(Math.random() * (CHROMECAST_STATUS_CONFIG.SPEED_RANGE.max - CHROMECAST_STATUS_CONFIG.SPEED_RANGE.min + 1)) + CHROMECAST_STATUS_CONFIG.SPEED_RANGE.min
    : null;
  const responseTime = isOnline 
    ? Math.floor(Math.random() * (CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.max - CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.min + 1)) + CHROMECAST_STATUS_CONFIG.RESPONSE_TIME_RANGE.min
    : null;
  
  return {
    isPingable,
    isOnline,
    signalLevel,
    speed,
    responseTime,
    lastSeen: isOnline ? new Date().toISOString() : null,
    error: isOnline ? null : 'Device unreachable'
  };
}

// Function to check Chromecast device connectivity
async function checkChromecastConnectivity(ipAddr, timeout = 5000) {
  // Use dummy status if configured
  if (CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
    // Add small delay to simulate network checking
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    return generateDummyChromecastStatus();
  }

  // Real connectivity check (simplified version)
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Simple TCP connection test
    const socket = new net.Socket();
    const timeout_id = setTimeout(() => {
      socket.destroy();
      resolve({
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: 'Connection timeout'
      });
    }, timeout);

    socket.connect(8008, ipAddr, () => {
      clearTimeout(timeout_id);
      const responseTime = Date.now() - startTime;
      socket.destroy();
      
      resolve({
        isPingable: true,
        isOnline: true,
        signalLevel: Math.floor(Math.random() * 60) - 80, // Simulated signal
        speed: Math.floor(Math.random() * 90) + 10, // Simulated speed
        responseTime: responseTime,
        lastSeen: new Date().toISOString(),
        error: null
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout_id);
      resolve({
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: err.message
      });
    });
  });
}

// Function to check all Chromecast devices status
async function checkAllChromecastsStatus() {
  try {
    const allDevices = await getChromecastDevices();
    
    for (const device of allDevices) {
      try {
        const result = await checkChromecastConnectivity(device.ipAddr);
        chromecastStatus.set(device.idCast, {
          ...result,
          lastChecked: new Date().toISOString()
        });
      } catch (error) {
        chromecastStatus.set(device.idCast, {
          isPingable: false,
          isOnline: false,
          signalLevel: null,
          speed: null,
          responseTime: null,
          lastSeen: null,
          error: error.message,
          lastChecked: new Date().toISOString()
        });
      }
    }
    
    console.log(`Checked status for ${allDevices.length} Chromecast devices${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? ' (using dummy status)' : ''}`);
  } catch (error) {
    console.error('Error checking Chromecast status:', error);
  }
}

// API Routes for Channels

// Get all channels with status
app.get('/api/channels', async (req, res) => {
  try {
    const { type, sortBy, sortOrder } = req.query;
    
    let channels = [];
    
    if (type === 'international') {
      channels = await getInternationalChannels();
    } else if (type === 'local') {
      channels = await getLocalChannels();
    } else {
      channels = await getAllChannelsFromDB();
    }
    
    // Add status information to channels
    const channelsWithStatus = channels.map(channel => {
      const status = channelStatus.get(channel.id) || {
        status: 'offline',
        responseTime: null,
        lastChecked: null,
        error: 'Not checked'
      };
      
      // Determine channel type based on collection or add type field in your database
      let channelType = 'unknown';
      if (type === 'international') {
        channelType = 'international';
      } else if (type === 'local') {
        channelType = 'local';
      } else {
        // If no specific type requested, determine from database or use a field
        channelType = channel.type || 'unknown';
      }
      
      return {
        ...channel,
        ...status,
        type: channelType
      };
    });
    
    // Sorting
    if (sortBy) {
      channelsWithStatus.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        // Handle different data types
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }
        
        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : -1;
        } else {
          return aValue > bValue ? 1 : -1;
        }
      });
    }
    
    const internationalChannels = await getInternationalChannels();
    const localChannels = await getLocalChannels();
    
    res.json({
      success: true,
      data: channelsWithStatus,
      totalCount: channelsWithStatus.length,
      internationalCount: internationalChannels.length,
      localCount: localChannels.length,
      onlineCount: channelsWithStatus.filter(c => c.status === 'online').length
    });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching channels',
      error: error.message
    });
  }
});

// Get channel by ID
app.get('/api/channels/:id', async (req, res) => {
  try {
    const channelId = parseInt(req.params.id);
    const allChannels = await getAllChannelsFromDB();
    const channel = allChannels.find(c => c.id === channelId);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }
    
    const status = channelStatus.get(channelId) || {
      status: 'offline',
      responseTime: null,
      lastChecked: null,
      error: 'Not checked'
    };
    
    // Determine channel type
    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(c => c.id === channelId) ? 'international' : 'local';
    
    res.json({
      success: true,
      data: {
        ...channel,
        ...status,
        type: channelType
      }
    });
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching channel',
      error: error.message
    });
  }
});

// Check specific channel status
app.post('/api/channels/:id/check', async (req, res) => {
  try {
    const channelId = parseInt(req.params.id);
    const allChannels = await getAllChannelsFromDB();
    const channel = allChannels.find(c => c.id === channelId);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }
    
    const result = await checkMulticastConnectivity(channel.ipMulticast);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString()
    };
    
    channelStatus.set(channelId, statusInfo);
    
    // Determine channel type
    const internationalChannels = await getInternationalChannels();
    const channelType = internationalChannels.find(c => c.id === channelId) ? 'international' : 'local';
    
    res.json({
      success: true,
      data: {
        ...channel,
        ...statusInfo,
        type: channelType
      }
    });
  } catch (error) {
    console.error('Error checking channel status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking channel status',
      error: error.message
    });
  }
});

// Get channel dashboard stats
app.get('/api/channels/dashboard/stats', async (req, res) => {
  try {
    const allChannels = await getAllChannelsFromDB();
    const internationalChannels = await getInternationalChannels();
    const localChannels = await getLocalChannels();
    
    const totalChannels = allChannels.length;
    const onlineChannels = Array.from(channelStatus.values()).filter(s => s.status === 'online').length;
    const offlineChannels = totalChannels - onlineChannels;
    
    // Calculate uptime percentage
    const uptime = totalChannels > 0 ? ((onlineChannels / totalChannels) * 100).toFixed(1) : '0.0';
    
    // Category stats
    const categoryStats = {};
    allChannels.forEach(channel => {
      if (!categoryStats[channel.category]) {
        categoryStats[channel.category] = { total: 0, online: 0, offline: 0 };
      }
      categoryStats[channel.category].total++;
      
      const status = channelStatus.get(channel.id);
      if (status && status.status === 'online') {
        categoryStats[channel.category].online++;
      } else {
        categoryStats[channel.category].offline++;
      }
    });
    
    res.json({
      success: true,
      data: {
        totalChannels,
        onlineChannels,
        offlineChannels,
        uptime,
        categoryStats,
        lastUpdated: new Date().toISOString(),
        internationalChannels: internationalChannels.length,
        localChannels: localChannels.length
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});

// API Routes for TV Hospitality

// Get all hospitality TVs with status
app.get('/api/hospitality/tvs', async (req, res) => {
  try {
    const { status, search, sortBy = 'roomNo', sortOrder = 'asc' } = req.query;
    
    let tvs = await getHospitalityTVs();
    
    // Add status information to TVs
    const tvsWithStatus = tvs.map(tv => {
      const deviceStatus = tvStatus.get(tv.roomNo) || {
        status: 'offline',
        responseTime: null,
        lastChecked: null,
        error: 'Not checked'
      };
      
      return {
        ...tv,
        ...deviceStatus,
        model: tv.model || 'Samsung Hospitality'
      };
    });
    
    // Filter by status
    let filteredTVs = tvsWithStatus;
    if (status && status !== 'all') {
      filteredTVs = tvsWithStatus.filter(tv => tv.status === status);
    }
    
    // Filter by search (room number or IP address)
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredTVs = filteredTVs.filter(tv => 
        tv.roomNo.toString().toLowerCase().includes(searchTerm) ||
        tv.ipAddress.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sorting
    filteredTVs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Special handling for room number sorting
      if (sortBy === 'roomNo') {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
    
    res.json({
      success: true,
      data: filteredTVs,
      totalCount: filteredTVs.length,
      onlineCount: filteredTVs.filter(tv => tv.status === 'online').length,
      offlineCount: filteredTVs.filter(tv => tv.status === 'offline').length
    });
  } catch (error) {
    console.error('Error fetching hospitality TVs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hospitality TVs',
      error: error.message
    });
  }
});

// Get specific TV by room number
app.get('/api/hospitality/tvs/:roomNo', async (req, res) => {
  try {
    const roomNo = req.params.roomNo;
    const tv = await getHospitalityTVByRoomNo(roomNo);
    
    if (!tv) {
      return res.status(404).json({
        success: false,
        message: 'TV not found'
      });
    }
    
    const deviceStatus = tvStatus.get(roomNo) || {
      status: 'offline',
      responseTime: null,
      lastChecked: null,
      error: 'Not checked'
    };
    
    res.json({
      success: true,
      data: {
        ...tv,
        ...deviceStatus,
        model: tv.model || 'Samsung Hospitality'
      }
    });
  } catch (error) {
    console.error('Error fetching TV:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching TV',
      error: error.message
    });
  }
});

// Check specific TV status
app.post('/api/hospitality/tvs/:roomNo/check', async (req, res) => {
  try {
    const roomNo = req.params.roomNo;
    const tv = await getHospitalityTVByRoomNo(roomNo);
    
    if (!tv) {
      return res.status(404).json({
        success: false,
        message: 'TV not found'
      });
    }
    
    const result = await checkTVConnectivity(tv.ipAddress);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString()
    };
    
    tvStatus.set(roomNo, statusInfo);
    
    res.json({
      success: true,
      data: {
        ...tv,
        ...statusInfo,
        model: tv.model || 'Samsung Hospitality'
      }
    });
  } catch (error) {
    console.error('Error checking TV status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking TV status',
      error: error.message
    });
  }
});

// Bulk check all TVs status
app.post('/api/hospitality/tvs/check-all', async (req, res) => {
  try {
    await checkAllTVsStatus();
    
    const allTVs = await getHospitalityTVs();
    
    const tvsWithStatus = allTVs.map(tv => {
      const deviceStatus = tvStatus.get(tv.roomNo) || {
        status: 'offline',
        responseTime: null,
        lastChecked: null,
        error: 'Not checked'
      };
      
      return {
        ...tv,
        ...deviceStatus,
        model: tv.model || 'Samsung Hospitality'
      };
    });
    
    res.json({
      success: true,
      message: 'All TVs status checked',
      data: tvsWithStatus,
      totalCount: tvsWithStatus.length,
      onlineCount: tvsWithStatus.filter(tv => tv.status === 'online').length,
      offlineCount: tvsWithStatus.filter(tv => tv.status === 'offline').length
    });
  } catch (error) {
    console.error('Error checking all TVs status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking all TVs status',
      error: error.message
    });
  }
});

// Get hospitality dashboard stats
app.get('/api/hospitality/dashboard/stats', async (req, res) => {
  try {
    const allTVs = await getHospitalityTVs();
    
    const totalTVs = allTVs.length;
    const onlineTVs = Array.from(tvStatus.values()).filter(s => s.status === 'online').length;
    const offlineTVs = totalTVs - onlineTVs;
    
    // Calculate uptime percentage
    const uptime = totalTVs > 0 ? ((onlineTVs / totalTVs) * 100).toFixed(1) : '0.0';
    
    // Floor stats (based on room number patterns)
    const floorStats = {};
    allTVs.forEach(tv => {
      const floor = Math.floor(parseInt(tv.roomNo) / 100);
      if (!floorStats[floor]) {
        floorStats[floor] = { total: 0, online: 0, offline: 0 };
      }
      floorStats[floor].total++;
      
      const status = tvStatus.get(tv.roomNo);
      if (status && status.status === 'online') {
        floorStats[floor].online++;
      } else {
        floorStats[floor].offline++;
      }
    });
    
    res.json({
      success: true,
      data: {
        totalTVs,
        onlineTVs,
        offlineTVs,
        uptime,
        floorStats,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching hospitality dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hospitality dashboard stats',
      error: error.message
    });
  }
});

// API Routes for Chromecast

// Get all Chromecast devices with status
app.get('/api/chromecast', async (req, res) => {
  try {
    const { status, search, sortBy = 'deviceName', sortOrder = 'asc' } = req.query;
    
    let devices = await getChromecastDevices();
    
    // Add status information to devices
    const devicesWithStatus = devices.map(device => {
      const deviceStatus = chromecastStatus.get(device.idCast) || {
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: 'Not checked',
        lastChecked: null
      };
      
      return {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || 'Google Chromecast'
      };
    });
    
    // Filter by status
    let filteredDevices = devicesWithStatus;
    if (status && status !== 'all') {
      if (status === 'online') {
        filteredDevices = devicesWithStatus.filter(device => device.isOnline);
      } else if (status === 'offline') {
        filteredDevices = devicesWithStatus.filter(device => !device.isOnline);
      }
    }
    
    // Filter by search (device name or IP address)
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredDevices = filteredDevices.filter(device => 
        (device.deviceName && device.deviceName.toLowerCase().includes(searchTerm)) ||
        (device.ipAddr && device.ipAddr.toLowerCase().includes(searchTerm))
      );
    }
    
    // Sorting
    filteredDevices.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
    
    res.json({
      success: true,
      data: filteredDevices,
      totalCount: filteredDevices.length,
      onlineCount: filteredDevices.filter(d => d.isOnline).length, // Fixed: use isOnline instead of online
      offlineCount: filteredDevices.filter(d => !d.isOnline).length // Fixed: use isOnline instead of online
    });
  } catch (error) {
    console.error('Error fetching Chromecast devices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching Chromecast devices',
      error: error.message
    });
  }
});

// Get specific Chromecast device
app.get('/api/chromecast/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    
    // Improved validation: check if it's a valid ObjectId format or numeric
    if (!deviceId || (deviceId.length !== 24 && isNaN(parseInt(deviceId)))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format. Must be a valid ObjectId (24 characters) or numeric ID.'
      });
    }
    
    const device = await getChromecastDeviceById(deviceId);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Chromecast device not found'
      });
    }
    
    const deviceStatus = chromecastStatus.get(device.idCast) || {
      isPingable: false,
      isOnline: false,
      signalLevel: null,
      speed: null,
      responseTime: null,
      lastSeen: null,
      error: 'Not checked',
      lastChecked: null
    };
    
    res.json({
      success: true,
      data: {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || 'Google Chromecast'
      }
    });
  } catch (error) {
    console.error('Error fetching Chromecast device:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching Chromecast device',
      error: error.message
    });
  }
});

// Check specific Chromecast device status
app.post('/api/chromecast/:id/check', async (req, res) => {
  try {
    const deviceId = req.params.id;
    
    // Improved validation
    if (!deviceId || (deviceId.length !== 24 && isNaN(parseInt(deviceId)))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device ID format. Must be a valid ObjectId (24 characters) or numeric ID.'
      });
    }
    
    const device = await getChromecastDeviceById(deviceId);
    
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Chromecast device not found'
      });
    }
    
    const result = await checkChromecastConnectivity(device.ipAddr);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString()
    };
    
    chromecastStatus.set(device.idCast, statusInfo);
    
    res.json({
      success: true,
      data: {
        ...device,
        ...statusInfo,
        id: device.idCast,
        type: device.type,
        model: device.model || 'Google Chromecast'
      }
    });
  } catch (error) {
    console.error('Error checking Chromecast device status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking Chromecast device status',
      error: error.message
    });
  }
});

// Bulk check all Chromecast devices status
app.post('/api/chromecast/check-all', async (req, res) => {
  try {
    await checkAllChromecastsStatus();
    
    const allDevices = await getChromecastDevices();
    
    const devicesWithStatus = allDevices.map(device => {
      const deviceStatus = chromecastStatus.get(device.idCast) || {
        isPingable: false,
        isOnline: false,
        signalLevel: null,
        speed: null,
        responseTime: null,
        lastSeen: null,
        error: 'Not checked',
        lastChecked: null
      };
      
      return {
        ...device,
        ...deviceStatus,
        id: device.idCast,
        type: device.type,
        model: device.model || 'Google Chromecast'
      };
    });
    
    res.json({
      success: true,
      message: 'All Chromecast devices status checked',
      data: devicesWithStatus,
      totalCount: devicesWithStatus.length,
      onlineCount: devicesWithStatus.filter(d => d.isOnline).length, // Fixed: use isOnline
      offlineCount: devicesWithStatus.filter(d => !d.isOnline).length // Fixed: use isOnline
    });
  } catch (error) {
    console.error('Error checking all Chromecast devices status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking all Chromecast devices status',
      error: error.message
    });
  }
});

// Get Chromecast dashboard stats
app.get('/api/chromecast/dashboard/stats', async (req, res) => {
  try {
    const allDevices = await getChromecastDevices();
    
    const totalDevices = allDevices.length;
    const onlineDevices = Array.from(chromecastStatus.values()).filter(s => s.isOnline).length;
    const offlineDevices = totalDevices - onlineDevices;
    
    // Calculate uptime percentage
    const uptime = totalDevices > 0 ? ((onlineDevices / totalDevices) * 100).toFixed(1) : '0.0';
    
    // Type stats
    const typeStats = {};
    allDevices.forEach(device => {
      const type = device.type || 'Unknown';
      if (!typeStats[type]) {
        typeStats[type] = { total: 0, online: 0, offline: 0 };
      }
      typeStats[type].total++;
      
      const status = chromecastStatus.get(device.idCast);
      if (status && status.isOnline) {
        typeStats[type].online++;
      } else {
        typeStats[type].offline++;
      }
    });
    
    // Average signal level and speed
    const onlineStatusList = Array.from(chromecastStatus.values()).filter(s => s.isOnline);
    const avgSignalLevel = onlineStatusList.length > 0 
      ? (onlineStatusList.reduce((sum, s) => sum + (s.signalLevel || 0), 0) / onlineStatusList.length).toFixed(1)
      : null;
    const avgSpeed = onlineStatusList.length > 0
      ? (onlineStatusList.reduce((sum, s) => sum + (s.speed || 0), 0) / onlineStatusList.length).toFixed(1)
      : null;
    
    res.json({
      success: true,
      data: {
        totalDevices,
        onlineDevices,
        offlineDevices,
        uptime,
        typeStats,
        avgSignalLevel,
        avgSpeed,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching Chromecast dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching Chromecast dashboard stats',
      error: error.message
    });
  }
});

// Configuration endpoint to toggle dummy status
app.post('/api/config/tv-status-mode', async (req, res) => {
  try {
    const { useDummyStatus } = req.body;
    
    if (typeof useDummyStatus === 'boolean') {
      TV_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;
      
      // Clear existing status to force refresh
      tvStatus.clear();
      
      // Restart status checks with new mode
      await checkAllTVsStatus();
      
      res.json({
        success: true,
        message: `TV status mode changed to ${useDummyStatus ? 'dummy' : 'real'} connectivity checks`,
        config: {
          useDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
          onlineProbability: TV_STATUS_CONFIG.ONLINE_PROBABILITY,
          responseTimeRange: TV_STATUS_CONFIG.RESPONSE_TIME_RANGE
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid parameter. useDummyStatus must be a boolean'
      });
    }
  } catch (error) {
    console.error('Error updating TV status mode:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating TV status mode',
      error: error.message
    });
  }
});

// Get current configuration
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      tvStatus: {
        useDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
        onlineProbability: TV_STATUS_CONFIG.ONLINE_PROBABILITY,
        responseTimeRange: TV_STATUS_CONFIG.RESPONSE_TIME_RANGE,
        updateInterval: TV_STATUS_CONFIG.UPDATE_INTERVAL
      },
      chromecastStatus: {
        useDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
        onlineProbability: CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY,
        signalLevelRange: CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
        speedRange: CHROMECAST_STATUS_CONFIG.SPEED_RANGE,
        updateInterval: CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL
      }
    }
  });
});

// Configuration endpoint to toggle Chromecast status mode
app.post('/api/config/chromecast-status-mode', async (req, res) => {
  try {
    const { useDummyStatus } = req.body;
    
    if (typeof useDummyStatus === 'boolean') {
      CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS = useDummyStatus;
      
      // Clear existing status to force refresh
      chromecastStatus.clear();
      
      // Restart status checks with new mode
      await checkAllChromecastsStatus();
      
      res.json({
        success: true,
        message: `Chromecast status mode changed to ${useDummyStatus ? 'dummy' : 'real'} connectivity checks`,
        config: {
          useDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS,
          onlineProbability: CHROMECAST_STATUS_CONFIG.ONLINE_PROBABILITY,
          signalLevelRange: CHROMECAST_STATUS_CONFIG.SIGNAL_LEVEL_RANGE,
          speedRange: CHROMECAST_STATUS_CONFIG.SPEED_RANGE,
          updateInterval: CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid parameter. useDummyStatus must be a boolean'
      });
    }
  } catch (error) {
    console.error('Error updating Chromecast status mode:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Chromecast status mode',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IPTV Monitoring API is running',
    timestamp: new Date().toISOString(),
    config: {
      tvDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS,
      chromecastDummyStatus: CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS
    }
  });
});

// Start server
app.listen(port, async () => {
  console.log(`IPTV Monitoring API server running on http://localhost:${port}`);
  console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log(`Chromecast Status Mode: ${CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log('Starting initial status checks...');
  
  // Initialize status checks after server starts
  try {
    await checkAllChannelsStatus();
    await checkAllTVsStatus();
    await checkAllChromecastsStatus();
    console.log('Initial status checks completed');
  } catch (error) {
    console.error('Error during initial status checks:', error);
  }
});

// Periodic status checks
setInterval(checkAllChannelsStatus, 120000); // Every 2 minutes for channels
setInterval(() => {
  if (TV_STATUS_CONFIG.USE_DUMMY_STATUS || CHROMECAST_STATUS_CONFIG.USE_DUMMY_STATUS) {
    checkAllTVsStatus();
    checkAllChromecastsStatus();
  }
}, Math.min(TV_STATUS_CONFIG.UPDATE_INTERVAL, CHROMECAST_STATUS_CONFIG.UPDATE_INTERVAL));

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

module.exports = app;