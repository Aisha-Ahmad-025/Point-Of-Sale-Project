const { config, validateConfig } = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const { createApp } = require('./app');
const Settings = require('./models/Settings');

async function main() {
  validateConfig();
  await connectDB();
  await Settings.get(); // make sure the settings document exists
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`[api] SwiftShelf API listening on http://localhost:${config.port}/api/v1 (${config.env})`));
  const shutdown = async (sig) => { console.log(`[api] ${sig} received, shutting down`); server.close(async () => { await disconnectDB(); process.exit(0); }); };
  ['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
