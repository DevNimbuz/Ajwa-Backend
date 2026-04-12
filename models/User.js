/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — User Model (Mongoose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Roles: SUPER_ADMIN (full access) | TEAM (limited access) | CUSTOMER (traveler)
 * Password is bcrypt hashed before save
 * JWT token generation built-in
 * Supports customer profiles with travel preferences
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ProfileSchema = new mongoose.Schema({
  dob: { type: Date },
  address: { type: String, trim: true },
  passportNo: { type: String, trim: true, uppercase: true },
  passportExpiry: { type: Date },
  mealPreference: { 
    type: String, 
    enum: ['vegetarian', 'non-vegetarian', 'vegan', 'halal', 'kosher', 'jain', 'other', ''],
    default: '' 
  },
  seatPreference: { 
    type: String, 
    enum: ['window', 'aisle', 'middle', 'exit-row', 'any', ''],
    default: '' 
  },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false, // Never return password in queries by default
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  phone: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'TEAM', 'CUSTOMER'],
    default: 'TEAM',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
    select: false,
  },
  // ── OTP Verification Fields ──
  emailOTP: {
    code: { type: String, select: false },
    expiresAt: { type: Date, select: false },
    attempts: { type: Number, default: 0 },
  },
  // ── Pending Registration (for OTP verification) ──
  pendingRegistration: {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
    password: { type: String, select: false },
    expiresAt: { type: Date, select: false },
  },
  profile: {
    type: ProfileSchema,
    default: () => ({}),
  },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
  }],
  documents: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['ticket', 'voucher', 'visa', 'insurance', 'other'] },
    uploadedAt: { type: Date, default: Date.now },
  }],
  tokenVersion: {
    type: Number,
    default: 0,
  },
  // ── Brute Force Protection ──
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true, // Adds createdAt, updatedAt
});

// ── Pre-save: Hash password if modified ──
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Enforce password complexity
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(this.password)) {
    const error = new Error('Password must be at least 8 characters long and include an uppercase letter, a number, and a special character.');
    error.name = 'ValidationError';
    return next(error);
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: Compare password ──
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Instance method: Generate JWT ──
UserSchema.methods.generateToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, tokenVersion: this.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

// ── Instance method: Return safe user object (no password) ──
UserSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    phone: this.phone,
    role: this.role,
    isActive: this.isActive,
    isVerified: this.isVerified,
    isEmailVerified: this.isEmailVerified,
    profile: this.profile,
    wishlist: this.wishlist,
    documents: this.documents,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
