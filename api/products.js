// /api/products.js — Products CRUD endpoint (CommonJS for Vercel)
const { sql, initSchema, verifyAdmin, setCors, getDefaultProducts } = require('./_db');

// Map a DB row (snake_case) to a frontend-friendly object (camelCase)
function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price),
    category: r.category,
    image: r.image,
    badge: r.badge,
    stock: r.stock,
    tagline: r.tagline,
    description: r.description,
    fullDescription: r.full_description,
    prize: r.prize,
    prizeValue: Number(r.prize_value),
    prizeType: r.prize_type,
    entries: r.entries,
    entriesRemaining: r.entries_remaining,
    specs: r.specs || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// Seed default products into an empty table
async function seedDefaults() {
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
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Ensure tables exist (idempotent, fast if already created)
    await initSchema();

    // ── GET — public, no auth ──
    if (req.method === 'GET') {
      var id = req.query.id;

      // Single product by id
      if (id) {
        var { rows } = await sql`SELECT * FROM products WHERE id = ${id}`;
        if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        return res.status(200).json(mapRow(rows[0]));
      }

      // All products
      var result = await sql`SELECT * FROM products ORDER BY created_at ASC`;

      // Auto-seed if table is empty
      if (result.rows.length === 0) {
        await seedDefaults();
        result = await sql`SELECT * FROM products ORDER BY created_at ASC`;
      }

      return res.status(200).json(result.rows.map(mapRow));
    }

    // ── POST — admin auth, upsert product ──
    if (req.method === 'POST') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      var body = req.body || {};
      if (!body.id || !body.name || body.price == null) {
        return res.status(400).json({ error: 'Missing required fields: id, name, price' });
      }

      var p = body;
      await sql`
        INSERT INTO products (id, name, price, category, image, badge, stock, tagline, description,
          full_description, prize, prize_value, prize_type, entries, entries_remaining, specs)
        VALUES (
          ${p.id}, ${p.name}, ${p.price}, ${p.category || ''}, ${p.image || ''}, ${p.badge || ''},
          ${p.stock || 0}, ${p.tagline || ''}, ${p.description || ''}, ${p.fullDescription || ''},
          ${p.prize || ''}, ${p.prizeValue || 0}, ${p.prizeType || ''}, ${p.entries || 0},
          ${p.entriesRemaining || 0}, ${JSON.stringify(p.specs || {})}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          category = EXCLUDED.category,
          image = EXCLUDED.image,
          badge = EXCLUDED.badge,
          stock = EXCLUDED.stock,
          tagline = EXCLUDED.tagline,
          description = EXCLUDED.description,
          full_description = EXCLUDED.full_description,
          prize = EXCLUDED.prize,
          prize_value = EXCLUDED.prize_value,
          prize_type = EXCLUDED.prize_type,
          entries = EXCLUDED.entries,
          entries_remaining = EXCLUDED.entries_remaining,
          specs = EXCLUDED.specs,
          updated_at = NOW()`;

      return res.status(200).json({ success: true, id: p.id });
    }

    // ── DELETE — admin auth ──
    if (req.method === 'DELETE') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      var id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing product id' });

      await sql`DELETE FROM products WHERE id = ${id}`;
      return res.status(200).json({ success: true, deleted: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Products error:', error);
    return res.status(500).json({ error: 'Database error.' });
  }
};
