const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const Activity = require('../models/Activity');

const execPromise = util.promisify(exec);

// Install WordPress
router.post('/wordpress', auth, async (req, res) => {
  try {
    const { domain, siteTitle, adminUser, adminEmail } = req.body;
    
    const installPath = path.join(__dirname, '../uploads', req.user.id.toString(), domain);
    
    // Create directory
    await fs.mkdir(installPath, { recursive: true });

    // Download WordPress
    await execPromise(`wget -q -O - https://wordpress.org/latest.tar.gz | tar -xz -C ${installPath} --strip-components=1`);

    // Create wp-config
    const wpConfig = `<?php
define('DB_NAME', 'wp_${req.user.id}');
define('DB_USER', '${req.user.username}');
define('DB_PASSWORD', '${Math.random().toString(36).slice(-8)}');
define('DB_HOST', 'localhost');
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');
$table_prefix = 'wp_';
define('WP_DEBUG', false);
if ( !defined('ABSPATH') )
    define('ABSPATH', dirname(__FILE__) . '/');
require_once(ABSPATH . 'wp-settings.php');
?>`;

    await fs.writeFile(path.join(installPath, 'wp-config.php'), wpConfig);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `WordPress installed for ${domain}`,
      category: 'system',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { domain, siteTitle }
    });

    res.json({ 
      success: true, 
      message: 'WordPress installed successfully',
      path: installPath
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Installation failed' });
  }
});

// Install Laravel
router.post('/laravel', auth, async (req, res) => {
  try {
    const { domain, projectName } = req.body;
    
    const installPath = path.join(__dirname, '../uploads', req.user.id.toString(), domain);
    
    // Install Laravel via Composer
    await execPromise(`composer create-project laravel/laravel ${installPath} --prefer-dist`);

    // Set permissions
    await execPromise(`chmod -R 755 ${installPath}/storage`);
    await execPromise(`chmod -R 755 ${installPath}/bootstrap/cache`);

    // Create .env file
    const envContent = `APP_NAME=${projectName}
APP_ENV=production
APP_KEY=${Math.random().toString(36).slice(-32)}
APP_DEBUG=false
APP_URL=https://${domain}

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=laravel_${req.user.id}
DB_USERNAME=${req.user.username}
DB_PASSWORD=${Math.random().toString(36).slice(-12)}`;

    await fs.writeFile(path.join(installPath, '.env'), envContent);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Laravel installed for ${domain}`,
      category: 'system',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'Laravel installed successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Installation failed' });
  }
});

// Install Static Site
router.post('/static', auth, async (req, res) => {
  try {
    const { domain, template } = req.body;
    
    const installPath = path.join(__dirname, '../uploads', req.user.id.toString(), domain);
    
    // Create basic HTML template
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${domain}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
        }
        .container {
            max-width: 600px;
            padding: 2rem;
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ${domain}</h1>
        <p>Your static site is ready! Start building by adding your HTML, CSS, and JavaScript files.</p>
    </div>
</body>
</html>`;

    await fs.mkdir(installPath, { recursive: true });
    await fs.writeFile(path.join(installPath, 'index.html'), htmlContent);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Static site created for ${domain}`,
      category: 'system',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'Static site created successfully' 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Installation failed' });
  }
});

module.exports = router;