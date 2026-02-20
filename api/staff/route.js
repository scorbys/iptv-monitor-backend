const express = require('express');
const router = express.Router();
const {
  createStaff,
  getAllStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  getStaffStats
} = require('../../staff-db');
const { verifyToken, requireAdmin } = require('../../middleware/authMiddleware');

/**
 * GET /api/staff
 * Get all staff (Admin only)
 */
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { department } = req.query;
    const filters = {};
    if (department) filters.department = department;

    const result = await getAllStaff(filters);

    res.json({
      success: true,
      staff: result.staff,
      count: result.count
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff'
    });
  }
});

/**
 * GET /api/staff/stats
 * Get staff statistics (Admin only)
 */
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await getStaffStats();

    res.json(result);
  } catch (error) {
    console.error('Error fetching staff stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff statistics'
    });
  }
});

/**
 * GET /api/staff/me
 * Get current user's staff profile (Authenticated users)
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { getStaffByUserId } = require('../../staff-db');
    const staffMember = await getStaffByUserId(req.user.userId);

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        error: 'Staff profile not found'
      });
    }

    res.json({
      success: true,
      staff: staffMember
    });
  } catch (error) {
    console.error('Error fetching staff profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff profile'
    });
  }
});

/**
 * GET /api/staff/:staffId
 * Get staff by ID (Admin only)
 */
router.get('/:staffId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { staffId } = req.params;
    const result = await getStaffById(staffId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      staff: result.staff
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff'
    });
  }
});

/**
 * POST /api/staff
 * Create new staff (Admin only)
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      department,
      position,
      userId, // Link to login_page user
      joinedDate
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    // Create staff
    const result = await createStaff({
      name,
      email,
      phone,
      department,
      position,
      userId,
      joinedDate,
      createdBy: req.user.userId
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json({
      success: true,
      message: 'Staff created successfully',
      staff: result.staff
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create staff'
    });
  }
});

/**
 * PUT /api/staff/:staffId
 * Update staff (Admin only)
 */
router.put('/:staffId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { staffId } = req.params;
    const {
      name,
      email,
      phone,
      department,
      position,
      userId
    } = req.body;

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (userId !== undefined) updateData.userId = userId;
    updateData.updatedBy = req.user.userId;

    const result = await updateStaff(staffId, updateData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Staff updated successfully',
      staff: result.staff
    });
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update staff'
    });
  }
});

/**
 * DELETE /api/staff/:staffId
 * Delete staff (Admin only)
 */
router.delete('/:staffId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { staffId } = req.params;

    const result = await deleteStaff(staffId, req.user.userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete staff'
    });
  }
});

module.exports = router;
