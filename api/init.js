// /api/init.js — Initialize database schema and seed default products (CommonJS for Vercel)
const { sql, initSchema, verifyAdmin, setCors, getDefaultProducts } = require('./_db');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Admin auth required
  var user = verifyAdmin(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Create tables if they don't exist
    await initSchema();

    // Check if products table is empty
    var { rows } = await sql`SELECT COUNT(*)::int AS count FROM products`;
    var isEmpty = rows[0].count === 0;
    var seeded = false;

    if (isEmpty) {
      var defaults = getDefaultProducts();
      for (var i = 0; i < defaults.length; i++) {
        var p = defaults[i];
        await sql`
          INSERT INTO products (id, name, price, category, image, badge, stock, tagline, description,
            full_description, prize, prize_value, prize_type, entries, entries_remaining, specs)
          VALUES (${p.id}, ${p.name}, ${p.price}, ${p.category || ''}, ${p.image || ''}, ${p.badge || ''},
            ${p.stock || 0}, ${p.tagline || ''}, ${p.description || ''}, ${p.fullDescription || ''},
            ${p.prize || ''}, ${p.prizeValue || 0}, ${p.prizeType || ''}, ${p.entries || 0},
            ${p.entriesRemaining || 0}, ${JSON.stringify(p.specs || {})})`;
      }
      seeded = true;
    }

    return res.status(200).json({ success: true, seeded: seeded });
  } catch (error) {
    console.error('Init error:', error);
    return res.status(500).json({ error: 'Database initialization failed.' });
  }
};
