const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/pagination');
const { hashPassword } = require('./authService');
const audit = require('./auditService');

async function list(q) {
  const filter = {};
  if (q.role) filter.role = q.role;
  if (q.status === 'active') filter.isActive = true; else if (q.status === 'inactive') filter.isActive = false;
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ name: rx }, { email: rx }]; }
  const [rows, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), User.countDocuments(filter)]);
  return { rows: rows.map((u) => u.toSafeJSON()), total };
}

async function create(req, d) {
  const user = await User.create({ name: d.name, email: d.email, role: d.role, passwordHash: await hashPassword(d.password) });
  await audit.record(req, { action: 'employee.create', resource: 'user', resourceId: user._id, summary: `${user.email} (${user.role})`, after: user.toSafeJSON() });
  return user.toSafeJSON();
}

async function assertNotLastAdmin(user, willStopBeingActiveAdmin) {
  if (user.role === 'admin' && user.isActive && willStopBeingActiveAdmin) {
    const others = await User.countDocuments({ role: 'admin', isActive: true, _id: { $ne: user._id } });
    if (others === 0) throw ApiError.conflict('At least one active admin is required', 'LAST_ADMIN');
  }
}

async function update(req, id, d) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('Employee not found');
  const before = user.toSafeJSON();
  if (d.role && d.role !== user.role) {
    if (String(user._id) === String(req.user._id)) throw ApiError.conflict('You cannot change your own role', 'SELF_ROLE_CHANGE');
    await assertNotLastAdmin(user, d.role !== 'admin');
    user.role = d.role; user.tokenVersion += 1; // force re-login with the new role
  }
  if (d.name) user.name = d.name;
  if (d.email) user.email = d.email;
  if (d.password) { user.passwordHash = await hashPassword(d.password); user.tokenVersion += 1; }
  await user.save();
  const roleChanged = before.role !== user.role;
  await audit.record(req, { action: roleChanged ? 'employee.role_change' : d.password ? 'employee.password_reset' : 'employee.update', resource: 'user', resourceId: user._id, summary: user.email, before, after: user.toSafeJSON() });
  return user.toSafeJSON();
}

async function setStatus(req, id, isActive) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('Employee not found');
  if (String(user._id) === String(req.user._id) && !isActive) throw ApiError.conflict('You cannot deactivate your own account', 'SELF_DEACTIVATE');
  await assertNotLastAdmin(user, !isActive);
  user.isActive = isActive; if (!isActive) user.tokenVersion += 1;
  await user.save();
  await audit.record(req, { action: isActive ? 'employee.activate' : 'employee.deactivate', resource: 'user', resourceId: user._id, summary: user.email, after: { isActive } });
  return user.toSafeJSON();
}
module.exports = { list, create, update, setStatus };
