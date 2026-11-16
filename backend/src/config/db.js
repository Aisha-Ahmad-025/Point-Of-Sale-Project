const mongoose = require('mongoose');
const { config } = require('./env');

// Runtime capability flag, set after connecting.
const dbState = { transactions: false };

async function detectTransactions() {
  if (config.useTransactions === 'false') return false;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const supported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  if (config.useTransactions === 'true' && !supported) {
    throw new Error('USE_TRANSACTIONS=true but MongoDB is not a replica set / sharded cluster. See README (replica set setup).');
  }
  return supported;
}

async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  dbState.transactions = await detectTransactions();
  // eslint-disable-next-line no-console
  console.log(`[db] connected (${dbState.transactions ? 'transactions ON' : 'standalone: compensating fallback ON'})`);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, dbState };
