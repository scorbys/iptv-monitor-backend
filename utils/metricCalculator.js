// Metric calculation and labeling utilities for channel performance
// This module handles all business logic for metric evaluation and categorization

// ==================== LABEL DEFINITIONS ====================
const LABELS = {
  5: {
    label: 5,
    category: "Excellent",
    color: "green",
    description: "Performance is optimal"
  },
  4: {
    label: 4,
    category: "Good",
    color: "blue",
    description: "Performance is acceptable"
  },
  3: {
    label: 3,
    category: "Fair",
    color: "yellow",
    description: "Performance needs attention"
  },
  2: {
    label: 2,
    category: "Poor",
    color: "orange",
    description: "Performance is degraded"
  },
  1: {
    label: 1,
    category: "Very Poor",
    color: "red",
    description: "Performance is critical"
  }
};

// ==================== INDIVIDUAL METRIC LABELING ====================

/**
 * Calculate packet loss label based on percentage
 * @param {number} packetLoss - Packet loss percentage
 * @returns {Object} Label object with category, color, and description
 */
function getPacketLossLabel(packetLoss) {
  if (packetLoss < 1) return LABELS[5]; // Excellent (Label 5): < 1%
  if (packetLoss >= 1 && packetLoss <= 2) return LABELS[4]; // Good (Label 4): 1% - 2%
  if (packetLoss > 2 && packetLoss <= 5) return LABELS[3]; // Fair (Label 3): 2% - 5%
  if (packetLoss > 5 && packetLoss <= 10) return LABELS[2]; // Poor (Label 2): > 5% to 10%
  return LABELS[1]; // Very Poor (Label 1): > 10%
}

/**
 * Calculate latency label based on milliseconds
 * @param {number} latency - Latency in milliseconds
 * @returns {Object} Label object with category, color, and description
 */
function getLatencyLabel(latency) {
  if (latency < 50) return LABELS[5]; // Excellent (Label 5): < 50ms
  if (latency >= 50 && latency <= 100) return LABELS[4]; // Good (Label 4): 50ms - 100ms
  if (latency > 100 && latency <= 200) return LABELS[3]; // Fair (Label 3): 100ms - 200ms
  if (latency > 200 && latency <= 500) return LABELS[2]; // Poor (Label 2): > 200ms to 500ms
  return LABELS[1]; // Very Poor (Label 1): > 500ms
}

/**
 * Calculate jitter label based on milliseconds
 * @param {number} jitter - Jitter in milliseconds
 * @returns {Object} Label object with category, color, and description
 */
function getJitterLabel(jitter) {
  if (jitter < 30) return LABELS[5]; // Excellent (Label 5): < 30ms
  if (jitter >= 30 && jitter <= 50) return LABELS[4]; // Good (Label 4): 30ms - 50ms
  if (jitter > 50 && jitter <= 100) return LABELS[3]; // Fair (Label 3): 50ms - 100ms
  if (jitter > 100 && jitter <= 200) return LABELS[2]; // Poor (Label 2): > 100ms to 200ms
  return LABELS[1]; // Very Poor (Label 1): > 200ms
}

/**
 * Calculate error percentage label
 * @param {number} error - Error percentage
 * @returns {Object} Label object with category, color, and description
 */
function getErrorLabel(error) {
  if (error >= 0 && error <= 2) return LABELS[5]; // Excellent (Label 5): 0% - 2%
  if (error > 2 && error <= 5) return LABELS[4]; // Good (Label 4): 2% - 5%
  if (error > 5 && error <= 10) return LABELS[3]; // Fair (Label 3): 5% - 10%
  if (error > 10 && error <= 20) return LABELS[2]; // Poor (Label 2): > 10% to 20%
  return LABELS[1]; // Very Poor (Label 1): > 20%
}

/**
 * Calculate recovery time label
 * @param {number} recoveryTime - Recovery time in seconds
 * @returns {Object} Label object with category, color, and description
 */
function getRecoveryTimeLabel(recoveryTime) {
  if (recoveryTime >= 0 && recoveryTime < 5) return LABELS[5]; // Excellent (Label 5): < 5s
  if (recoveryTime >= 5 && recoveryTime <= 10) return LABELS[4]; // Good (Label 4): 5s - 10s
  if (recoveryTime > 10 && recoveryTime <= 20) return LABELS[3]; // Fair (Label 3): 10s - 20s
  if (recoveryTime > 20 && recoveryTime <= 30) return LABELS[2]; // Poor (Label 2): > 20s to 30s
  return LABELS[1]; // Very Poor (Label 1): > 30s
}

