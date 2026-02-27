const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  domain: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['primary', 'addon', 'subdomain'],
    default: 'addon'
  },
  sslEnabled: {
    type: Boolean,
    default: false
  },
  sslStatus: {
    type: String,
    enum: ['active', 'pending', 'expired', 'failed'],
    default: 'pending'
  },
  sslExpiry: Date,
  cloudflareProtected: {
    type: Boolean,
    default: false
  },
  cloudflareZoneId: String,
  nameservers: [String],
  ipAddress: String,
  dnsRecords: [{
    type: String,
    name: String,
    value: String,
    ttl: Number
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Method to check SSL status
domainSchema.methods.checkSSLStatus = async function() {
  try {
    const sslChecker = require('ssl-checker');
    const result = await sslChecker(this.domain);
    
    this.sslStatus = result.valid ? 'active' : 'expired';
    this.sslExpiry = result.validTo;
    await this.save();
    
    return result;
  } catch (err) {
    this.sslStatus = 'failed';
    await this.save();
    return null;
  }
};

module.exports = mongoose.model('Domain', domainSchema);