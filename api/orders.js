// /api/orders.js — Orders CRUD endpoint (CommonJS for Vercel)
const { sql, initSchema, verifyAdmin, setCors } = require('./_db');

// Map a DB row (snake_case) to a frontend-friendly object (camelCase)
function mapRow(r) {
  return {
    id: r.id,
    date: r.order_date,
    customer: r.customer,
    shippingAddress: r.shipping_address,
    items: r.items,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    shipping: Number(r.shipping),
    total: Number(r.total),
    status: r.status,
    paymentMethod: r.payment_method,
    transactionId: r.transaction_id,
    authCode: r.auth_code,
    createdAt: r.created_at
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initSchema();

    // ── GET — admin auth, list orders with optional filters ──
    if (req.method === 'GET') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      var status = req.query.status;
      var from = req.query.from;
      var to = req.query.to;

      var result;
      if (status && from && to) {
        result = await sql`
          SELECT * FROM orders
          WHERE status = ${status} AND order_date >= ${from}::timestamptz AND order_date <= ${to}::timestamptz
          ORDER BY order_date DESC`;
      } else if (status) {
        result = await sql`
          SELECT * FROM orders WHERE status = ${status} ORDER BY order_date DESC`;
      } else if (from && to) {
        result = await sql`
          SELECT * FROM orders
          WHERE order_date >= ${from}::timestamptz AND order_date <= ${to}::timestamptz
          ORDER BY order_date DESC`;
      } else if (from) {
        result = await sql`
          SELECT * FROM orders WHERE order_date >= ${from}::timestamptz ORDER BY order_date DESC`;
      } else if (to) {
        result = await sql`
          SELECT * FROM orders WHERE order_date <= ${to}::timestamptz ORDER BY order_date DESC`;
      } else {
        result = await sql`SELECT * FROM orders ORDER BY order_date DESC`;
      }

      return res.status(200).json(result.rows.map(mapRow));
    }

    // ── POST — admin auth required (orders are created internally by charge.js via direct SQL) ──
    if (req.method === 'POST') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      var body = req.body || {};

      if (!body.id || !body.customer || !body.shippingAddress || !body.items || body.total == null) {
        return res.status(400).json({ error: 'Missing required fields: id, customer, shippingAddress, items, total' });
      }

      await sql`
        INSERT INTO orders (id, order_date, customer, shipping_address, items, subtotal, tax, shipping, total,
          status, payment_method, transaction_id, auth_code)
        VALUES (
          ${body.id},
          ${body.date || new Date().toISOString()},
          ${JSON.stringify(body.customer)},
          ${JSON.stringify(body.shippingAddress)},
          ${JSON.stringify(body.items)},
          ${body.subtotal || 0},
          ${body.tax || 0},
          ${body.shipping || 0},
          ${body.total},
          ${body.status || 'confirmed'},
          ${body.paymentMethod || ''},
          ${body.transactionId || ''},
          ${body.authCode || ''}
        )`;

      return res.status(201).json({ success: true, id: body.id });
    }

    // ── PUT — admin auth, update order ──
    if (req.method === 'PUT') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      var body = req.body || {};
      if (!body.id) return res.status(400).json({ error: 'Missing order id' });

      // Check order exists
      var { rows: existing } = await sql`SELECT id FROM orders WHERE id = ${body.id}`;
      if (existing.length === 0) return res.status(404).json({ error: 'Order not found' });

      // Update only provided fields
      if (body.status !== undefined) {
        await sql`UPDATE orders SET status = ${body.status} WHERE id = ${body.id}`;
      }
      if (body.customer !== undefined) {
        await sql`UPDATE orders SET customer = ${JSON.stringify(body.customer)} WHERE id = ${body.id}`;
      }
      if (body.shippingAddress !== undefined) {
        await sql`UPDATE orders SET shipping_address = ${JSON.stringify(body.shippingAddress)} WHERE id = ${body.id}`;
      }
      if (body.items !== undefined) {
        await sql`UPDATE orders SET items = ${JSON.stringify(body.items)} WHERE id = ${body.id}`;
      }
      if (body.transactionId !== undefined) {
        await sql`UPDATE orders SET transaction_id = ${body.transactionId} WHERE id = ${body.id}`;
      }
      if (body.authCode !== undefined) {
        await sql`UPDATE orders SET auth_code = ${body.authCode} WHERE id = ${body.id}`;
      }
      if (body.paymentMethod !== undefined) {
        await sql`UPDATE orders SET payment_method = ${body.paymentMethod} WHERE id = ${body.id}`;
      }

      return res.status(200).json({ success: true, id: body.id });
    }

    // ── DELETE — admin auth, single or bulk delete ──
    if (req.method === 'DELETE') {
      var user = verifyAdmin(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      // Bulk delete: ?ids=id1,id2,id3
      var idsParam = req.query.ids;
      if (idsParam) {
        var idList = idsParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (idList.length === 0) return res.status(400).json({ error: 'No valid ids provided' });

        // Delete each id individually (Vercel Postgres sql tag doesn't support IN with arrays easily)
        var deleted = 0;
        for (var i = 0; i < idList.length; i++) {
          var r = await sql`DELETE FROM orders WHERE id = ${idList[i]}`;
          deleted += r.rowCount || 0;
        }
        return res.status(200).json({ success: true, deleted: deleted });
      }

      // Single delete: ?id=xxx
      var id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing order id or ids' });

      await sql`DELETE FROM orders WHERE id = ${id}`;
      return res.status(200).json({ success: true, deleted: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Orders error:', error);
    return res.status(500).json({ error: 'Database error.' });
  }
};
