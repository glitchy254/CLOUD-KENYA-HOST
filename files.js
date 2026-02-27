const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const Activity = require('../models/Activity');
const User = require('../models/User');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userDir = path.join(__dirname, '../uploads', req.user.id.toString());
    try {
      await fs.mkdir(userDir, { recursive: true });
      cb(null, userDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${sanitizedName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|txt|zip|tar|gz|php|html|css|js/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('File type not allowed'));
  }
});

// List files
router.get('/', auth, async (req, res) => {
  try {
    const userDir = path.join(__dirname, '../uploads', req.user.id.toString());
    
    let files = [];
    try {
      files = await fs.readdir(userDir);
    } catch (err) {
      // Directory doesn't exist yet
      await fs.mkdir(userDir, { recursive: true });
    }

    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(userDir, file);
        const stat = await fs.stat(filePath);
        return {
          name: file,
          size: stat.size,
          modified: stat.mtime,
          created: stat.birthtime,
          isDirectory: stat.isDirectory()
        };
      })
    );

    // Calculate total disk usage
    const totalSize = fileDetails.reduce((acc, file) => acc + file.size, 0);
    
    // Update user disk usage
    await User.findByIdAndUpdate(req.user.id, { diskUsage: totalSize });

    res.json({ 
      success: true, 
      files: fileDetails,
      diskUsage: totalSize,
      diskLimit: req.user.diskLimit
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    // Check disk quota
    if (req.user.diskUsage + req.file.size > req.user.diskLimit) {
      // Delete uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({ 
        success: false, 
        message: 'Disk quota exceeded' 
      });
    }

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `File uploaded: ${req.file.originalname}`,
      category: 'file',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { size: req.file.size }
    });

    res.json({ 
      success: true, 
      message: 'File uploaded successfully',
      file: {
        name: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Download file
router.get('/download/:filename', auth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', req.user.id.toString(), filename);

    // Check if file exists
    await fs.access(filePath);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `File downloaded: ${filename}`,
      category: 'file',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.download(filePath);

  } catch (err) {
    console.error(err);
    if (err.code === 'ENOENT') {
      return res.status(404).json({ 
        success: false, 
        message: 'File not found' 
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete file
router.delete('/:filename', auth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', req.user.id.toString(), filename);

    // Check if file exists
    const stat = await fs.stat(filePath);
    
    // Delete file
    await fs.unlink(filePath);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `File deleted: ${filename}`,
      category: 'file',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { size: stat.size }
    });

    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });

  } catch (err) {
    console.error(err);
    if (err.code === 'ENOENT') {
      return res.status(404).json({ 
        success: false, 
        message: 'File not found' 
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create directory
router.post('/mkdir', auth, [
  body('name').notEmpty().trim().escape()
], async (req, res) => {
  try {
    const { name } = req.body;
    const dirPath = path.join(__dirname, '../uploads', req.user.id.toString(), name);

    await fs.mkdir(dirPath);

    // Log activity
    await Activity.create({
      userId: req.user.id,
      action: `Directory created: ${name}`,
      category: 'file',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: 'Directory created successfully' 
    });

  } catch (err) {
    console.error(err);
    if (err.code === 'EEXIST') {
      return res.status(400).json({ 
        success: false, 
        message: 'Directory already exists' 
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;