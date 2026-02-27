require('dotenv').config({ path: '../.env' });
const { MongoClient, ObjectId } = require('mongodb');

async function fixStaffStats() {
  const uri = process.env.MONGO_URL;

  if (!uri) {
    console.error('❌ Error: MONGO_URL not found in environment variables');
    console.log('Please make sure .env file exists in the backend directory');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
  });

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('iptv');
    const staffCollection = db.collection('staff');
    const notificationsCollection = db.collection('notifications');

    // Get all active staff
    const staff = await staffCollection.find({ isActive: { $ne: false } }).toArray();

    console.log(`Found ${staff.length} staff members to fix`);

    for (const member of staff) {
      // Calculate actual stats from notifications
      const totalAssigned = await notificationsCollection.countDocuments({
        assignedStaffId: member._id
      });

      const totalResolved = await notificationsCollection.countDocuments({
        assignedStaffId: member._id,
        reportStatus: { $in: ['resolved', 'closed'] }
      });

      // Calculate success rate (capped at 100%)
      const successRate = totalAssigned > 0
        ? Math.min(Math.round((totalResolved / totalAssigned) * 100), 100)
        : 100; // Default to 100% if no assignments

      // Update staff stats
      await staffCollection.updateOne(
        { _id: member._id },
        {
          $set: {
            'stats.totalAssigned': totalAssigned,
            'stats.totalResolved': totalResolved,
            'stats.successRate': successRate,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✓ Fixed ${member.name}: ${totalAssigned} assigned, ${totalResolved} resolved, ${successRate}% success`);
    }

    console.log('\n✅ All staff stats have been fixed!');
  } catch (error) {
    console.error('Error fixing staff stats:', error);
  } finally {
    await client.close();
  }
}

fixStaffStats();
