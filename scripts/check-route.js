// Check if the route file has the slug matching logic
const fs = require('fs');
const path = require('path');

const routePath = path.join(__dirname, '../api/channels/route.js');
const routeContent = fs.readFileSync(routePath, 'utf8');

const hasSlugFunction = routeContent.includes('function createSlug(channelName)');
const hasSlugMatching = routeContent.includes('Try by matching slug pattern');
const hasAllChannelsFetch = routeContent.includes('allChannels.push');

console.log('\n=== Route File Analysis ===\n');
console.log(`✓ Has createSlug function: ${hasSlugFunction ? 'YES' : 'NO'}`);
console.log(`✓ Has slug pattern matching: ${hasSlugMatching ? 'YES' : 'NO'}`);
console.log(`✓ Has all channels fetch: ${hasAllChannelsFetch ? 'YES' : 'NO'}`);

if (hasSlugFunction && hasSlugMatching && hasAllChannelsFetch) {
  console.log('\n✓ Route file has the latest code with slug matching');
  console.log('⚠ But the server needs to be RESTARTED to load the new code!\n');
} else {
  console.log('\n✗ Route file is missing slug matching logic\n');
}

console.log('=== Instructions ===\n');
console.log('1. Stop the backend server (Ctrl+C)');
console.log('2. Start it again: cd backend && npm start');
console.log('3. Then test the auto-fix button again\n');
