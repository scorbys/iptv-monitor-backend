const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dgram = require('dgram');
const net = require('net');
const { 
  createUser,
  authenticateUser,
} = require('./modif_db');

const app = express();
const port = process.env.PORT || 3001;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'Pec@tu2024++';

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt:', { identifier: req.body.identifier });
    
    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email/username and password are required'
      });
    }

    // Authenticate user
    const result = await authenticateUser(identifier, password);
    console.log('Authentication result:', { success: result.success, error: result.error });

    if (result.success) {
      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: result.user.id,
          email: result.user.email,
          username: result.user.username
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log('Login successful for user:', result.user.username);

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email
        },
        message: 'Login successful'
      });
    } else {
      console.log('Login failed:', result.error);
      res.status(401).json({
        success: false,
        error: result.error || 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login'
    });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', { 
      username: req.body.username, 
      email: req.body.email 
    });
    
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Username validation
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
    }

    // Create user
    const result = await createUser({ username, email, password });
    console.log('User creation result:', { success: result.success, error: result.error });

    if (result.success) {
      // Generate JWT token for new user
      const token = jwt.sign(
        { 
          userId: result.userId,
          email: email,
          username: username
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log('Registration successful for user:', username);

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
          id: result.userId,
          username: username,
          email: email
        }
      });
    } else {
      console.log('Registration failed:', result.error);
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create account'
      });
    }
  } catch (error) {
    console.error('Register API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during registration'
    });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    console.log('User logged out successfully');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Error during logout'
    });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        userId: req.user.userId,
        username: req.user.username,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Error verifying token'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Protected API Routes - Apply authentication middleware
app.use('/api/channels', authenticateToken);
app.use('/api/hospitality', authenticateToken);
app.use('/api/config', authenticateToken);

// Start server
app.listen(port, async () => {
  console.log(`🚀 IPTV Monitoring API server running on port ${port}`);
  console.log(`📱 Server URL: http://localhost:${port}`);
  console.log(`🔒 JWT Secret configured: ${JWT_SECRET ? 'Yes' : 'No'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test database connection
  try {
    const { connectDB } = require('./db');
    await connectDB();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

module.exports = app;