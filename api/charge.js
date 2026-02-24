// /api/charge.js
// Vercel Serverless Function — Authorize.net Payment Processing
// Uses the Accept.js token (opaque data) to create a transaction server-side

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      opaqueData,   // { dataDescriptor, dataValue } from Accept.js
      amount,
      tax,
      shipping,
      customer,
      shippingAddress,
      items
    } = req.body;

    // Validate required fields
    if (!opaqueData || !amount || !customer || !shippingAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate state is in lower 48
    const EXCLUDED_STATES = ['AK', 'HI'];
    if (EXCLUDED_STATES.includes(shippingAddress.state)) {
      return res.status(400).json({ error: 'Sorry, we only ship to the lower 48 United States.' });
    }

    // Environment variables (set these in your Vercel dashboard)
    const API_LOGIN_ID = process.env.AUTHNET_API_LOGIN_ID;
    const TRANSACTION_KEY = process.env.AUTHNET_TRANSACTION_KEY;
    const IS_SANDBOX = process.env.AUTHNET_SANDBOX === 'true';

    if (!API_LOGIN_ID || !TRANSACTION_KEY) {
      return res.status(500).json({ error: 'Payment gateway not configured. Contact support.' });
    }

    // Build Authorize.net API request
    const endpoint = IS_SANDBOX
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';

    // Generate order ID
    const orderId = 'FDC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    // Build line items
    const lineItems = (items || []).slice(0, 30).map(item => ({
      lineItem: {
        itemId: item.id.substring(0, 31),
        name: item.name.substring(0, 31),
        description: item.name.substring(0, 255),
        quantity: item.qty.toString(),
        unitPrice: item.price.toFixed(2)
      }
    }));

    const transactionRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: API_LOGIN_ID,
          transactionKey: TRANSACTION_KEY
        },
        refId: orderId,
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: amount,
          payment: {
            opaqueData: {
              dataDescriptor: opaqueData.dataDescriptor,
              dataValue: opaqueData.dataValue
            }
          },
          order: {
            invoiceNumber: orderId,
            description: 'FDC Stickers Order'
          },
          lineItems: lineItems.length > 0 ? { lineItem: lineItems.map(l => l.lineItem) } : undefined,
          tax: {
            amount: tax || '0.00',
            name: 'FL Sales Tax',
            description: 'Florida State Sales Tax 7.5%'
          },
          shipping: {
            amount: shipping || '0.00',
            name: 'USPS Shipping',
            description: 'Standard USPS Shipping'
          },
          customer: {
            email: customer.email
          },
          billTo: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            address: shippingAddress.address,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zip,
            country: 'US'
          },
          shipTo: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            address: shippingAddress.address,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zip,
            country: 'US'
          },
          transactionSettings: {
            setting: [
              {
                settingName: 'duplicateWindow',
                settingValue: '60'
              }
            ]
          }
        }
      }
    };

    // Call Authorize.net API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionRequest)
    });

    // Authorize.net returns response with BOM sometimes, handle it
    let responseText = await response.text();
    // Remove BOM if present
    if (responseText.charCodeAt(0) === 0xFEFF) {
      responseText = responseText.substring(1);
    }

    const data = JSON.parse(responseText);

    // Check response
    if (data.messages && data.messages.resultCode === 'Ok') {
      const transResponse = data.transactionResponse;

      if (transResponse && (transResponse.responseCode === '1')) {
        // Transaction approved
        return res.status(200).json({
          success: true,
          orderId: orderId,
          transactionId: transResponse.transId,
          authCode: transResponse.authCode,
          message: 'Payment approved'
        });
      } else {
        // Transaction declined or error
        const errorMsg = transResponse && transResponse.errors
          ? transResponse.errors[0].errorText
          : 'Transaction was not approved';
        return res.status(400).json({
          success: false,
          error: errorMsg
        });
      }
    } else {
      // API-level error
      const errorMsg = data.messages && data.messages.message
        ? data.messages.message[0].text
        : 'Payment processing error';
      return res.status(400).json({
        success: false,
        error: errorMsg
      });
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again.'
    });
  }
}
