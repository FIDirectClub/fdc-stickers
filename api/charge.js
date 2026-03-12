// /api/charge.js — Authorize.net Payment Processing (CommonJS for Vercel)
const { sql, initSchema, setCors } = require('./_db');

// Void a transaction if DB operations fail after successful charge
async function voidTransaction(transId, apiLoginId, transactionKey, isSandbox) {
  try {
    var ep = isSandbox
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';
    var voidReq = {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey: transactionKey },
        transactionRequest: { transactionType: 'voidTransaction', refTransId: transId }
      }
    };
    var resp = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voidReq)
    });
    var text = await resp.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
    var data = JSON.parse(text);
    var ok = data.messages && data.messages.resultCode === 'Ok';
    console.log('FDC charge.js: Void ' + transId + ' result=' + (ok ? 'OK' : 'FAILED'));
    return ok;
  } catch (err) {
    console.error('FDC charge.js: Void failed:', err);
    return false;
  }
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await initSchema();

    var body = req.body || {};
    var opaqueData = body.opaqueData;
    var amount = body.amount;
    var tax = body.tax;
    var shipping = body.shipping;
    var customer = body.customer;
    var shippingAddress = body.shippingAddress;
    var items = body.items;

    if (!opaqueData || !amount || !customer || !shippingAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Rate limit: reject if same email placed an order in last 2 minutes
    if (customer.email) {
      try {
        var recent = await sql`
          SELECT COUNT(*)::int as cnt FROM orders
          WHERE customer->>'email' = ${customer.email}
          AND created_at > NOW() - INTERVAL '2 minutes'`;
        if (recent.rows[0] && recent.rows[0].cnt > 0) {
          return res.status(429).json({ error: 'Please wait a moment before placing another order.' });
        }
      } catch (rlErr) {
        console.warn('FDC charge.js: Rate limit check failed:', rlErr.message);
      }
    }

    var EXCLUDED = ['AK', 'HI'];
    if (EXCLUDED.indexOf(shippingAddress.state) >= 0) {
      return res.status(400).json({ error: 'Sorry, we only ship to the lower 48 United States.' });
    }

    var API_LOGIN_ID = process.env.AUTHNET_API_LOGIN_ID;
    var TRANSACTION_KEY = process.env.AUTHNET_TRANSACTION_KEY;
    var IS_SANDBOX = process.env.AUTHNET_SANDBOX === 'true';

    console.log('FDC charge.js: Sandbox=' + IS_SANDBOX + ', LoginID=' + (API_LOGIN_ID ? API_LOGIN_ID.substring(0, 3) + '***' : 'MISSING') + ', TxnKey=' + (TRANSACTION_KEY ? '***set***' : 'MISSING'));

    if (!API_LOGIN_ID || !TRANSACTION_KEY) {
      return res.status(500).json({ error: 'Payment gateway not configured.' });
    }

    var endpoint = IS_SANDBOX
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';

    var orderId = 'FDC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    var lineItems = (items || []).slice(0, 30).map(function(item) {
      return {
        itemId: item.id.substring(0, 31),
        name: item.name.substring(0, 31),
        description: item.name.substring(0, 255),
        quantity: item.qty.toString(),
        unitPrice: item.price.toFixed(2)
      };
    });

    var txRequest = {
      createTransactionRequest: {
        merchantAuthentication: { name: API_LOGIN_ID, transactionKey: TRANSACTION_KEY },
        refId: orderId,
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: amount,
          payment: {
            opaqueData: { dataDescriptor: opaqueData.dataDescriptor, dataValue: opaqueData.dataValue }
          },
          order: { invoiceNumber: orderId, description: 'FDC Stickers Order' },
          lineItems: lineItems.length > 0 ? { lineItem: lineItems } : undefined,
          tax: { amount: tax || '0.00', name: 'FL Sales Tax', description: 'Florida 7.5%' },
          shipping: { amount: shipping || '0.00', name: 'USPS', description: 'Standard USPS' },
          customer: { email: customer.email },
          billTo: {
            firstName: customer.firstName, lastName: customer.lastName,
            address: shippingAddress.address, city: shippingAddress.city,
            state: shippingAddress.state, zip: shippingAddress.zip, country: 'US'
          },
          shipTo: {
            firstName: customer.firstName, lastName: customer.lastName,
            address: shippingAddress.address, city: shippingAddress.city,
            state: shippingAddress.state, zip: shippingAddress.zip, country: 'US'
          },
          transactionSettings: { setting: [{ settingName: 'duplicateWindow', settingValue: '60' }] }
        }
      }
    };

    var response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txRequest)
    });

    var responseText = await response.text();
    if (responseText.charCodeAt(0) === 0xFEFF) responseText = responseText.substring(1);
    var data = JSON.parse(responseText);

    console.log('FDC charge.js: Authorize.net resultCode=' + (data.messages ? data.messages.resultCode : 'unknown'));

    if (data.messages && data.messages.resultCode === 'Ok') {
      var tr = data.transactionResponse;
      if (tr && tr.responseCode === '1') {
        var transId = tr.transId || '';
        var authCode = tr.authCode || '';

        try {
          // 1. Atomic stock decrement — fails if insufficient stock
          for (var si = 0; si < (items || []).length; si++) {
            var stockResult = await sql`
              UPDATE products
              SET stock = stock - ${items[si].qty},
                  entries_remaining = entries_remaining - ${items[si].qty},
                  updated_at = NOW()
              WHERE id = ${items[si].id} AND stock >= ${items[si].qty}
              RETURNING stock`;

            if (stockResult.rows.length === 0) {
              // Revert previous stock decrements
              for (var ri = 0; ri < si; ri++) {
                await sql`
                  UPDATE products
                  SET stock = stock + ${items[ri].qty},
                      entries_remaining = entries_remaining + ${items[ri].qty},
                      updated_at = NOW()
                  WHERE id = ${items[ri].id}`;
              }
              // Void the charge
              await voidTransaction(transId, API_LOGIN_ID, TRANSACTION_KEY, IS_SANDBOX);
              return res.status(400).json({
                success: false,
                error: '"' + items[si].name + '" is out of stock. Your card was not charged.'
              });
            }
          }

          // 2. Insert order record
          await sql`
            INSERT INTO orders (id, order_date, customer, shipping_address, items,
              subtotal, tax, shipping, total, status, payment_method, transaction_id, auth_code)
            VALUES (
              ${orderId}, ${new Date().toISOString()},
              ${JSON.stringify(customer)}, ${JSON.stringify(shippingAddress)},
              ${JSON.stringify(items)},
              ${parseFloat(amount) - parseFloat(tax || 0) - parseFloat(shipping || 0)},
              ${parseFloat(tax || 0)}, ${parseFloat(shipping || 0)}, ${parseFloat(amount)},
              'confirmed', 'authorize.net', ${transId}, ${authCode}
            )`;

        } catch (dbErr) {
          // DB failed — void the charge to protect the customer
          console.error('FDC charge.js: DB error after payment, voiding ' + transId + ':', dbErr);
          var voided = await voidTransaction(transId, API_LOGIN_ID, TRANSACTION_KEY, IS_SANDBOX);
          if (voided) {
            return res.status(500).json({
              success: false,
              error: 'Problem saving your order. Your card has been refunded. Please try again.'
            });
          } else {
            console.error('FDC charge.js: CRITICAL — Payment ' + transId + ' charged but void failed.');
            return res.status(500).json({
              success: false,
              error: 'Problem processing your order. Contact support with reference: ' + transId
            });
          }
        }

        return res.status(200).json({
          success: true, orderId: orderId,
          transactionId: transId, authCode: authCode
        });
      }
      var errMsg = (tr && tr.errors) ? tr.errors[0].errorText : 'Transaction not approved';
      return res.status(400).json({ success: false, error: errMsg });
    }

    var apiErr = (data.messages && data.messages.message) ? data.messages.message[0].text : 'Payment error';
    return res.status(400).json({ success: false, error: apiErr });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};
