// Protected admin bootstrap (there is NO public admin registration).
// Usage: set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD in backend/.env (or the shell), then: npm run create-admin
const { config } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { hashPassword } = require('../services/authService');
const { password } = { password: require('zod').z.string().min(10).regex(/[A-Za-z]/).regex(/\d/) };

(async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars, letters + digits) first.'); process.exit(1); }
  if (!password.safeParse(ADMIN_PASSWORD).success) { console.error('ADMIN_PASSWORD must be at least 10 characters and contain letters and digits.'); process.exit(1); }
  await connectDB(config.mongoUri);
  await Settings.get();
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) { console.error('A user with this email already exists.'); await disconnectDB(); process.exit(1); }
  await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, role: 'admin', passwordHash: await hashPassword(ADMIN_PASSWORD) });
  console.log(`Admin ${ADMIN_EMAIL} created. Remove ADMIN_PASSWORD from your environment now.`);
  await disconnectDB();
})().catch((e) => { console.error(e.message); process.exit(1); });
