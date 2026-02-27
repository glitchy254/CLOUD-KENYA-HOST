const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Activity = require('../models/Activity');
const axios = require('axios');

// Plan details
const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    disk: 1073741824, // 1GB
    bandwidth: 2147483648, // 2GB
    domains: 1,
    subdomains: 3,
    databases: 1
  },
  BASIC: {
    name: 'Basic',
    price: 500, // KES
    disk: 5368709120, // 5GB
    bandwidth: 10737418240, // 10GB
    domains: 5,
    subdomains: 10,
    databases: 5
  },
  PRO: {
    name: 'Professional',
    price: 1500, // KES
    disk: 21474836480, // 20GB
    bandwidth: 53687091200, // 50GB
    domains: 20,
    subdomains: 50,
    databases: 20
  },
  BUSINESS: {
    name: 'Business',
    price: 5000, // KES
    disk: 1099511627776, // 1TB
    bandwidth: 1099511627776, // 1TB
    domains: -1, // unlimited
    subdomains: -1, // unlimited
    databases: -1 // unlimited
  }
};

// Get current plan
router.get('/plan', auth, async (req, res) => {
  try {
    const plan = PLANS[req.user.plan];
    res.json({ 
      success: true, 
      plan: req.user.plan,
      details: plan,
      usage: {
        disk: req.user.diskUsage,
        bandwidth: req.user.bandwidthUsage,
        diskPercent: (req.user.diskUsage / req.user.diskLimit) * 100,
        bandwidthPercent: (req.user.bandwidthUsage / req.user.bandwidthLimit) * 100
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all plans
router.get('/plans', auth, async (req, res) => {
  try {
    res.json({ 
      success: true, 
      plans: PLANS
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upgrade plan
router.post('/upgrade', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    
    if (!PLANS[plan]) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid plan' 
      });
    }

    req.user.plan = plan;
    req.user.diskLimit = PLANS[plan].disk;
    req.user.bandwidthLimit = PLANS[plan].bandwidth;
    await req.user.save();

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Upgraded to ${plan} plan`,
      category: 'billing',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: `Upgraded to ${plan} plan successfully`,
      plan: PLANS[plan]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Initiate M-Pesa payment
router.post('/mpesa/stkpush', auth, async (req, res) => {
  try {
    const { phone, amount } = req.body;
    
    // Format phone number (remove 0 or +254)
    const formattedPhone = phone.replace(/^0+/, '254').replace(/^\+/, '');
    
    // M-Pesa API credentials
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(
      process.env.MPESA_SHORTCODE + 
      process.env.MPESA_PASSKEY + 
      timestamp
    ).toString('base64');

    // Make STK Push request
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: 'https://your-domain.com/api/billing/mpesa/callback',
        AccountReference: `CLOUD-${req.user.id}`,
        TransactionDesc: 'Cloud Kenya Payment'
      },
      {
        headers: {
          'Authorization': `Bearer ${await getMpesaToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `M-Pesa payment initiated: KES ${amount}`,
      category: 'billing',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { checkoutRequestId: response.data.CheckoutRequestID }
    });

    res.json({ 
      success: true, 
      message: 'Payment request sent',
      checkoutRequestId: response.data.CheckoutRequestID
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Payment failed' });
  }
});

// Get M-Pesa token helper
async function getMpesaToken() {
  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    return response.data.access_token;
  } catch (err) {
    console.error('M-Pesa token error:', err);
    throw err;
  }
}

module.exports = router;