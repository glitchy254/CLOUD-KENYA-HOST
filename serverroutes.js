const express = require('express');
const router = express.Router();
const os = require('os');
const osUtils = require('os-utils');
const auth = require('../middleware/auth');
const ServerStats = require('../models/ServerStats');

// Get server status
router.get('/status', auth, async (req, res) => {
  try {
    const stats = await ServerStats.collectStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get historical stats
router.get('/history', auth, async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - hours * 3600000);
    
    const history = await ServerStats.find({
      timestamp: { $gte: since }
    }).sort({ timestamp: 1 });

    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get PHP services status
router.get('/services', auth, async (req, res) => {
  try {
    // In production, check actual service status
    const services = {
      php: {
        status: 'running',
        version: '8.2',
        processes: 5
      },
      mysql: {
        status: 'running',
        version: '8.0',
        connections: 12
      },
      nginx: {
        status: 'running',
        version: '1.24',
        connections: 45
      },
      redis: {
        status: 'running',
        version: '7.2',
        memory: '256MB'
      }
    };

    res.json({ success: true, services });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;