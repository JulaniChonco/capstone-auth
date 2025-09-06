// backend/middleware/auth.js
// -------------------------------------------------------------
// JWT auth guard for protected routes.
// Accepts "Authorization: Bearer <JWT>" and verifies it.
// IMPORTANT: Use the SAME secret (with the SAME fallback) as server.js
// so tokens signed by the server can be verified here.
// -------------------------------------------------------------

import jwt from 'jsonwebtoken';

// Match server.js fallback:
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_change_me';

export function authMiddleware(req, res, next) {
  // 1) Read header
  const authHeader = req.headers['authorization']; // e.g. "Bearer eyJhbGciOi..."
  if (!authHeader) {
    return res.status(401).json({ error: 'No Authorization header provided' });
  }

  // 2) Expect "Bearer <token>"
  const parts = authHeader.split(' ');
  const scheme = parts[0];
  const token = parts[1];
  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ error: 'Malformed Authorization header. Use: Bearer <token>' });
  }

  // 3) Verify
  try {
    const decoded = jwt.verify(token, JWT_SECRET); // ✅ same secret as server.js
    req.user = decoded; // { id, email, role, iat, exp }
    return next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
