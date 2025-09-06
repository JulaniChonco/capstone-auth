// server.js - Express backend for Capstone Authentication Tasks 1–3
// ------------------------------------------------------------------
// Features:
// - Task 1: Register/Login with JWT, MongoDB models (User/OU/Division)
// - Task 2: Protected endpoints to view/add/update division credentials
// - Task 3: Assign/Unassign users to OUs & divisions, change user role
//
// Notes:
// - Division is a Mongoose SUBDOCUMENT inside OU. We store that subdoc's
//   ObjectId on the User document in `division`. There's no "Division" model.
// - Permissions:
//    * normal     -> can READ + ADD credentials only for their OWN division
//    * management -> can READ + ADD + UPDATE credentials for ANY division;
//                    can assign/unassign users
//    * admin      -> management rights + can change user roles
// - Tokens expire after 1 hour. After changing a user's role, the client
//   should log in again to receive a token with updated role.
// ------------------------------------------------------------------

import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Optional: tiny request logger (uncomment if useful during dev)
// app.use((req, _res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`); next(); });

// Environment vars
const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auth_capstone';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_change_me';

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// -------------------
// Mongoose Schemas
// -------------------

const credentialSchema = new mongoose.Schema({
  system: String,
  username: String,
  password: String
});

const divisionSchema = new mongoose.Schema({
  name: String,
  credentials: [credentialSchema]
});

const ouSchema = new mongoose.Schema({
  name: String,
  divisions: [divisionSchema]
});

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ['normal', 'management', 'admin'], default: 'normal' },
  ou: { type: mongoose.Schema.Types.ObjectId, ref: 'OU', default: null },
  division: { type: mongoose.Schema.Types.ObjectId, default: null } // stores the subdocument _id
});

const OU = mongoose.model('OU', ouSchema);
const User = mongoose.model('User', userSchema);

// -------------------
// Seed sample OUs/divisions if DB empty (and log their IDs)
// -------------------
async function seedData() {
  const count = await OU.countDocuments();
  if (count === 0) {
    const ou = new OU({
      name: 'News Management',
      divisions: [
        { name: 'IT Division', credentials: [] },
        { name: 'Finance Division', credentials: [] }
      ]
    });
    await ou.save();

    console.log('Seeded sample OU/divisions');
    console.log('OU ID:', ou._id.toString());
    console.log('Divisions:', ou.divisions.map(d => ({ id: d._id.toString(), name: d.name })));
  }
}
seedData();

// -------------------
// Helpers
// -------------------

// Return user fresh from DB using ID in the JWT
async function getCurrentUser(req) {
  if (!req.user?.id) return null;
  return await User.findById(req.user.id);
}

// Check if the signed-in user (from JWT) can access the target division
// - normal: must be assigned to that division
// - management/admin: allowed
async function ensureDivisionAccess(req, res) {
  const current = await getCurrentUser(req);
  if (!current) return { ok: false, res: res.status(401).json({ error: 'Unknown user' }) };

  const targetDivisionId = String(req.params.id);
  if (current.role === 'normal') {
    if (!current.division || String(current.division) !== targetDivisionId) {
      return { ok: false, res: res.status(403).json({ error: 'Not allowed for this division' }) };
    }
  }
  // management/admin: ok
  return { ok: true, user: current };
}

// Quick helper to shape public user response
function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, role: u.role, ou: u.ou, division: u.division };
}

// -------------------
// Auth Endpoints (Task 1)
// -------------------

