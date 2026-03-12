// /api/_db.js — Shared database helper, schema init, and auth verification
// Underscore prefix means Vercel won’t expose this as an API endpoint
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Create sql tagged template function with fullResults mode
// so return format matches { rows: [...], rowCount: N } like pg
const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL, { fullResults: true });

// ── SCHEMA INITIALIZATION ──
async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      category TEXT DEFAULT '',
      image TEXT DEFAULT '',
      badge TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      tagline TEXT DEFAULT '',
      description TEXT DEFAULT '',
      full_description TEXT DEFAULT '',
      prize TEXT DEFAULT '',
      prize_value NUMERIC(10,2) DEFAULT 0,
      prize_type TEXT DEFAULT '',
      entries INTEGER DEFAULT 0,
      entries_remaining INTEGER DEFAULT 0,
      specs JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTz DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer JSONB NOT NULL,
      shipping_address JSONB NOT NULL,
      items JSONB NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL,
      tax NUMERIC(10,2) DEFAULT 0,
      shipping NUMERIC(10,2) DEFAULT 0,
      total NUMERIC(10,2) NOT NULL,
      status TEXT DEFAULT 'confirmed',
      payment_method TEXT DEFAULT '',
      transaction_id TEXT DEFAULT '',
      auth_code TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}

