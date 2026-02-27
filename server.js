const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const fileRoutes = require('./routes/files');
const installerRoutes = require('./routes/installer');
const serverRoutes = require('./routes/server');
const billingRoutes = require('./routes/billing');
const activityRoutes = require('./routes/activity');

// Import models
const User = require('./models/User');
const ServerStats = require('./models/ServerStats');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/installer', installerRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/activity', activityRoutes);

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 New client connected');
  
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.join(`user_${decoded.id}`);
    } catch (err) {
      socket.emit('error', 'Authentication failed');
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected');
  });
});

// Scheduled tasks
cron.schedule('*/5 * * * *', async () => {
  try {
    const stats = await ServerStats.collectStats();
    io.emit('serverStats', stats);
  } catch (err) {
    console.error('Stats collection error:', err);
  }
});

cron.schedule('0 */6 * * *', async () => {
  try {
    const domains = await Domain.find({ sslEnabled: true });
    for (const domain of domains) {
      await domain.checkSSLStatus();
    }
  } catch (err) {
    console.error('SSL check error:', err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});