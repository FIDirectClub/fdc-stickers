# FDC Stickers — E-Commerce Store

Official sticker shop for **Firearms Direct Club**. Built for Vercel deployment with Authorize.net payment processing.

## 🏗 Project Structure

```
fdc-stickers/
├── index.html          # Main storefront (catalog, cart, checkout)
├── admin.html          # Admin panel (inventory, orders, reports)
├── api/
│   └── charge.js       # Vercel serverless function for Authorize.net
├── vercel.json         # Vercel deployment config
├── package.json        # Project metadata
└── README.md           # This file
```

## 🚀 Deploy to Vercel

### 1. Push to GitHub

```bash
cd fdc-stickers
git init
git add .
git commit -m "Initial commit - FDC Stickers store"
git remote add origin https://github.com/YOUR_USERNAME/fdc-stickers.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"New Project"** → Import your GitHub repo
3. Framework Preset: **Other** (no framework)
4. Click **Deploy**

### 3. Set Environment Variables

In your Vercel project dashboard → **Settings** → **Environment Variables**, add:

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTHNET_API_LOGIN_ID` | Your Authorize.net API Login ID | `5KP3u95bQpv` |
| `AUTHNET_TRANSACTION_KEY` | Your Authorize.net Transaction Key | `346HZ32z3fP4hTG2` |
| `AUTHNET_SANDBOX` | Set to `true` for testing, `false` for production | `true` |

### 4. Configure Client Keys

1. Visit your deployed site at `https://your-site.vercel.app/admin`
2. Go to the **Settings** tab
3. Enter your Authorize.net **API Login ID** and **Public Client Key**
4. Toggle **Sandbox Mode** on/off as needed
5. Save

## 💳 Authorize.net Setup

### Getting Your Credentials

1. **Sandbox (Testing):** Create a sandbox account at [developer.authorize.net](https://developer.authorize.net)
2. **Production:** Use your live Authorize.net merchant account

### Required Credentials

| Credential | Where It's Used | How to Get It |
|-----------|----------------|---------------|
| **API Login ID** | Both client & server | Authorize.net → Account → Settings → API Credentials |
| **Public Client Key** | Client-side (Accept.js) | Authorize.net → Account → Settings → Manage Public Client Key |
| **Transaction Key** | Server-side only | Authorize.net → Account → Settings → API Credentials |

### Accept.js Flow

1. Customer enters card info on your site
2. Accept.js tokenizes the card data client-side (card numbers never touch your server)
3. Token is sent to `/api/charge` serverless function
4. Server-side function charges the card via Authorize.net API
5. Result is returned to the frontend

### Switching to Production

1. In `index.html`, change the Accept.js script from sandbox to production:
   ```html
   <!-- SANDBOX (testing): -->
   <script src="https://jstest.authorize.net/v1/Accept.js"></script>

   <!-- PRODUCTION (live): -->
   <script src="https://js.authorize.net/v1/Accept.js"></script>
   ```
2. In Vercel environment variables, set `AUTHNET_SANDBOX=false`
3. In the admin panel, turn off Sandbox Mode and enter your production credentials
4. Redeploy

## 📦 Features

### Storefront (`index.html`)
- Responsive product catalog with category filtering
- Shopping cart with quantity management
- Full checkout flow with form validation
- Authorize.net Accept.js integration for secure payments
- Florida sales tax (7.5%) auto-applied for FL addresses
- Shipping restricted to lower 48 US states
- Flat rate shipping ($3.99) with free shipping over $25
- Demo mode works without Authorize.net credentials

### Admin Panel (`admin.html`)
- **Dashboard:** Revenue, orders, inventory overview
- **Products:** Add/edit/delete products, inline stock editing (max 100 items)
- **Orders:** Full order history with status management, customer details
- **Reports:** Date-filtered sales reports with breakdowns by product, customer, and state
- **Settings:** Authorize.net configuration, data import/export/reset
- CSV and JSON export for orders and reports

### Payment Processing (`api/charge.js`)
- Vercel serverless function
- Authorize.net `authCaptureTransaction`
- BOM handling for Authorize.net responses
- Proper error handling and validation
- State restriction enforcement

## 🏷 Tax & Shipping Rules

| Rule | Detail |
|------|--------|
| **Sales Tax** | 7.5% for Florida (FL) addresses only |
| **Shipping** | $3.99 flat rate USPS |
| **Free Shipping** | Orders over $25 |
| **Shipping Restriction** | Lower 48 US states only (no AK, HI, territories) |

## 💾 Data Storage

Currently uses `localStorage` for data persistence, which is ideal for:
- Getting started quickly
- Low-volume operations (< 100 items, manageable order volume)
- Single-device admin access

### Upgrading to a Database

For production at scale, consider migrating to:
- **Vercel KV** (Redis) — Simple key-value, great for this use case
- **Vercel Postgres** — Full SQL database
- **Supabase** — Postgres with a nice dashboard
- **PlanetScale** — Serverless MySQL

The data structure is already JSON-based, making migration straightforward.

## 🧪 Testing Without Authorize.net

The store works in **demo mode** when no Authorize.net credentials are configured:
- Orders are processed locally and saved to localStorage
- Inventory is automatically decremented
- Full admin reporting works
- No actual charges are made

This is perfect for testing the UI, flow, and admin features before connecting payment processing.

## 📱 Mobile Support

Fully responsive design that works on:
- Desktop (1200px+)
- Tablet (768px - 1199px)
- Mobile (< 768px)

Includes hamburger menu, mobile cart button, and touch-optimized checkout form.

## 🔒 Security Notes

- Card data is tokenized client-side via Accept.js — raw card numbers never touch your server
- Transaction Key is stored as a Vercel environment variable, never exposed to the client
- All API Login IDs and Client Keys stored in the admin panel are public-facing keys only
- Consider adding authentication to the admin panel for production (HTTP Basic Auth, Vercel Auth, etc.)

## 📄 License

Proprietary — Firearms Direct Club LLC. All rights reserved.
