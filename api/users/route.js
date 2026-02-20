const express = require('express');
const router = express.Router();
const {
  getUserById,
  getUserByEmail,
  insertUser,
  updateUserProfile,
  updateUserPassword,
  hashPassword
} = require('../../db');
const { verifyToken, requireAdmin, requireRole } = require('../../middleware/authMiddleware');

/**
 * GET /api/users
 * Get all users (Admin only)
 */
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { users } = await require('../../db').connectDB();
    const userList = await users.find(
      { isActive: { $ne: false } },
      {
        projection: {
          password: 0,
          googleId: 0
        }
      }
    ).toArray();

    res.json({
      success: true,
      users: userList,
      count: userList.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

/**
 * GET /api/users/:userId
 * Get user by ID (Admin only or own profile)
 */
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user is admin or requesting own profile
    if (req.user.role !== 'admin' && req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own profile'
      });
    }

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user'
    });
  }
});

/**
 * POST /api/users
 * Create new user (Admin only)
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      name,
      role = 'guest',
      avatar
    } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    // Validate role
    if (!['admin', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be admin or guest'
      });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const userId = await insertUser({
      username,
      email,
      password: hashedPassword,
      name: name || username,
      role,
      avatar,
      provider: 'local',
      isActive: true
    });

    // Return created user without password
    const createdUser = await getUserById(userId.toString());

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: createdUser
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
});

/**
 * PUT /api/users/:userId
 * Update user profile (Admin or own profile)
 */
router.put('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, name, role, avatar } = req.body;

    // Check if user is admin or updating own profile
    const isOwnProfile = req.user.userId === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own profile'
      });
    }

    // Only admin can change role
    if (role && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only admin can change user role'
      });
    }

    // Prepare update data
    const updateData = {};
    if (username) updateData.username = username;
    if (name !== undefined) updateData.name = name;
    if (role && isAdmin) updateData.role = role;
    if (avatar) updateData.avatar = avatar;

    // Update user
    const result = await updateUserProfile(userId, updateData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Get updated user
    const updatedUser = await getUserById(userId);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * PUT /api/users/:userId/password
 * Update user password (Admin or own profile)
 */
router.put('/:userId/password', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    // Check if user is admin or updating own password
    const isAdmin = req.user.role === 'admin';
    const isOwnProfile = req.user.userId === userId;

    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own password'
      });
    }

    // If not admin, verify current password
    if (!isAdmin && isOwnProfile) {
      const { comparePassword, getUserByIdComplete } = require('../../db');
      const user = await getUserByIdComplete(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify current password
      if (user.password && user.password !== "exists") {
        const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
          return res.status(400).json({
            success: false,
            error: 'Current password is incorrect'
          });
        }
      }
    }

    // Update password
    const result = await updateUserPassword(userId, newPassword);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update password'
    });
  }
});

/**
 * DELETE /api/users/:userId
 * Deactivate user (Admin only)
 * Note: We use soft delete by setting isActive to false
 */
router.delete('/:userId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deactivating themselves
    if (req.user.userId === userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot deactivate your own account'
      });
    }

    const { users } = await require('../../db').connectDB();
    const { ObjectId } = require('mongodb');

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedBy: req.user.userId
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate user'
    });
  }
});

/**
 * PATCH /api/users/:userId/role
 * Change user role (Admin only)
 */
router.patch('/:userId/role', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!['admin', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be admin or guest'
      });
    }

    // Prevent admin from changing their own role
    if (req.user.userId === userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot change your own role'
      });
    }

    const { users } = await require('../../db').connectDB();
    const { ObjectId } = require('mongodb');

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          role: role,
          roleUpdatedBy: req.user.userId,
          roleUpdatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get updated user
    const updatedUser = await getUserById(userId);

    res.json({
      success: true,
      message: `User role changed to ${role}`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error changing user role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change user role'
    });
  }
});

module.exports = router;
