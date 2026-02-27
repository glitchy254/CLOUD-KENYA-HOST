const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Domain = require('../models/Domain');
const Activity = require('../models/Activity');
const axios = require('axios');

// Get all domains for user
router.get('/', auth, async (req, res) => {
  try {
    const domains = await Domain.find({ userId: req.user.id });
    res.json({ success: true, domains });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add domain
router.post('/', auth, [
  body('domain').isFQDN(),
  body('type').optional().isIn(['primary', 'addon', 'subdomain'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { domain, type = 'addon' } = req.body;

    // Check if domain exists
    const existingDomain = await Domain.findOne({ domain });
    if (existingDomain) {
      return res.status(400).json({ 
        success: false, 
        message: 'Domain already exists' 
      });
    }

    // Get IP address
    const ipResponse = await axios.get(`https://dns.google/resolve?name=${domain}&type=A`);
    const ipAddress = ipResponse.data.Answer?.[0]?.data || '0.0.0.0';

    // Create domain
    const newDomain = new Domain({
      userId: req.user.id,
      domain,
      type,
      ipAddress,
      dnsRecords: [
        { type: 'A', name: '@', value: ipAddress, ttl: 3600 },
        { type: 'CNAME', name: 'www', value: domain, ttl: 3600 }
      ]
    });

    await newDomain.save();

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Domain added: ${domain}`,
      category: 'domain',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({ 
      success: true, 
      domain: newDomain 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Enable SSL
router.post('/:domainId/ssl', auth, async (req, res) => {
  try {
    const domain = await Domain.findOne({
      _id: req.params.domainId,
      userId: req.user.id
    });

    if (!domain) {
      return res.status(404).json({ 
        success: false, 
        message: 'Domain not found' 
      });
    }

    domain.sslEnabled = true;
    domain.sslStatus = 'pending';
    await domain.save();

    // Simulate SSL issuance (in production, integrate with Let's Encrypt)
    setTimeout(async () => {
      domain.sslStatus = 'active';
      domain.sslExpiry = new Date(Date.now() + 7776000000); // 90 days
      await domain.save();
    }, 5000);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `SSL enabled for ${domain.domain}`,
      category: 'security',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'SSL enabled successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Enable Cloudflare
router.post('/:domainId/cloudflare', auth, async (req, res) => {
  try {
    const domain = await Domain.findOne({
      _id: req.params.domainId,
      userId: req.user.id
    });

    if (!domain) {
      return res.status(404).json({ 
        success: false, 
        message: 'Domain not found' 
      });
    }

    // Integrate with Cloudflare API
    try {
      const response = await axios.post('https://api.cloudflare.com/client/v4/zones', {
        name: domain.domain,
        account: { id: process.env.CLOUDFLARE_ACCOUNT_ID }
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        domain.cloudflareProtected = true;
        domain.cloudflareZoneId = response.data.result.id;
        domain.nameservers = response.data.result.name_servers;
        await domain.save();
      }
    } catch (cfErr) {
      console.error('Cloudflare error:', cfErr);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to enable Cloudflare' 
      });
    }

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Cloudflare enabled for ${domain.domain}`,
      category: 'domain',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'Cloudflare enabled successfully',
      nameservers: domain.nameservers
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete domain
router.delete('/:domainId', auth, async (req, res) => {
  try {
    const domain = await Domain.findOneAndDelete({
      _id: req.params.domainId,
      userId: req.user.id
    });

    if (!domain) {
      return res.status(404).json({ 
        success: false, 
        message: 'Domain not found' 
      });
    }

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Domain deleted: ${domain.domain}`,
      category: 'domain',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'Domain deleted successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;