// ── AUTH HELPER ──
function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  var parts = token.split('.');
  var expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  if (parts[1] !== expected) return null;
  try {
    var data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

function verifyAdmin(req) {
  var secret = process.env.ADMIN_SECRET || 'fdc-default-change-me';
  var authHeader = (req.headers.authorization || '').replace('Bearer ', '');
  if (!authHeader) return null;
  return verifyToken(authHeader, secret);
}

// ── CORS HELPER ──
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── DEFAULT PRODUCTS ──
function getDefaultProducts() {
  return [
    { id:'glock-19-gen5', name:'Glock 19 Gen 5 Sticker', price:9.99, category:'pistols', image:'', badge:'hot', stock:200,
      tagline:'America's favorite carry gun could be yours.',
      description:'Limited edition FDC sticker — includes a free entry to win a Glock 19 Gen 5 (ARV $549). 4" premium vinyl.',
      fullDescription:'', prize:'Glock 19 Gen 5', prizeValue:549, prizeType:'Pistol — 9mm', entries:200, entriesRemaining:200,
      specs:{ prize:'Glock 19 Gen 5', caliber:'9mm', prizeARV:'$549', stickerSize:'4" × 4"', entries:'200 Max', material:'Premium Vinyl' } },
    { id:'sig-p365', name:'SIG P365 Sticker', price:9.99, category:'pistols', image:'', badge:'new', stock:150,
      tagline:'Macro performance. Micro sticker price.',
      description:'Limited edition FDC sticker — includes a free entry to win a SIG Sauer P365 (ARV $499). 4" die-cut vinyl.',
      fullDescription:'', prize:'SIG Sauer P365', prizeValue:499, prizeType:'Pistol — 9mm', entries:150, entriesRemaining:150,
      specs:{ prize:'SIG Sauer P365', caliber:'9mm', prizeARV:'$499', stickerSize:'4" × 3"', entries:'150 Max', material:'Die-Cut Vinyl' } },
    { id:'smith-mp-shield', name:'M&P Shield Plus Sticker', price:7.99, category:'pistols', image:'', badge:'', stock:250,
      tagline:'Shield up. Stack your odds.',
      description:'Limited edition FDC sticker — includes a free entry to win a Smith & Wesson M&P Shield Plus (ARV $449). 4" matte vinyl.',
      fullDescription:'', prize:'Smith & Wesson M&P Shield Plus', prizeValue:449, prizeType:'Pistol — 9mm', entries:250, entriesRemaining:250,
      specs:{ prize:'S&W M&P Shield Plus', caliber:'9mm', prizeARV:'$449', stickerSize:'4" × 4"', entries:'250 Max', material:'Matte Vinyl' } },
    { id:'ar15-psa', name:'PSA AR-15 Sticker', price:14.99, category:'rifles', image:'', badge:'hot', stock:100,
      tagline:'The modern musket. The original freedom stick.',
      description:'Limited edition FDC sticker — includes a free entry to win a Palmetto State Armory AR-15 (ARV $699). 5" premium vinyl.',
      fullDescription:'', prize:'PSA PA-15 16" AR-15', prizeValue:699, prizeType:'Rifle — 5.56 NATO', entries:100, entriesRemaining:100,
      specs:{ prize:'PSA PA-15 AR-15', caliber:'5.56 NATO', prizeARV:'$699', stickerSize:'5" × 2"', entries:'100 Max', material:'Premium Vinyl' } },
    { id:'henry-lever-action', name:'Henry Big Boy Sticker', price:14.99, category:'rifles', image:'', badge:'new', stock:75,
      tagline:'Cowboy action meets modern sweepstakes.',
      description:'Limited edition FDC sticker — includes a free entry to win a Henry Big Boy Classic .44 Mag (ARV $899). 5" die-cut vinyl.',
      fullDescription:'', prize:'Henry Big Boy Classic .44 Mag', prizeValue:899, prizeType:'Lever Action — .44 Mag', entries:75, entriesRemaining:75,
      specs:{ prize:'Henry Big Boy Classic', caliber:'.44 Magnum', prizeARV:'$899', stickerSize:'5" × 2"', entries:'75 Max', material:'Die-Cut Vinyl' } },
    { id:'mossberg-500', name:'Mossberg 500 Sticker', price:9.99, category:'shotguns', image:'', badge:'', stock:175,
      tagline:'Home defense legend. Sticker game legend.',
      description:'Limited edition FDC sticker — includes a free entry to win a Mossberg 500 Tactical (ARV $479). 4" matte vinyl.',
      fullDescription:'', prize:'Mossberg 500 Tactical', prizeValue:479, prizeType:'Shotgun — 12 Gauge', entries:175, entriesRemaining:175,
      specs:{ prize:'Mossberg 500 Tactical', caliber:'12 Gauge', prizeARV:'$479', stickerSize:'4" × 4"', entries:'175 Max', material:'Matte Vinyl' } },
    { id:'ruger-1022', name:'Ruger 10/22 Sticker', price:7.99, category:'rifles', image:'', badge:'', stock:300,
      tagline:'Everybody's first. Could be your next.',
      description:'Limited edition FDC sticker — includes a free entry to win a Ruger 10/22 Carbine (ARV $309). 4" premium vinyl.',
      fullDescription:'', prize:'Ruger 10/22 Carbine', prizeValue:309, prizeType:'Rifle — .22 LR', entries:300, entriesRemaining:300,
      specs:{ prize:'Ruger 10/22 Carbine', caliber:'.22 LR', prizeARV:'$309', stickerSize:'4" × 3"', entries:'300 Max', material:'Premium Vinyl' } },
    { id:'springfield-hellcat', name:'Hellcat Pro Sticker', price:9.99, category:'pistols', image:'', badge:'hot', stock:150,
      tagline:'Unleash the Hellcat.',
      description:'Limited edition FDC sticker — includes a free entry to win a Springfield Hellcat Pro (ARV $569). 4" holographic vinyl.',
      fullDescription:'', prize:'Springfield Hellcat Pro', prizeValue:569, prizeType:'Pistol — 9mm', entries:150, entriesRemaining:150,
      specs:{ prize:'Springfield Hellcat Pro', caliber:'9mm', prizeARV:'$569', stickerSize:'4" × 4"', entries:'150 Max', material:'Holographic Vinyl' } }
  ];
}

module.exports = { sql, initSchema, verifyAdmin, verifyToken, setCors, getDefaultProducts };
