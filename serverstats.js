const mongoose = require('mongoose');
const os = require('os');
const osUtils = require('os-utils');

const serverStatsSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 604800 // 7 days TTL
  },
  cpu: {
    usage: Number,
    cores: Number,
    loadAverage: [Number]
  },
  memory: {
    total: Number,
    free: Number,
    used: Number,
    usagePercent: Number
  },
  disk: {
    total: Number,
    free: Number,
    used: Number,
    usagePercent: Number
  },
  uptime: Number,
  connections: Number
});

// Static method to collect current stats
serverStatsSchema.statics.collectStats = async function() {
  return new Promise((resolve) => {
    osUtils.cpuUsage(async (cpuUsage) => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      const stats = {
        timestamp: new Date(),
        cpu: {
          usage: cpuUsage * 100,
          cores: os.cpus().length,
          loadAverage: os.loadavg()
        },
        memory: {
          total: totalMem,
          free: freeMem,
          used: totalMem - freeMem,
          usagePercent: ((totalMem - freeMem) / totalMem) * 100
        },
        uptime: os.uptime(),
        connections: 0 // In production, get from netstat
      };

      // Save to database
      await this.create(stats);
      
      resolve(stats);
    });
  });
};

module.exports = mongoose.model('ServerStats', serverStatsSchema);