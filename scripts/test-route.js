// Test route slug matching logic
require('dotenv').config();
const { connectDB } = require('../db');

// Helper function to create slug from channel name
function createSlug(channelName) {
  if (!channelName) return '';
  return channelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function testRoute() {
  console.log('\n=== Testing Route Slug Matching Logic ===\n');

  const db = await connectDB();

  // Test cases
  const testCases = [
    'nhk-premium',
    'cgtn-documentary',
    'bloomberg',
    'abc-australia',
    'cnn-asia'
  ];

  for (const testSlug of testCases) {
    console.log(`Testing: "${testSlug}"`);

    // Simulate route logic
    let channel = null;

    // Try exact match first
    channel = await db.international.findOne({
      $or: [
        { slug: testSlug },
        { channelName: testSlug },
        { name: testSlug }
      ]
    });

    if (!channel) {
      channel = await db.local.findOne({
        $or: [
          { slug: testSlug },
          { channelName: testSlug },
          { name: testSlug }
        ]
      });
    }

    // Try slug pattern matching
    if (!channel && testSlug.includes('-')) {
      const allChannels = await db.international.find({}).toArray();
      const localChannels = await db.local.find({}).toArray();
      allChannels.push(...localChannels);

      channel = allChannels.find(ch => {
        const channelSlug = createSlug(ch.channelName || ch.name || '');
        return channelSlug === testSlug;
      });
    }

    if (channel) {
      console.log(`  ✓ Found: "${channel.channelName}" (Channel #${channel.channelNumber})`);
    } else {
      console.log(`  ✗ Not found`);
    }
    console.log('');
  }

  console.log('=== Test Complete ===\n');
}

testRoute()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
