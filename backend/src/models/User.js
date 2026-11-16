const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'cashier'], required: true, default: 'cashier' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this._id, name: this.name, email: this.email, role: this.role, isActive: this.isActive, lastLoginAt: this.lastLoginAt, createdAt: this.createdAt };
};

module.exports = mongoose.model('User', userSchema);
