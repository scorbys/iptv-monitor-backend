// List all channels in database
require('dotenv').config();
const { connectDB } = require('../db');

async function listChannels() {
  console.log('\n=== Listing All Channels ===\n');

  const db = await connectDB();

  // List international channels
  console.log('📺 INTERNATIONAL CHANNELS:');
  console.log('─────────────────────────────');
  const intlChannels = await db.international.find({}).limit(20).toArray();

  if (intlChannels.length === 0) {
    console.log('No international channels found');
  } else {
    intlChannels.forEach(ch => {
      console.log(`\n🔹 ${ch.channelName || ch.name || 'Unnamed'}`);
      console.log(`   Number: ${ch.channelNumber || 'N/A'}`);
      console.log(`   Slug: ${ch.slug || 'N/A'}`);
      console.log(`   ID: ${ch._id}`);
    });
    console.log(`\n... and ${await db.international.countDocuments({}) - intlChannels.length} more`);
  }

  // List local channels
  console.log('\n\n📡 LOCAL CHANNELS:');
  console.log('─────────────────────────────');
  const localChannels = await db.local.find({}).limit(20).toArray();

  if (localChannels.length === 0) {
    console.log('No local channels found');
  } else {
    localChannels.forEach(ch => {
      console.log(`\n🔹 ${ch.channelName || ch.name || 'Unnamed'}`);
      console.log(`   Number: ${ch.channelNumber || 'N/A'}`);
      console.log(`   Slug: ${ch.slug || 'N/A'}`);
      console.log(`   ID: ${ch._id}`);
    });
    console.log(`\n... and ${await db.local.countDocuments({}) - localChannels.length} more`);
  }

  console.log('\n\n=== Summary ===');
  console.log(`Total International: ${await db.international.countDocuments({})}`);
  console.log(`Total Local: ${await db.local.countDocuments({})}`);
  console.log(`Grand Total: ${await db.international.countDocuments({}) + await db.local.countDocuments({})}\n`);
}

listChannels()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
