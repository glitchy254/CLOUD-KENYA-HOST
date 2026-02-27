const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Activity = require('../models/Activity');
const auth = require('../middleware/auth');
const speakeasy = require('speakeasy');

// Register
router.post('/register', [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists' 
      });
    }

    // Create user
    const user = new User({ username, email, password });
    await user.save();

    // Generate API credentials
    const apiCreds = user.generateApiCredentials();
    await user.save();

    // Create token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Log activity
    await Activity.create({
      userId: user._id,
      action: 'User registered',
      category: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan,
        apiKey: apiCreds.apiKey,
        apiSecret: apiCreds.apiSecret
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(423).json({ 
        success: false, 
        message: 'Account locked. Try again later.' 
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      user.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 3600000; // 1 hour
      }
      
      await user.save();
      
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      return res.json({
        success: true,
        requires2FA: true,
        userId: user._id
      });
    }

    // Create token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Log activity
    await Activity.create({
      userId: user._id,
      action: 'User logged in',
      category: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Verify 2FA
router.post('/verify-2fa', [
  body('userId').notEmpty(),
  body('token').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { userId, token } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (!verified) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid 2FA token' 
      });
    }

    const jwtToken = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -twoFactorSecret');
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update profile
router.put('/profile', auth, [
  body('email').optional().isEmail().normalizeEmail(),
  body('language').optional().isIn(['en', 'sw']),
  body('timezone').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, language, timezone, currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (email) user.email = email;
    if (language) user.language = language;
    if (timezone) user.timezone = timezone;
    
    // Change password if provided
    if (currentPassword && newPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ 
          success: false, 
          message: 'Current password is incorrect' 
        });
      }
      user.password = newPassword;
    }
    
    await user.save();
    
    // Log activity
    await Activity.create({
      userId: user._id,
      action: 'Profile updated',
      category: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Enable 2FA
router.post('/enable-2fa', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    const secret = speakeasy.generateSecret({
      name: `Cloud Kenya (${user.username})`
    });
    
    user.twoFactorSecret = secret.base32;
    await user.save();
    
    res.json({
      success: true,
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Verify and enable 2FA
router.post('/verify-enable-2fa', auth, [
  body('token').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { token } = req.body;
    
    const user = await User.findById(req.user.id);
    
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });
    
    if (!verified) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    user.twoFactorEnabled = true;
    await user.save();
    
    // Log activity
    await Activity.create({
      userId: user._id,
      action: '2FA enabled',
      category: 'security',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ 
      success: true, 
      message: '2FA enabled successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Disable 2FA
router.post('/disable-2fa', auth, [
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { password } = req.body;
    
    const user = await User.findById(req.user.id);
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
    
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();
    
    // Log activity
    await Activity.create({
      userId: user._id,
      action: '2FA disabled',
      category: 'security',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ 
      success: true, 
      message: '2FA disabled successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout
router.post('/logout', auth, async (req, res) => {
  try {
    await Activity.create({
      userId: req.user.id,
      action: 'User logged out',
      category: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;