const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['auth', 'file', 'domain', 'security', 'billing', 'system'],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7776000 // 90 days TTL
  }
});

// Index for faster queries
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Activity', activitySchema);