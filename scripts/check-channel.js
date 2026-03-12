// Helper script to check if channel exists in database
require('dotenv').config();
const { connectDB } = require('../db');

async function checkChannel(channelId) {
  console.log(`\n=== Checking for channel: ${channelId} ===\n`);

  const db = await connectDB();

  // Try to find in international channels
  console.log('1. Searching in international_channels...');
  const intlChannel = await db.international.findOne({
    $or: [
      { slug: channelId },
      { channelName: channelId },
      { name: channelId },
      { channelNumber: !isNaN(channelId) ? parseInt(channelId) : null }
    ].filter(Boolean)
  });

  if (intlChannel) {
    console.log('✓ Found in international_channels:');
    console.log(`  - Name: ${intlChannel.channelName || intlChannel.name}`);
    console.log(`  - Number: ${intlChannel.channelNumber}`);
    console.log(`  - Slug: ${intlChannel.slug || 'N/A'}`);
    console.log(`  - ID: ${intlChannel._id}`);
    return intlChannel;
  }

  // Try to find in local channels
  console.log('\n2. Searching in local_channels...');
  const localChannel = await db.local.findOne({
    $or: [
      { slug: channelId },
      { channelName: channelId },
      { name: channelId },
      { channelNumber: !isNaN(channelId) ? parseInt(channelId) : null }
    ].filter(Boolean)
  });

  if (localChannel) {
    console.log('✓ Found in local_channels:');
    console.log(`  - Name: ${localChannel.channelName || localChannel.name}`);
    console.log(`  - Number: ${localChannel.channelNumber}`);
    console.log(`  - Slug: ${localChannel.slug || 'N/A'}`);
    console.log(`  - ID: ${localChannel._id}`);
    return localChannel;
  }

  console.log('\n✗ Channel not found in either collection');
  console.log('\nTip: Check the exact channel name/slug in your database');
  console.log('You can list all channels with: node scripts/list-all-channels.js');

  return null;
}

// Run check
const channelId = process.argv[2] || 'nhk-premium';
checkChannel(channelId)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
