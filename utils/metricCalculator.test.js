// Unit tests for metricCalculator
// Run with: npm test metricCalculator.test.js

const {
  getPacketLossLabel,
  getLatencyLabel,
  getJitterLabel,
  getErrorLabel,
  getRecoveryTimeLabel,
  getOverallLabel,
  generateLabeledMetrics,
  getErrorCategory,
  getErrorCategoryWithDescription,
  generateRandomMetrics,
  LABELS
} = require('./metricCalculator');

// Test suite for metricCalculator
function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  ${error.message}`);
      failed++;
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
    }
  }

  function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
    }
  }

  console.log('\n========================================');
  console.log('Metric Calculator Unit Tests');
  console.log('========================================\n');

  // Packet Loss Label Tests
  console.log('--- Packet Loss Label Tests ---');
  test('Packet loss < 1% should return Excellent (Label 5)', () => {
    const result = getPacketLossLabel(0.5);
    assertEqual(result.label, 5, 'Label should be 5');
    assertEqual(result.category, 'Excellent', 'Category should be Excellent');
    assertEqual(result.color, 'green', 'Color should be green');
  });

  test('Packet loss 1-2% should return Good (Label 4)', () => {
    const result = getPacketLossLabel(1.5);
    assertEqual(result.label, 4, 'Label should be 4');
    assertEqual(result.category, 'Good', 'Category should be Good');
    assertEqual(result.color, 'blue', 'Color should be blue');
  });

  test('Packet loss 2-5% should return Fair (Label 3)', () => {
    const result = getPacketLossLabel(3.5);
    assertEqual(result.label, 3, 'Label should be 3');
    assertEqual(result.category, 'Fair', 'Category should be Fair');
    assertEqual(result.color, 'yellow', 'Color should be yellow');
  });

  test('Packet loss 5-10% should return Poor (Label 2)', () => {
    const result = getPacketLossLabel(7.5);
    assertEqual(result.label, 2, 'Label should be 2');
    assertEqual(result.category, 'Poor', 'Category should be Poor');
    assertEqual(result.color, 'orange', 'Color should be orange');
  });

  test('Packet loss > 10% should return Very Poor (Label 1)', () => {
    const result = getPacketLossLabel(12);
    assertEqual(result.label, 1, 'Label should be 1');
    assertEqual(result.category, 'Very Poor', 'Category should be Very Poor');
    assertEqual(result.color, 'red', 'Color should be red');
  });

  // Latency Label Tests
  console.log('\n--- Latency Label Tests ---');
  test('Latency < 50ms should return Excellent (Label 5)', () => {
    const result = getLatencyLabel(30);
    assertEqual(result.label, 5, 'Label should be 5');
  });

  test('Latency 50-100ms should return Good (Label 4)', () => {
    const result = getLatencyLabel(75);
    assertEqual(result.label, 4, 'Label should be 4');
  });

  test('Latency 100-200ms should return Fair (Label 3)', () => {
    const result = getLatencyLabel(150);
    assertEqual(result.label, 3, 'Label should be 3');
  });

  test('Latency 200-500ms should return Poor (Label 2)', () => {
    const result = getLatencyLabel(350);
    assertEqual(result.label, 2, 'Label should be 2');
  });

  test('Latency > 500ms should return Very Poor (Label 1)', () => {
    const result = getLatencyLabel(600);
    assertEqual(result.label, 1, 'Label should be 1');
  });

  // Jitter Label Tests
  console.log('\n--- Jitter Label Tests ---');
  test('Jitter < 30ms should return Excellent (Label 5)', () => {
    const result = getJitterLabel(20);
    assertEqual(result.label, 5, 'Label should be 5');
  });

  test('Jitter 30-50ms should return Good (Label 4)', () => {
    const result = getJitterLabel(40);
    assertEqual(result.label, 4, 'Label should be 4');
  });

  test('Jitter 50-100ms should return Fair (Label 3)', () => {
    const result = getJitterLabel(75);
    assertEqual(result.label, 3, 'Label should be 3');
  });

  test('Jitter 100-200ms should return Poor (Label 2)', () => {
    const result = getJitterLabel(150);
    assertEqual(result.label, 2, 'Label should be 2');
  });

  test('Jitter > 200ms should return Very Poor (Label 1)', () => {
    const result = getJitterLabel(250);
    assertEqual(result.label, 1, 'Label should be 1');
  });

  // Error Label Tests
  console.log('\n--- Error Label Tests ---');
  test('Error 0-2% should return Excellent (Label 5)', () => {
    const result = getErrorLabel(1);
    assertEqual(result.label, 5, 'Label should be 5');
  });

  test('Error 2-5% should return Good (Label 4)', () => {
    const result = getErrorLabel(3.5);
    assertEqual(result.label, 4, 'Label should be 4');
  });

  test('Error 5-10% should return Fair (Label 3)', () => {
    const result = getErrorLabel(7.5);
    assertEqual(result.label, 3, 'Label should be 3');
  });

  test('Error 10-20% should return Poor (Label 2)', () => {
    const result = getErrorLabel(15);
    assertEqual(result.label, 2, 'Label should be 2');
  });

  test('Error > 20% should return Very Poor (Label 1)', () => {
    const result = getErrorLabel(25);
    assertEqual(result.label, 1, 'Label should be 1');
  });

  // Recovery Time Label Tests
  console.log('\n--- Recovery Time Label Tests ---');
  test('Recovery time < 5s should return Excellent (Label 5)', () => {
    const result = getRecoveryTimeLabel(3);
    assertEqual(result.label, 5, 'Label should be 5');
  });

  test('Recovery time 5-10s should return Good (Label 4)', () => {
    const result = getRecoveryTimeLabel(7.5);
    assertEqual(result.label, 4, 'Label should be 4');
  });

  test('Recovery time 10-20s should return Fair (Label 3)', () => {
    const result = getRecoveryTimeLabel(15);
    assertEqual(result.label, 3, 'Label should be 3');
  });

  test('Recovery time 20-30s should return Poor (Label 2)', () => {
    const result = getRecoveryTimeLabel(25);
    assertEqual(result.label, 2, 'Label should be 2');
  });

  test('Recovery time > 30s should return Very Poor (Label 1)', () => {
    const result = getRecoveryTimeLabel(35);
    assertEqual(result.label, 1, 'Label should be 1');
  });

  // Overall Label Tests
  console.log('\n--- Overall Label Tests ---');
  test('Overall label should average all individual labels', () => {
    const metrics = {
      packetLoss: 0.5,    // Label 5
      latency: 30,        // Label 5
      jitter: 20,         // Label 5
      error: 1,           // Label 5
      recoveryTime: 3     // Label 5
    };
    const result = getOverallLabel(metrics);
    assertEqual(result.label, 5, 'Average of all 5s should be 5');
  });

  test('Overall label should round average correctly', () => {
    const metrics = {
      packetLoss: 1.5,    // Label 4
      latency: 75,        // Label 4
      jitter: 75,         // Label 3
      error: 3.5,         // Label 3
      recoveryTime: 7.5   // Label 4
    };
    const result = getOverallLabel(metrics);
    // Average: (4+4+3+3+4)/5 = 18/5 = 3.6 → rounds to 4
    assertEqual(result.label, 4, 'Average of 4,4,3,3,4 should round to 4');
  });

  // Labeled Metrics Generation Tests
  console.log('\n--- Labeled Metrics Generation Tests ---');
  test('generateLabeledMetrics should include all individual labels', () => {
    const metrics = {
      packetLoss: 0.5,
      latency: 30,
      jitter: 20,
      error: 1,
      recoveryTime: 3
    };
    const result = generateLabeledMetrics(metrics);

    // Check all labels exist
    if (!result.packetLossLabel) throw new Error('Missing packetLossLabel');
    if (!result.latencyLabel) throw new Error('Missing latencyLabel');
    if (!result.jitterLabel) throw new Error('Missing jitterLabel');
    if (!result.errorLabel) throw new Error('Missing errorLabel');
    if (!result.recoveryTimeLabel) throw new Error('Missing recoveryTimeLabel');
    if (!result.overallLabel) throw new Error('Missing overallLabel');

    // Check all labels are 5 (excellent)
    assertEqual(result.packetLossLabel.label, 5, 'packetLossLabel should be 5');
    assertEqual(result.latencyLabel.label, 5, 'latencyLabel should be 5');
    assertEqual(result.jitterLabel.label, 5, 'jitterLabel should be 5');
    assertEqual(result.errorLabel.label, 5, 'errorLabel should be 5');
    assertEqual(result.recoveryTimeLabel.label, 5, 'recoveryTimeLabel should be 5');
    assertEqual(result.overallLabel.label, 5, 'overallLabel should be 5');
  });

  // Error Category Tests
  console.log('\n--- Error Category Tests ---');
  test('High packet loss (>10%) should return Kategori-7', () => {
    const metrics = {
      packetLoss: 12,
      latency: 100,
      jitter: 50,
      error: 5,
      recoveryTime: 10
    };
    const result = getErrorCategory(metrics);
    assertEqual(result, 'Kategori-7', 'Should return Kategori-7 for Connection Failure');
  });

  test('High latency (>500ms) should return Kategori-6', () => {
    const metrics = {
      packetLoss: 5,
      latency: 600,
      jitter: 50,
      error: 5,
      recoveryTime: 10
    };
    const result = getErrorCategory(metrics);
    assertEqual(result, 'Kategori-6', 'Should return Kategori-6 for Player Error');
  });

  test('High jitter (>200ms) should return Kategori-5', () => {
    const metrics = {
      packetLoss: 5,
      latency: 100,
      jitter: 250,
      error: 5,
      recoveryTime: 10
    };
    const result = getErrorCategory(metrics);
    assertEqual(result, 'Kategori-5', 'Should return Kategori-5 for Error Playing');
  });

  test('High error (>20%) should return Kategori-1', () => {
    const metrics = {
      packetLoss: 5,
      latency: 100,
      jitter: 50,
      error: 25,
      recoveryTime: 10
    };
    const result = getErrorCategory(metrics);
    assertEqual(result, 'Kategori-1', 'Should return Kategori-1 for No Device Found');
  });

  // Random Metrics Tests
  console.log('\n--- Random Metrics Generation Tests ---');
  test('generateRandomMetrics should return valid metrics structure', () => {
    const result = generateRandomMetrics();

    // Check all properties exist
    if (typeof result.packetLoss !== 'number') throw new Error('packetLoss should be a number');
    if (typeof result.latency !== 'number') throw new Error('latency should be a number');
    if (typeof result.jitter !== 'number') throw new Error('jitter should be a number');
    if (typeof result.error !== 'number') throw new Error('error should be a number');
    if (typeof result.recoveryTime !== 'number') throw new Error('recoveryTime should be a number');

    // Check values are non-negative
    if (result.packetLoss < 0) throw new Error('packetLoss should be non-negative');
    if (result.latency < 0) throw new Error('latency should be non-negative');
    if (result.jitter < 0) throw new Error('jitter should be non-negative');
    if (result.error < 0) throw new Error('error should be non-negative');
    if (result.recoveryTime < 0) throw new Error('recoveryTime should be non-negative');
  });

  // Error Category with Description Tests
  console.log('\n--- Error Category with Description Tests ---');
  test('getErrorCategoryWithDescription should include metric values', () => {
    const metrics = {
      packetLoss: 12,
      latency: 600,
      jitter: 50,
      error: 5,
      recoveryTime: 10
    };
    const result = getErrorCategoryWithDescription(metrics);

    if (!result.includes('Kategori-7')) {
      throw new Error('Should include Kategori-7');
    }
    if (!result.includes('12.0')) {
      throw new Error('Should include packet loss value');
    }
  });

  // LABELS Constant Tests
  console.log('\n--- LABELS Constant Tests ---');
  test('LABELS should have all 5 labels defined', () => {
    if (!LABELS[1]) throw new Error('LABELS[1] should be defined');
    if (!LABELS[2]) throw new Error('LABELS[2] should be defined');
    if (!LABELS[3]) throw new Error('LABELS[3] should be defined');
    if (!LABELS[4]) throw new Error('LABELS[4] should be defined');
    if (!LABELS[5]) throw new Error('LABELS[5] should be defined');

    // Check structure
    assertEqual(LABELS[5].category, 'Excellent', 'Label 5 should be Excellent');
    assertEqual(LABELS[5].color, 'green', 'Label 5 should be green');
    assertEqual(LABELS[1].category, 'Very Poor', 'Label 1 should be Very Poor');
    assertEqual(LABELS[1].color, 'red', 'Label 1 should be red');
  });

  // Print summary
  console.log('\n========================================');
  console.log(`Tests Passed: ${passed}`);
  console.log(`Tests Failed: ${failed}`);
  console.log(`Total Tests: ${passed + failed}`);
  console.log('========================================\n');

  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();
