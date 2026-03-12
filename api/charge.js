// /api/charge.js — Authorize.net Payment Processing (CommonJS for Vercel)
const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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

    var EXCLUDED = ['AK', 'HI'];
    if (EXCLUDED.indexOf(shippingAddress.state) >= 0) {
      return res.status(400).json({ error: 'Sorry, we only ship to the lower 48 United States.' });
    }

    var API_LOGIN_ID = process.env.AUTHNET_API_LOGIN_ID;
    var TRANSACTION_KEY = process.env.AUTHNET_TRANSACTION_KEY;
    var IS_SANDBOX = process.env.AUTHNET_SANDBOX === 'true';

    console.log('FDC charge.js: Sandbox=' + IS_SANDBOX + ', LoginID=' + (API_LOGIN_ID ? API_LOGIN_ID.substring(0, 3) + '***' : 'MISSING') + ', TxnKey=' + (TRANSACTION_KEY ? '***set***' : 'MISSING'));

    if (!API_LOGIN_ID || !TRANSACTION_KEY) {
      console.error('FDC charge.js: Missing AUTHNET_API_LOGIN_ID or AUTHNET_TRANSACTION_KEY env vars');
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

    console.log('FDC charge.js: Authorize.net response resultCode=' + (data.messages ? data.messages.resultCode : 'unknown'));

    if (data.messages && data.messages.resultCode === 'Ok') {
      var tr = data.transactionResponse;
      if (tr && tr.responseCode === '1') {
        // Save order to database and decrement stock atomically
        try {
          await sql`
            INSERT INTO orders (id, order_date, customer, shipping_address, items,
              subtotal, tax, shipping, total, status, payment_method, transaction_id, auth_code)
            VALUES (
              ${orderId}, ${new Date().toISOString()},
              ${JSON.stringify(customer)}, ${JSON.stringify(shippingAddress)},
              ${JSON.stringify(items)}, ${parseFloat(amount) - parseFloat(tax || 0) - parseFloat(shipping || 0)},
              ${parseFloat(tax || 0)}, ${parseFloat(shipping || 0)}, ${parseFloat(amount)},
              'confirmed', 'authorize.net', ${tr.transId || ''}, ${tr.authCode || ''}
            )`;
          // Decrement stock for each item purchased
          for (var si = 0; si < (items || []).length; si++) {
            await sql`
              UPDATE products
              SET stock = GREATEST(0, stock - ${items[si].qty}),
                  entries_remaining = GREATEST(0, entries_remaining - ${items[si].qty}),
                  updated_at = NOW()
              WHERE id = ${items[si].id}`;
          }
        } catch (dbErr) {
          // Payment succeeded but DB save failed - log but still return success
          // The payment was already captured, so the order exists at Authorize.net
          console.error('FDC charge.js: DB save failed after successful payment:', dbErr);
        }

        return res.status(200).json({
          success: true, orderId: orderId,
          transactionId: tr.transId, authCode: tr.authCode
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