// ==================== OVERALL METRIC CALCULATION ====================

/**
 * Calculate overall label (average of all individual labels)
 * @param {Object} metrics - Object containing all metrics
 * @param {number} metrics.packetLoss - Packet loss percentage
 * @param {number} metrics.latency - Latency in milliseconds
 * @param {number} metrics.jitter - Jitter in milliseconds
 * @param {number} metrics.error - Error percentage
 * @param {number} metrics.recoveryTime - Recovery time in seconds
 * @returns {Object} Label object with category, color, and description
 */
function getOverallLabel(metrics) {
  const labels = [
    getPacketLossLabel(metrics.packetLoss).label,
    getLatencyLabel(metrics.latency).label,
    getJitterLabel(metrics.jitter).label,
    getErrorLabel(metrics.error).label,
    getRecoveryTimeLabel(metrics.recoveryTime).label
  ];

  const averageLabel = labels.reduce((sum, label) => sum + label, 0) / labels.length;
  return LABELS[Math.round(averageLabel)];
}

// ==================== LABELED METRICS GENERATION ====================

/**
 * Generate complete labeled metrics for a channel or device
 * @param {Object} metrics - Raw metrics object
 * @param {boolean} isOffline - Whether the device is offline (optional)
 * @returns {Object} Complete metrics with labels for each metric and overall
 */
function generateLabeledMetrics(metrics, isOffline = false) {
  // If device is offline, override all labels to Very Poor (Label 1)
  if (isOffline) {
    return {
      ...metrics,
      packetLossLabel: LABELS[1], // Very Poor
      latencyLabel: LABELS[1],    // Very Poor
      jitterLabel: LABELS[1],     // Very Poor
      errorLabel: LABELS[1],      // Very Poor
      recoveryTimeLabel: LABELS[1], // Very Poor
      overallLabel: LABELS[1]     // Very Poor
    };
  }

  // Normal calculation for online devices
  return {
    ...metrics,
    packetLossLabel: getPacketLossLabel(metrics.packetLoss),
    latencyLabel: getLatencyLabel(metrics.latency),
    jitterLabel: getJitterLabel(metrics.jitter),
    errorLabel: getErrorLabel(metrics.error),
    recoveryTimeLabel: getRecoveryTimeLabel(metrics.recoveryTime),
    overallLabel: getOverallLabel(metrics)
  };
}

// ==================== ERROR CATEGORY MAPPING ====================

/**
 * Calculate error category for offline channels
 * Maps metrics to FAQ categories (Kategori-1, Kategori-2, etc.)
 * @param {Object} metrics - Channel metrics object
 * @returns {string} FAQ category identifier
 */
function getErrorCategory(metrics) {
  // Determine which metric has the worst performance
  const packetLossLabel = getPacketLossLabel(metrics.packetLoss).label;
  const latencyLabel = getLatencyLabel(metrics.latency).label;
  const jitterLabel = getJitterLabel(metrics.jitter).label;
  const errorLabel = getErrorLabel(metrics.error).label;
  const recoveryTimeLabel = getRecoveryTimeLabel(metrics.recoveryTime).label;

  // Find the worst (lowest) label
  const worstLabel = Math.min(
    packetLossLabel,
    latencyLabel,
    jitterLabel,
    errorLabel,
    recoveryTimeLabel
  );

  // Map label to FAQ categories based on severity and type of issue
  if (worstLabel === 1) { // Very Poor - Critical issues
    // Determine specific category based on which metric is worst
    if (metrics.packetLoss > 10) {
      // Network-related critical issues
      if (metrics.latency > 500) return "Kategori-12"; // Network Connection Failed
      return "Kategori-7"; // Connection Failure
    }
    if (metrics.latency > 500) return "Kategori-6"; // Player Error
    if (metrics.jitter > 200) return "Kategori-5"; // Error Playing
    if (metrics.error > 20) {
      // Device authentication or initialization issues
      if (metrics.recoveryTime > 30) return "Kategori-13"; // System Initialization Error
      return "Kategori-1"; // No Device Found
    }
    return "Kategori-6"; // Default critical
  }

  if (worstLabel === 2) { // Poor - Major issues
    if (metrics.packetLoss > 5) {
      // Network issues with moderate packet loss
      if (metrics.jitter > 100) return "Kategori-12"; // Network Connection Failed
      return "Kategori-11"; // Channel Not Found
    }
    if (metrics.latency > 200) return "Kategori-5"; // Error Playing
    if (metrics.jitter > 100) return "Kategori-3"; // Unplug LAN
    if (metrics.error > 10) {
      // Authentication or device registration issues
      if (metrics.recoveryTime > 20) return "Kategori-14"; // No Device Found: Logined
      return "Kategori-2"; // Weak Signal
    }
    return "Kategori-11"; // Default poor
  }

  if (worstLabel === 3) { // Fair - Minor issues
    if (metrics.packetLoss > 2) return "Kategori-4"; // Setup Issue
    if (metrics.latency > 100) return "Kategori-2"; // Weak Signal
    if (metrics.jitter > 50) return "Kategori-3"; // Unplug LAN
    if (metrics.error > 5) return "Kategori-8"; // Reset Config
    return "Kategori-4"; // Default fair
  }

  if (worstLabel === 4) { // Good - Minor performance degradation
    return "Kategori-9"; // No Device Logged
  }

  // Label 5 - Excellent
  return "Kategori-10"; // Black Screen (minimal issue)
}

