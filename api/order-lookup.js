// /api/order-lookup.js — Public order status lookup (CommonJS for Vercel)
const { sql, initSchema, setCors } = require('./_db');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await initSchema();

    var orderId = (req.query.id || '').trim();
    var email = (req.query.email || '').trim().toLowerCase();

    if (!orderId || !email) {
      return res.status(400).json({ error: 'Order ID and email are required.' });
    }

    var { rows } = await sql`
      SELECT * FROM orders
      WHERE id = ${orderId}
      AND LOWER(customer->>'email') = ${email}`;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found. Check your order number and email address.' });
    }

    var o = rows[0];
    return res.status(200).json({
      id: o.id,
      date: o.order_date,
      status: o.status,
      items: o.items,
      subtotal: Number(o.subtotal),
      tax: Number(o.tax),
      shipping: Number(o.shipping),
      total: Number(o.total),
      shippingAddress: {
        city: o.shipping_address.city,
        state: o.shipping_address.state,
        zip: o.shipping_address.zip
      }
    });
  } catch (error) {
    console.error('Order lookup error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
};
