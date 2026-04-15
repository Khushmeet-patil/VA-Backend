const mongoose = require('mongoose');

// Ensure the URI is available. dotenv is loaded in index.ts before this is required.
const uri = process.env.STORE_MONGO_URI;

if (!uri) {
  console.error('❌ CRITICAL ERROR: STORE_MONGO_URI is missing in .env');
} else {
  const censoredUri = uri.replace(/:([^@]+)@/, ":****@");
  console.log(`[StoreDB] Initializing with URI: ${censoredUri}`);
}

const storeConnection = uri 
  ? mongoose.createConnection(uri) 
  : mongoose.createConnection();

storeConnection.on('connected', () => {
  console.log(`✅ Store DB (Atlas) connected. Host: ${storeConnection.host}, DB: ${storeConnection.name}`);
});

storeConnection.on('error', (err) => {
  console.error('❌ Store DB connection error:', err.message);
});

module.exports = {
  connectStoreDB: async () => storeConnection,
  getStoreDB: () => storeConnection
};
