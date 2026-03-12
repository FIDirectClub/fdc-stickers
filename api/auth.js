// /api/auth.js — Admin Authentication (CommonJS for Vercel)
const crypto = require('crypto');
const { setCors } = require('./_db');

function signToken(payload, secret) {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return encoded + '.' + sig;
}

function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  var parts = token.split('.');
  var expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  if (parts[1] !== expected) return null;
  try {
    var data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  var ADMIN_SECRET = process.env.ADMIN_SECRET || 'fdc-default-change-me';

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin credentials not configured on server.' });
  }

  var body = req.body || {};

  if (body.action === 'login') {
    var username = (body.username || '').toString();
    var password = (body.password || '').toString();
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    var uMatch = crypto.timingSafeEqual(Buffer.from(username.padEnd(256, '\0')), Buffer.from(ADMIN_USERNAME.padEnd(256, '\0')));
    var pMatch = crypto.timingSafeEqual(Buffer.from(password.padEnd(256, '\0')), Buffer.from(ADMIN_PASSWORD.padEnd(256, '\0')));

    if (!uMatch || !pMatch) {
      await new Promise(function(r) { setTimeout(r, 500 + Math.random() * 500); });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    var token = signToken({ user: username, iat: Date.now(), exp: Date.now() + 86400000 }, ADMIN_SECRET);
    return res.status(200).json({ success: true, token: token });
  }

  if (body.action === 'verify') {
    var authH = (req.headers.authorization || '').replace('Bearer ', '') || body.token || '';
    if (!authH) return res.status(401).json({ valid: false, error: 'No token.' });
    var payload = verifyToken(authH, ADMIN_SECRET);
    if (!payload) return res.status(401).json({ valid: false, error: 'Invalid or expired session.' });
    return res.status(200).json({ valid: true, user: payload.user });
  }

  return res.status(400).json({ error: 'Invalid action.' });
};
