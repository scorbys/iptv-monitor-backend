/**
 * Script untuk mengubah akun mekd1bro@gmail.com menjadi admin
 *
 * Usage:
 *   node backend/scripts/set-admin.js
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

// Debug: check if MONGO_URL is loaded
const uri = process.env.MONGO_URL;
if (!uri) {
  console.error('❌ MONGO_URL not found in environment variables!');
  console.log('Current env file:', process.env.NODE_ENV || '.env');
  process.exit(1);
}

const ADMIN_EMAIL = 'mekd1bro@gmail.com';

async function setAdminRole() {
  let client;

  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('🔗 Connection string:', uri.replace(/:([^:@]{1,10})@/, ':****@')); // Hide password
    client = new MongoClient(uri);

    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('iptv');
    const usersCollection = db.collection('login_page');

    // Cari user dengan email mekd1bro@gmail.com
    console.log(`\n🔍 Searching for user: ${ADMIN_EMAIL}`);
    const user = await usersCollection.findOne({ email: ADMIN_EMAIL });

    if (!user) {
      console.log(`❌ User with email ${ADMIN_EMAIL} not found!`);
      console.log('\n💡 Available users:');
      const allUsers = await usersCollection.find({}).project({ email: 1, username: 1, role: 1 }).toArray();
      allUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.username}) - Role: ${u.role || 'not set'}`);
      });
      return;
    }

    console.log(`\n👤 Found user:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Role: ${user.role || 'not set'}`);

    // Update role menjadi admin
    console.log(`\n🔧 Updating role to 'admin'...`);
    const result = await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          role: 'admin',
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Successfully updated user role to 'admin'`);

      // Verifikasi update
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      console.log(`\n✨ Updated user info:`);
      console.log(`   ID: ${updatedUser._id}`);
      console.log(`   Username: ${updatedUser.username}`);
      console.log(`   Email: ${updatedUser.email}`);
      console.log(`   Role: ${updatedUser.role}`);
    } else {
      console.log(`⚠️  No changes made (user might already be admin)`);
    }

    // Tampilkan semua users dan roles
    console.log(`\n📋 All users and their roles:`);
    const allUsers = await usersCollection.find({}).project({ email: 1, username: 1, role: 1 }).toArray();
    allUsers.forEach(u => {
      const roleIcon = u.role === 'admin' ? '👑' : '👤';
      console.log(`   ${roleIcon} ${u.email} (${u.username}) - Role: ${u.role || 'guest'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 MongoDB connection closed');
    }
  }
}

// Jalankan script
setAdminRole();
