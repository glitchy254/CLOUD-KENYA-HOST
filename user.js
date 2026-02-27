const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  plan: {
    type: String,
    enum: ['FREE', 'BASIC', 'PRO', 'BUSINESS'],
    default: 'FREE'
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  language: {
    type: String,
    default: 'en'
  },
  timezone: {
    type: String,
    default: 'Africa/Nairobi'
  },
  diskUsage: {
    type: Number,
    default: 0
  },
  diskLimit: {
    type: Number,
    default: 1073741824 // 1GB in bytes
  },
  bandwidthUsage: {
    type: Number,
    default: 0
  },
  bandwidthLimit: {
    type: Number,
    default: 2147483648 // 2GB in bytes
  },
  apiKey: String,
  apiSecret: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate API credentials
userSchema.methods.generateApiCredentials = function() {
  this.apiKey = bcrypt.hashSync(this.email + Date.now(), 10).slice(0, 32);
  this.apiSecret = bcrypt.hashSync(this.username + Math.random(), 10).slice(0, 32);
  return { apiKey: this.apiKey, apiSecret: this.apiSecret };
};

// Check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model('User', userSchema);