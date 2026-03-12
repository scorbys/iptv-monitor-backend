// Test slug creation
function createSlug(channelName) {
  if (!channelName) return '';
  return channelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Test cases
const testCases = [
  { input: 'NHK Premium', expected: 'nhk-premium' },
  { input: 'ABC Australia', expected: 'abc-australia' },
  { input: 'CNN Asia', expected: 'cnn-asia' },
  { input: 'KBS World 24', expected: 'kbs-world-24' },
  { input: 'Channel News Asia', expected: 'channel-news-asia' },
  { input: 'Asian Food Ch', expected: 'asian-food-ch' },
  { input: 'CGTN News HD', expected: 'cgtn-news-hd' },
];

console.log('\n=== Testing Slug Creation ===\n');

testCases.forEach(({ input, expected }) => {
  const result = createSlug(input);
  const passed = result === expected ? '✓' : '✗';
  console.log(`${passed} "${input}" -> "${result}" (expected: "${expected}")`);
});

console.log('\n=== Testing Reverse Lookup ===\n');
console.log('Testing if "nhk-premium" will match "NHK Premium"...');

const channels = [
  { channelName: 'NHK Premium', channelNumber: 11 },
  { channelName: 'ABC Australia', channelNumber: 1 },
  { channelName: 'CNN Asia', channelNumber: 6 },
];

const searchSlug = 'nhk-premium';
const matched = channels.find(ch => {
  const slug = createSlug(ch.channelName);
  return slug === searchSlug;
});

if (matched) {
  console.log(`✓ Found matching channel: "${matched.channelName}" (${matched.channelNumber})`);
} else {
  console.log(`✗ No matching channel found for slug: "${searchSlug}"`);
}
