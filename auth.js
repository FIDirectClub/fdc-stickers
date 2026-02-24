// /api/auth.js
// Vercel Serverless Function — Admin Authentication
// Credentials are stored as Vercel environment variables:
//   ADMIN_USERNAME  (e.g. "admin")
//   ADMIN_PASSWORD  (e.g. "your-strong-password-here")
//   ADMIN_SECRET    (a random string used to sign session tokens)

import crypto from 'crypto';

function signToken(payload, secret) {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return encoded + '.' + signature;
}

function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (signature !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    // Check expiry (24 hours)
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fdc-stickers-default-secret-change-me';

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin credentials not configured on server.' });
  }

  const { action } = req.body;

  // ── LOGIN ──
  if (action === 'login') {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Constant-time comparison to prevent timing attacks
    const usernameMatch = crypto.timingSafeEqual(
      Buffer.from(username.padEnd(256, '\0')),
      Buffer.from(ADMIN_USERNAME.padEnd(256, '\0'))
    );
    const passwordMatch = crypto.timingSafeEqual(
      Buffer.from(password.padEnd(256, '\0')),
      Buffer.from(ADMIN_PASSWORD.padEnd(256, '\0'))
    );

    if (!usernameMatch || !passwordMatch) {
      // Brief delay to slow brute force
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Issue session token (valid 24 hours)
    const token = signToken({
      user: username,
      iat: Date.now(),
      exp: Date.now() + (24 * 60 * 60 * 1000)
    }, ADMIN_SECRET);

    return res.status(200).json({ success: true, token });
  }

  // ── VERIFY ──
  if (action === 'verify') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '') || req.body.token;

    if (!token) {
      return res.status(401).json({ valid: false, error: 'No token provided.' });
    }

    const payload = verifyToken(token, ADMIN_SECRET);
    if (!payload) {
      return res.status(401).json({ valid: false, error: 'Invalid or expired session.' });
    }

    return res.status(200).json({ valid: true, user: payload.user });
  }

  return res.status(400).json({ error: 'Invalid action. Use "login" or "verify".' });
}
