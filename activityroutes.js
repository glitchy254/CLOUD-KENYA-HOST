const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Activity = require('../models/Activity');

// Get user activity logs
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50, category, status } = req.query;
    
    const query = { userId: req.user.id };
    if (category) query.category = category;
    if (status) query.status = status;
    
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ success: true, activities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get activity stats
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await Activity.aggregate([
      { $match: { userId: req.user._id } },
      { $group: {
        _id: '$category',
        count: { $sum: 1 },
        lastActivity: { $max: '$createdAt' }
      }},
      { $sort: { count: -1 } }
    ]);
    
    res.json({ success: true, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Clear activity logs
router.delete('/clear', auth, async (req, res) => {
  try {
    await Activity.deleteMany({ userId: req.user.id });
    
    res.json({ 
      success: true, 
      message: 'Activity logs cleared' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;