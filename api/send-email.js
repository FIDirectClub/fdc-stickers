// /api/send-email.js — Order Confirmation Email via Gmail SMTP (CommonJS for Vercel)

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, customer, shippingAddress, items, subtotal, tax, shipping, total } = req.body || {};

    if (!orderId || !customer || !customer.email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    const STORE_NAME = process.env.STORE_NAME || 'FDC Stickers';
    const STORE_FROM = process.env.STORE_FROM_EMAIL || GMAIL_USER;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.log('Email not configured — GMAIL_USER or GMAIL_APP_PASSWORD missing');
      return res.status(200).json({ success: false, reason: 'Email not configured' });
    }

    // Build item rows for email
    const itemRows = (items || []).map(item =>
      `<tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e0ddd5;font-size:14px;color:#333;">
          ${item.name}${item.prize ? '<br><span style="color:#FF2D55;font-size:12px;">🏆 Includes free entry to win: ' + item.prize + '</span>' : ''}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e0ddd5;text-align:center;font-size:14px;color:#333;">${item.qty}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e0ddd5;text-align:right;font-size:14px;color:#333;">$${(item.price * item.qty).toFixed(2)}</td>
      </tr>`
    ).join('');

    const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#e0ddd5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:32px;letter-spacing:4px;color:#FF2D55;font-family:Impact,Arial Black,sans-serif;">FDC STICKERS</h1>
      <p style="margin:4px 0 0;font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;">Firearms Direct Club &bull; Milton, FL</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:40px 32px;">
      <h2 style="margin:0 0 8px;font-size:28px;color:#1a1a1a;font-family:Impact,Arial Black,sans-serif;letter-spacing:2px;">ORDER CONFIRMED! 🎉</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
        Thanks for your order, <strong style="color:#1a1a1a;">${customer.firstName}</strong>! Your stickers are on the way and your free sweepstakes entries are locked in. Good luck — somebody's winning a gun, and it might be you.
      </p>

      <!-- Order ID -->
      <div style="background:#f5f3ee;border:2px solid #1a1a1a;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <span style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#666;">Order Number</span><br>
        <strong style="font-size:20px;color:#1a1a1a;letter-spacing:2px;">${orderId}</strong>
      </div>

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f5f3ee;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#666;border-bottom:2px solid #1a1a1a;">Item</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#666;border-bottom:2px solid #1a1a1a;">Qty</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#666;border-bottom:2px solid #1a1a1a;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="border-top:2px solid #1a1a1a;padding-top:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#666;">Subtotal</td>
            <td style="padding:4px 0;font-size:14px;color:#333;text-align:right;">$${(subtotal || 0).toFixed(2)}</td>
          </tr>
          ${(tax && tax > 0) ? `<tr>
            <td style="padding:4px 0;font-size:14px;color:#666;">FL Sales Tax (7.5%)</td>
            <td style="padding:4px 0;font-size:14px;color:#333;text-align:right;">$${tax.toFixed(2)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#666;">Shipping</td>
            <td style="padding:4px 0;font-size:14px;color:#2ECC40;text-align:right;font-weight:bold;">FREE</td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;font-size:20px;font-weight:bold;color:#1a1a1a;border-top:2px solid #1a1a1a;">Total</td>
            <td style="padding:12px 0 0;font-size:20px;font-weight:bold;color:#FF2D55;text-align:right;border-top:2px solid #1a1a1a;">$${(total || 0).toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <!-- Shipping Address -->
      <div style="margin-top:24px;padding:16px 20px;background:#f5f3ee;border:1px solid #e0ddd5;">
        <span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#666;">Shipping To</span><br>
        <strong style="color:#1a1a1a;">${customer.firstName} ${customer.lastName}</strong><br>
        <span style="font-size:14px;color:#444;">${shippingAddress.address}${shippingAddress.address2 ? ', ' + shippingAddress.address2 : ''}<br>
        ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}</span>
      </div>

      <!-- Free entry note -->
      <div style="margin-top:24px;padding:16px 20px;background:rgba(255,45,85,0.06);border-left:4px solid #FF2D55;">
        <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">
          <strong style="color:#FF2D55;">🏆 Sweepstakes Entries Included</strong><br>
          Each sticker in your order includes a free entry into the corresponding firearm giveaway. Winners are drawn when all stickers sell out. No purchase was necessary to enter — see our Official Rules for details.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;color:#888;">
        Firearms Direct Club, LLC &bull; 409 N. Pace Blvd., Pensacola, FL 32505
      </p>
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.5;">
        NO PURCHASE NECESSARY TO ENTER OR WIN. Firearm prizes must be transferred through a licensed FFL dealer. You must be 21+ and a legal resident of the lower 48 US states.
      </p>
    </div>

  </div>
</body>
</html>`;

    const textEmail = `ORDER CONFIRMED — ${orderId}

Thanks for your order, ${customer.firstName}! Your stickers are on the way and your free sweepstakes entries are locked in.

Order: ${orderId}
Total: $${(total || 0).toFixed(2)}
Shipping: FREE

${(items || []).map(i => `- ${i.name} x${i.qty} — $${(i.price * i.qty).toFixed(2)}${i.prize ? ' (Free entry: ' + i.prize + ')' : ''}`).join('\n')}

Shipping to: ${customer.firstName} ${customer.lastName}, ${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}

Each sticker includes a free sweepstakes entry for the corresponding firearm. Good luck!

— FDC Stickers | Firearms Direct Club | Milton, FL`;

    // Create Gmail transport
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
      }
    });

    // Send to customer
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${STORE_FROM}>`,
      to: customer.email,
      subject: `Order Confirmed — ${orderId} | FDC Stickers`,
      text: textEmail,
      html: htmlEmail
    });

    // Also BCC to store owner for records
    if (GMAIL_USER !== customer.email) {
      await transporter.sendMail({
        from: `"${STORE_NAME}" <${STORE_FROM}>`,
        to: GMAIL_USER,
        subject: `[NEW ORDER] ${orderId} — ${customer.firstName} ${customer.lastName} — $${(total || 0).toFixed(2)}`,
        text: textEmail,
        html: htmlEmail
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email error:', error);
    return res.status(200).json({ success: false, error: error.message });
  }
};
