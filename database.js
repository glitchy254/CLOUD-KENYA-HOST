const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes
    await createIndexes();
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const collections = await mongoose.connection.db.collections();
    
    for (let collection of collections) {
      await collection.createIndexes();
    }
    
    console.log('✅ Indexes created');
  } catch (err) {
    console.error('Index creation error:', err);
  }
};

module.exports = connectDB;