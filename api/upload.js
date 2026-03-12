// /api/upload.js — Product Image Upload via Vercel Blob (CommonJS for Vercel)
const { put } = require('@vercel/blob');
const { verifyAdmin, setCors } = require('./_db');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var user = verifyAdmin(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: 'Image storage not configured. Add Vercel Blob to your project.' });
    }

    var body = req.body || {};
    var filename = body.filename;
    var contentType = body.contentType;
    var data = body.data;

    if (!filename || !data) {
      return res.status(400).json({ error: 'Missing filename or data' });
    }

    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.indexOf(contentType) < 0) {
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed.' });
    }

    var buffer = Buffer.from(data, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image must be under 2MB.' });
    }

    // Sanitize filename
    var safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    var blobPath = 'products/' + Date.now() + '-' + safeName;

    var blob = await put(blobPath, buffer, {
      access: 'public',
      contentType: contentType
    });

    return res.status(200).json({ url: blob.url });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
};