// Register new user (default role: normal)
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, passwordHash, role: 'normal' });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ message: 'Registered', token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login existing user
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------
// DEV ENDPOINT (Protected): List OUs & Divisions (keep for dev only)
// GET /api/dev/divisions
// ---------------------------------------------------------
app.get('/api/dev/divisions', authMiddleware, async (req, res) => {
  try {
    const ous = await OU.find({}, { name: 1, divisions: 1 }).lean();
    const items = ous.map(ou => ({
      ouId: ou._id,
      ouName: ou.name,
      divisions: (ou.divisions || []).map(d => ({
        divisionId: d._id,
        divisionName: d.name
      }))
    }));
    return res.json({ items });
  } catch (err) {
    console.error('List divisions error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------
// Structure endpoint (non-dev): same data, cleaner path
// GET /api/structure/ous
// ---------------------------------------------------------
app.get('/api/structure/ous', authMiddleware, async (req, res) => {
  try {
    const ous = await OU.find({}, { name: 1, divisions: 1 }).lean();
    const items = ous.map(ou => ({
      ouId: String(ou._id),
      ouName: ou.name,
      divisions: (ou.divisions || []).map(d => ({
        divisionId: String(d._id),
        divisionName: d.name
      }))
    }));
    return res.json({ items });
  } catch (err) {
    console.error('Structure OUs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------
// TASK 2: Credential Repository Endpoints (protected by JWT)
// ---------------------------------------------------------------------

// GET /api/divisions/:id/credentials
// View a division's credential repository
app.get('/api/divisions/:id/credentials', authMiddleware, async (req, res) => {
  try {
    // Permission check: normal users only for their own division
    const access = await ensureDivisionAccess(req, res);
    if (!access.ok) return;

    // Find OU that owns this division
    const result = await OU.findOne(
      { 'divisions._id': req.params.id },
      { 'divisions.$': 1 }
    );

    if (!result || !result.divisions || result.divisions.length === 0) {
      return res.status(404).json({ error: 'Division not found' });
    }
    const division = result.divisions[0];
    return res.json({
      division: { id: division._id, name: division.name },
      credentials: division.credentials || []
    });
  } catch (err) {
    console.error('GET credentials error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/divisions/:id/credentials
// Add a new credential to a division (Normal+; normal -> only own division)
app.post('/api/divisions/:id/credentials', authMiddleware, async (req, res) => {
  try {
    const access = await ensureDivisionAccess(req, res);
    if (!access.ok) return;

    const { system, username, password } = req.body || {};
    if (!system || !username || !password) {
      return res.status(400).json({ error: 'system, username, password are required' });
    }

    const ou = await OU.findOne({ 'divisions._id': req.params.id });
    if (!ou) return res.status(404).json({ error: 'Division not found' });

    const division = ou.divisions.id(req.params.id);
    division.credentials.push({ system, username, password });
    await ou.save();

    return res.status(201).json({ message: 'Credential added', credentials: division.credentials });
  } catch (err) {
    console.error('POST credential error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/divisions/:id/credentials/:credId
// Update an existing credential (Management/Admin for any division; normal blocked)
app.put('/api/divisions/:id/credentials/:credId', authMiddleware, async (req, res) => {
  try {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'Unknown user' });
    if (current.role === 'normal') {
      return res.status(403).json({ error: 'Permission denied: management or admin required' });
    }

    const { system, username, password } = req.body || {};
    const ou = await OU.findOne({ 'divisions._id': req.params.id });
    if (!ou) return res.status(404).json({ error: 'Division not found' });

    const division = ou.divisions.id(req.params.id);
    const cred = division.credentials.id(req.params.credId);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });

    if (system !== undefined)   cred.system = system;
    if (username !== undefined) cred.username = username;
    if (password !== undefined) cred.password = password;

    await ou.save();
    return res.json({ message: 'Credential updated', credential: cred });
  } catch (err) {
    console.error('PUT credential error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------
// TASK 3: Assign/Unassign Users; Change Role; List Users
// ---------------------------------------------------------------------

// GET /api/users  (Management+)
// List users with minimal fields for the admin UI
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'Unknown user' });
    if (current.role === 'normal') {
      return res.status(403).json({ error: 'Management or admin required' });
    }

    const users = await User.find({}, { name: 1, email: 1, role: 1, ou: 1, division: 1 }).lean();
    return res.json({ items: users.map(u => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      ou: u.ou ? String(u.ou) : null,
      division: u.division ? String(u.division) : null
    })) });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/:id/assign  (Management+)
// Body: { ouId, divisionId }  -> Assign user to OU/division
app.post('/api/users/:id/assign', authMiddleware, async (req, res) => {
  try {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'Unknown user' });
    if (current.role === 'normal') {
      return res.status(403).json({ error: 'Management or admin required' });
    }

    const { ouId, divisionId } = req.body || {};
    if (!ouId || !divisionId) return res.status(400).json({ error: 'ouId and divisionId required' });

    // Validate OU and ensure divisionId belongs to that OU
    const ou = await OU.findById(ouId);
    if (!ou) return res.status(404).json({ error: 'OU not found' });
    const division = ou.divisions.id(divisionId);
    if (!division) return res.status(400).json({ error: 'divisionId does not belong to the specified OU' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.ou = ou._id;
    user.division = division._id;
    await user.save();

    return res.json({ message: 'User assigned', user: publicUser(user) });
  } catch (err) {
    console.error('Assign user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id/assign  (Management+)
// Unassign user from OU/division (set both to null)
app.delete('/api/users/:id/assign', authMiddleware, async (req, res) => {
  try {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'Unknown user' });
    if (current.role === 'normal') {
      return res.status(403).json({ error: 'Management or admin required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.ou = null;
    user.division = null;
    await user.save();

    return res.json({ message: 'User unassigned', user: publicUser(user) });
  } catch (err) {
    console.error('Unassign user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/role  (Admin only)
// Body: { role: 'normal' | 'management' | 'admin' }
app.put('/api/users/:id/role', authMiddleware, async (req, res) => {
  try {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'Unknown user' });
    if (current.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { role } = req.body || {};
    const allowed = ['normal', 'management', 'admin'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: 'Invalid role (normal | management | admin)' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = role;
    await user.save();

    // Inform client to re-login if this is their own account
    const requireReLogin = String(user._id) === String(current._id);
    return res.json({ message: 'Role updated', user: publicUser(user), requireReLogin });
  } catch (err) {
    console.error('Change role error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
