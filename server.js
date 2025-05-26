const express = require('express');
const cors = require('cors');
const dgram = require('dgram');
const net = require('net');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Sample channel data based on the screenshots
const internationalChannels = [
  { id: 1, channelNumber: 1, channelName: 'ABC Australia', category: 'ETC', ipMulticast: '238.5.2.224', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/ABC_Australia_logo.svg/200px-ABC_Australia_logo.svg.png' },
  { id: 2, channelNumber: 2, channelName: 'Bloomberg', category: 'ETC', ipMulticast: '238.5.2.124', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Bloomberg_Television_logo.svg/200px-Bloomberg_Television_logo.svg.png' },
  { id: 3, channelNumber: 3, channelName: 'BBC World', category: 'ETC', ipMulticast: '238.5.2.121', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/BBC_World_News_red_logo.svg/200px-BBC_World_News_red_logo.svg.png' },
  { id: 4, channelNumber: 4, channelName: 'NHK World', category: 'ETC', ipMulticast: '238.5.2.125', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NHK_World-Japan_TV.svg/200px-NHK_World-Japan_TV.svg.png' },
  { id: 5, channelNumber: 5, channelName: 'CGTN News HD', category: 'ETC', ipMulticast: '238.5.2.129', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/200px-CGTN.svg.png' },
  { id: 6, channelNumber: 6, channelName: 'CNN Asia', category: 'ETC', ipMulticast: '238.5.2.123', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/200px-CNN.svg.png' },
  { id: 7, channelNumber: 7, channelName: 'Al Jazeera', category: 'ETC', ipMulticast: '238.5.2.127', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/200px-Aljazeera_eng.svg.png' },
  { id: 8, channelNumber: 8, channelName: 'RT Rusia', category: 'News', ipMulticast: '238.5.2.128', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Russia-today-logo.svg/200px-Russia-today-logo.svg.png' },
  { id: 9, channelNumber: 9, channelName: 'KBS Korea', category: 'News', ipMulticast: '238.5.2.220', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/KBS_1_logo.svg/200px-KBS_1_logo.svg.png' },
  { id: 10, channelNumber: 10, channelName: 'KBS World 24', category: 'News', ipMulticast: '238.5.2.219', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/KBS_World_logo.svg/200px-KBS_World_logo.svg.png' },
  { id: 11, channelNumber: 11, channelName: 'NHK Premium', category: 'News', ipMulticast: '238.5.2.226', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/NHK_logo_2020.svg/200px-NHK_logo_2020.svg.png' },
  { id: 12, channelNumber: 12, channelName: 'Arirang 24', category: 'News', ipMulticast: '238.5.2.223', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Arirang_TV_logo.svg/200px-Arirang_TV_logo.svg.png' },
  { id: 13, channelNumber: 13, channelName: 'Metro Globe', category: 'News', ipMulticast: '238.5.2.20', logo: 'https://via.placeholder.com/200x100/0066cc/ffffff?text=Metro+Globe' },
  { id: 14, channelNumber: 14, channelName: 'Arirang', category: 'News', ipMulticast: '238.5.2.221', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Arirang_TV_logo.svg/200px-Arirang_TV_logo.svg.png' },
  { id: 15, channelNumber: 15, channelName: 'RT Planeta', category: 'News', ipMulticast: '238.5.2.227', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Russia-today-logo.svg/200px-Russia-today-logo.svg.png' },
  { id: 16, channelNumber: 16, channelName: 'Al Jazeera Arab', category: 'News', ipMulticast: '238.5.2.228', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/200px-Aljazeera_eng.svg.png' },
  { id: 17, channelNumber: 17, channelName: 'History HD', category: 'ETC', ipMulticast: '238.5.2.80', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/History_Logo.svg/200px-History_Logo.svg.png' },
  { id: 18, channelNumber: 18, channelName: 'CGTN Documentary', category: 'ETC', ipMulticast: '238.5.2.81', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/200px-CGTN.svg.png' },
  { id: 19, channelNumber: 19, channelName: 'Asian Food Ch', category: 'ETC', ipMulticast: '238.5.2.205', logo: 'https://via.placeholder.com/200x100/ff6600/ffffff?text=Asian+Food' },
  { id: 20, channelNumber: 20, channelName: 'Channel News Asia', category: 'News', ipMulticast: '238.5.2.122', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/CNA_new_logo.svg/200px-CNA_new_logo.svg.png' },
  { id: 21, channelNumber: 21, channelName: 'Travel Channel', category: 'ETC', ipMulticast: '238.5.2.206', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Travel_Channel_Logo.svg/200px-Travel_Channel_Logo.svg.png' },
  { id: 22, channelNumber: 22, channelName: 'TV5 Monde', category: 'ETC', ipMulticast: '238.5.2.230', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/TV5Monde_logo.svg/200px-TV5Monde_logo.svg.png' },
  { id: 23, channelNumber: 23, channelName: 'btv', category: 'ETC', ipMulticast: '238.5.2.22', logo: 'https://via.placeholder.com/200x100/0066cc/ffffff?text=BTV' },
  { id: 24, channelNumber: 24, channelName: 'seaToday', category: 'ETC', ipMulticast: '238.5.2.20', logo: 'https://via.placeholder.com/200x100/009900/ffffff?text=seaToday' },
  { id: 25, channelNumber: 25, channelName: 'idtv', category: 'ETC', ipMulticast: '238.5.2.12', logo: 'https://via.placeholder.com/200x100/cc0000/ffffff?text=IDTV' },
  { id: 26, channelNumber: 26, channelName: 'Cartoon Network', category: 'ETC', ipMulticast: '238.5.2.52', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/200px-Cartoon_Network_2010_logo.svg.png' }
];

const localChannels = [
  { id: 27, channelNumber: 1, channelName: 'DW TV', category: 'News', ipMulticast: '238.5.2.222', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_symbol_2012.svg/200px-Deutsche_Welle_symbol_2012.svg.png' },
  { id: 28, channelNumber: 2, channelName: 'Biznet Lifestyle', category: 'ETC', ipMulticast: '238.5.2.200', logo: 'https://via.placeholder.com/200x100/purple/ffffff?text=Biznet+Lifestyle' },
  { id: 29, channelNumber: 3, channelName: 'Biznet Kids', category: 'ETC', ipMulticast: '238.5.2.50', logo: 'https://via.placeholder.com/200x100/ff9900/ffffff?text=Biznet+Kids' },
  { id: 30, channelNumber: 4, channelName: 'DAAI TV', category: 'ETC', ipMulticast: '238.5.2.33', logo: 'https://via.placeholder.com/200x100/0066cc/ffffff?text=DAAI+TV' },
  { id: 31, channelNumber: 5, channelName: 'Magna TV', category: 'ETC', ipMulticast: '238.5.2.21', logo: 'https://via.placeholder.com/200x100/cc0066/ffffff?text=Magna+TV' },
  { id: 32, channelNumber: 6, channelName: 'Sony', category: 'ETC', ipMulticast: '238.5.2.17', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Sony_logo.svg/200px-Sony_logo.svg.png' },
  { id: 33, channelNumber: 7, channelName: 'Trans TV', category: 'ETC', ipMulticast: '238.5.2.15', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Trans_TV_2013.svg/200px-Trans_TV_2013.svg.png' },
  { id: 34, channelNumber: 8, channelName: 'Jak TV', category: 'ETC', ipMulticast: '238.5.2.31', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/JakTV_logo.svg/200px-JakTV_logo.svg.png' },
  { id: 35, channelNumber: 9, channelName: 'GTV 4', category: 'News', ipMulticast: '238.5.2.225', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/GTV_%282017%29.svg/200px-GTV_%282017%29.svg.png' },
  { id: 36, channelNumber: 10, channelName: 'O Channel', category: 'News', ipMulticast: '238.5.2.32', logo: 'https://via.placeholder.com/200x100/ff0000/ffffff?text=O+Channel' },
  { id: 37, channelNumber: 11, channelName: 'Bali TV', category: 'ETC', ipMulticast: '238.5.2.34', logo: 'https://via.placeholder.com/200x100/ff6600/ffffff?text=Bali+TV' },
  { id: 38, channelNumber: 12, channelName: 'JTV', category: 'ETC', ipMulticast: '238.5.2.229', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/JTV_%28Indonesia%29_logo.svg/200px-JTV_%28Indonesia%29_logo.svg.png' },
  { id: 39, channelNumber: 13, channelName: 'Indosiar', category: 'ETC', ipMulticast: '238.5.2.14', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Indosiar_2015.svg/200px-Indosiar_2015.svg.png' },
  { id: 40, channelNumber: 14, channelName: 'TVRI', category: 'ETC', ipMulticast: '238.5.2.10', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TVRILogo2019.svg/200px-TVRILogo2019.svg.png' },
  { id: 41, channelNumber: 15, channelName: 'Kompas TV', category: 'ETC', ipMulticast: '238.5.2.18', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Kompas_TV_%282017%29.svg/200px-Kompas_TV_%282017%29.svg.png' },
  { id: 42, channelNumber: 16, channelName: 'Trans 7', category: 'ETC', ipMulticast: '238.5.2.16', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Trans_7_2013.svg/200px-Trans_7_2013.svg.png' },
  { id: 43, channelNumber: 17, channelName: 'Metro TV', category: 'ETC', ipMulticast: '238.5.2.11', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Metro_TV.svg/200px-Metro_TV.svg.png' },
  { id: 44, channelNumber: 18, channelName: 'JTV', category: 'ETC', ipMulticast: '238.5.2.21', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/JTV_%28Indonesia%29_logo.svg/200px-JTV_%28Indonesia%29_logo.svg.png' },
  { id: 45, channelNumber: 19, channelName: 'Rajawali TV', category: 'ETC', ipMulticast: '238.5.2.30', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/RTV_%28Indonesia%29_logo.svg/200px-RTV_%28Indonesia%29_logo.svg.png' },
  { id: 46, channelNumber: 20, channelName: 'NET HD', category: 'ETC', ipMulticast: '238.5.2.19', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/NET._Logo.svg/200px-NET._Logo.svg.png' },
  { id: 47, channelNumber: 21, channelName: 'Moji', category: 'ETC', ipMulticast: '238.5.2.32', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Moji_logo.svg/200px-Moji_logo.svg.png' }
];

// Store channel status in memory
const channelStatus = new Map();

// Function to check multicast connectivity
async function checkMulticastConnectivity(ipAddress, port = 1234, timeout = 5000) {
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

// Function to check all channels status
async function checkAllChannelsStatus() {
  const allChannels = [...internationalChannels, ...localChannels];
  
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
}

// Initialize channel status check
checkAllChannelsStatus();

// Periodic status check every 2 minutes
setInterval(checkAllChannelsStatus, 120000);

// API Routes

// Get all channels with status
app.get('/api/channels', (req, res) => {
  const { type, sortBy, sortOrder } = req.query;
  
  let channels = [];
  
  if (type === 'international') {
    channels = internationalChannels;
  } else if (type === 'local') {
    channels = localChannels;
  } else {
    channels = [...internationalChannels, ...localChannels];
  }
  
  // Add status information to channels
  const channelsWithStatus = channels.map(channel => {
    const status = channelStatus.get(channel.id) || {
      status: 'offline',
      responseTime: null,
      lastChecked: null,
      error: 'Not checked'
    };
    
    return {
      ...channel,
      ...status,
      type: internationalChannels.find(c => c.id === channel.id) ? 'international' : 'local'
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
  
  res.json({
    success: true,
    data: channelsWithStatus,
    totalCount: channelsWithStatus.length,
    internationalCount: channelsWithStatus.filter(c => c.type === 'international').length,
    localCount: channelsWithStatus.filter(c => c.type === 'local').length,
    onlineCount: channelsWithStatus.filter(c => c.status === 'online').length
  });
});

// Get channel by ID
app.get('/api/channels/:id', (req, res) => {
  const channelId = parseInt(req.params.id);
  const allChannels = [...internationalChannels, ...localChannels];
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
  
  res.json({
    success: true,
    data: {
      ...channel,
      ...status,
      type: internationalChannels.find(c => c.id === channelId) ? 'international' : 'local'
    }
  });
});

// Check specific channel status
app.post('/api/channels/:id/check', async (req, res) => {
  const channelId = parseInt(req.params.id);
  const allChannels = [...internationalChannels, ...localChannels];
  const channel = allChannels.find(c => c.id === channelId);
  
  if (!channel) {
    return res.status(404).json({
      success: false,
      message: 'Channel not found'
    });
  }
  
  try {
    const result = await checkMulticastConnectivity(channel.ipMulticast);
    const statusInfo = {
      ...result,
      lastChecked: new Date().toISOString()
    };
    
    channelStatus.set(channelId, statusInfo);
    
    res.json({
      success: true,
      data: {
        ...channel,
        ...statusInfo,
        type: internationalChannels.find(c => c.id === channelId) ? 'international' : 'local'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking channel status',
      error: error.message
    });
  }
});

// Get dashboard stats
app.get('/api/dashboard/stats', (req, res) => {
  const allChannels = [...internationalChannels, ...localChannels];
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
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IPTV Monitoring API is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, () => {
  console.log(`IPTV Monitoring API server running on http://localhost:${port}`);
  console.log('Starting initial channel status check...');
});

module.exports = app;