const express = require('express');
const cors = require('cors');
const dgram = require('dgram');
const net = require('net');
const { 
  getInternationalChannels, 
  getLocalChannels, 
  getHospitalityTVs, 
  getHospitalityTVByRoomNo, 
  updateHospitalityTVStatus 
} = require('./db');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store channel status in memory
const channelStatus = new Map();
// Store TV status in memory
const tvStatus = new Map();

// Configuration for TV status simulation
const TV_STATUS_CONFIG = {
  USE_DUMMY_STATUS: true, // Set to false for real connectivity checks
  ONLINE_PROBABILITY: 0.85, // 85% chance of being online
  RESPONSE_TIME_RANGE: { min: 5, max: 150 }, // Response time in ms
  UPDATE_INTERVAL: 30000 // 30 seconds
};

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
      }
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IPTV Monitoring API is running',
    timestamp: new Date().toISOString(),
    config: {
      tvDummyStatus: TV_STATUS_CONFIG.USE_DUMMY_STATUS
    }
  });
});

// Start server
app.listen(port, async () => {
  console.log(`IPTV Monitoring API server running on http://localhost:${port}`);
  console.log(`TV Status Mode: ${TV_STATUS_CONFIG.USE_DUMMY_STATUS ? 'Dummy Status (Testing)' : 'Real Connectivity Checks'}`);
  console.log('Starting initial channel status check...');
  
  // Initialize status checks after server starts
  try {
    await checkAllChannelsStatus();
    await checkAllTVsStatus();
    console.log('Initial status checks completed');
  } catch (error) {
    console.error('Error during initial status checks:', error);
  }
});

// Periodic status checks with dynamic interval for TVs
setInterval(checkAllChannelsStatus, 120000); // Every 2 minutes for channels
setInterval(() => {
  // Only run periodic checks if using dummy status or if explicitly configured
  if (TV_STATUS_CONFIG.USE_DUMMY_STATUS) {
    checkAllTVsStatus();
  }
}, TV_STATUS_CONFIG.UPDATE_INTERVAL); // Configurable interval for TVs

module.exports = app;