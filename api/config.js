// /api/config.js — Public + Admin config endpoint (CommonJS for Vercel)
const { sql, initSchema, verifyAdmin, setCors } = require('./_db');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: public — return config as flat object ──
  if (req.method === 'GET') {
    try {
      await initSchema();
      const { rows } = await sql`SELECT key, value FROM config`;
      const config = {};
      for (const row of rows) {
        config[row.key] = row.value;
      }
      return res.status(200).json(config);
    } catch (err) {
      console.error('Config GET error:', err);
      return res.status(500).json({ error: 'Failed to load config.' });
    }
  }

  // ── POST: admin-only — upsert config key/value pairs ──
  if (req.method === 'POST') {
    const user = verifyAdmin(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const body = req.body || {};
    const keys = Object.keys(body);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No config values provided.' });
    }

    try {
      for (const key of keys) {
        const value = JSON.stringify(body[key]);
        await sql`
          INSERT INTO config (key, value, updated_at)
          VALUES (${key}, ${value}::jsonb, NOW())
          ON CONFLICT (key) DO UPDATE
            SET value = ${value}::jsonb,
                updated_at = NOW()
        `;
      }
      return res.status(200).json({ success: true, updated: keys });
    } catch (err) {
      console.error('Config POST error:', err);
      return res.status(500).json({ error: 'Failed to save config.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
