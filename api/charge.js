// /api/charge.js — Authorize.net Payment Processing (CommonJS for Vercel)

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

    if (data.messages && data.messages.resultCode === 'Ok') {
      var tr = data.transactionResponse;
      if (tr && tr.responseCode === '1') {
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
