const { MongoClient } = require('mongodb');

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
      client: client
    };
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    // Wait for existing connection attempt
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (client && client.topology?.isConnected()) {
      const db = client.db('iptv');
      return {
        international: db.collection('international_channels'),
        local: db.collection('local_channels'),
        hospitality: db.collection('tv_hospitality'),
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
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });
    }
    
    await client.connect();
    console.log('Connected to MongoDB successfully');
    
    const db = client.db('iptv');
    return {
      international: db.collection('international_channels'),
      local: db.collection('local_channels'),
      hospitality: db.collection('tv_hospitality'),
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

async function getInternationalChannels() {
  try {
    const { international } = await connectDB();
    const channels = await international.find({}).toArray();
    console.log(`Retrieved ${channels.length} international channels`);
    return channels;
  } catch (error) {
    console.error('Error fetching international channels:', error);
    return []; // Return empty array instead of throwing
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
    return []; // Return empty array instead of throwing
  }
}

/* 
 * Functions for TV Hospitality
 */

async function getHospitalityTVs() {
  try {
    const { hospitality } = await connectDB();
    const tvs = await hospitality.find({}).toArray();
    console.log(`Retrieved ${tvs.length} hospitality TVs`);
    return tvs;
  } catch (error) {
    console.error('Error fetching hospitality TVs:', error);
    return []; // Return empty array instead of throwing
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
    
    // Add timestamps to each TV record
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

async function updateConnectedDB() {
  try {
    return await connectDB();
  } catch (error) {
    console.error('Error connecting to updated DB:', error);
    throw error;
  }
}

// Graceful shutdown
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
  process.exit(0);
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
  process.exit(0);
});

module.exports = {
  connectDB,
  getInternationalChannels,
  getLocalChannels,
  getHospitalityTVs,
  getHospitalityTVByRoomNo,
  updateHospitalityTVStatus,
  addHospitalityTV,
  bulkInsertHospitalityTVs,
  deleteHospitalityTV,
  updateConnectedDB
};