/**
 * Get error category with detailed description for export/display
 * @param {Object} metrics - Channel metrics object
 * @returns {string} Category with metric context
 */
function getErrorCategoryWithDescription(metrics) {
  const category = getErrorCategory(metrics);

  // Add more context based on metrics
  if (category === "Kategori-1") {
    return `Kategori-1 (No Device Found - Loss: ${metrics.packetLoss.toFixed(1)}%)`;
  } else if (category === "Kategori-2") {
    return `Kategori-2 (Weak Signal - Signal: ${metrics.latency}ms)`;
  } else if (category === "Kategori-3") {
    return `Kategori-3 (Unplug LAN - Jitter: ${metrics.jitter}ms)`;
  } else if (category === "Kategori-5") {
    return `Kategori-5 (Error Playing - Error: ${metrics.error.toFixed(1)}%)`;
  } else if (category === "Kategori-6") {
    return `Kategori-6 (Player Error - Latency: ${metrics.latency}ms)`;
  } else if (category === "Kategori-7") {
    return `Kategori-7 (Connection Failure - Loss: ${metrics.packetLoss.toFixed(1)}%)`;
  } else if (category === "Kategori-11") {
    return `Kategori-11 (Channel Not Found - Loss: ${metrics.packetLoss.toFixed(1)}%)`;
  } else if (category === "Kategori-12") {
    return `Kategori-12 (Network Connection Failed - Loss: ${metrics.packetLoss.toFixed(1)}%, Latency: ${metrics.latency}ms)`;
  } else if (category === "Kategori-13") {
    return `Kategori-13 (System Init Error - Error: ${metrics.error.toFixed(1)}%, Recovery: ${metrics.recoveryTime}s)`;
  } else if (category === "Kategori-14") {
    return `Kategori-14 (No Device Logined - Error: ${metrics.error.toFixed(1)}%)`;
  }

  return category;
}

// ==================== RANDOM METRICS GENERATION (FOR TESTING) ====================

/**
 * Generate random metrics for testing purposes
 * @returns {Object} Random channel metrics
 */
function generateRandomMetrics() {
  // Generate more realistic values with weighted distribution
  const packetLoss = Math.random() < 0.3 ? 0 : parseFloat((Math.random() * 12).toFixed(2)); // 30% chance of 0, otherwise 0-12%
  const latency = Math.floor(Math.random() * 450) + 20; // 20ms - 470ms (avoid 0)
  const jitter = Math.floor(Math.random() * 180) + 10; // 10ms - 190ms (avoid 0)
  const error = Math.random() < 0.4 ? 0 : parseFloat((Math.random() * 22).toFixed(2)); // 40% chance of 0, otherwise 0-22%
  const recoveryTime = Math.random() < 0.5 ? 0 : parseFloat((Math.random() * 35 + 5).toFixed(1)); // 50% chance of 0, otherwise 5-40s

  return {
    packetLoss,
    latency,
    jitter,
    error,
    recoveryTime
  };
}

// ==================== EXPORTS ====================

module.exports = {
  // Individual label functions
  getPacketLossLabel,
  getLatencyLabel,
  getJitterLabel,
  getErrorLabel,
  getRecoveryTimeLabel,
  getOverallLabel,

  // Combined metrics functions
  generateLabeledMetrics,
  generateRandomMetrics,

  // Error categorization functions
  getErrorCategory,
  getErrorCategoryWithDescription,

  // Constants
  LABELS
};
