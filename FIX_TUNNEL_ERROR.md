# Fix Cloudflare SSL and Tunnel Errors

## Current Errors
1. **Error 1033**: Cloudflare Tunnel error (tunnel route exists but not running)
2. **ERR_SSL_VERSION_OR_CIPHER_MISMATCH**: SSL/TLS configuration issue

## The Solution
**You don't need the tunnel!** You're using:
- **Frontend**: Bluehost (hosted at `regressorstaleofcultivation.space`)
- **Backend**: Render (hosted at `rtoc-iki.onrender.com`)

## Steps to Fix

### 1. Remove Tunnel Route in Cloudflare (Fix Error 1033)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Zero Trust** → **Networks** → **Tunnels**
3. Find tunnel: `cf1df3b3-cb3b-48c1-a660-c159a92a67ea`
4. Click on it, go to **Public Hostnames** tab
5. **Delete** any route for:
   - `regressorstaleofcultivation.space`
   - `*.regressorstaleofcultivation.space`

### 2. Fix SSL/TLS Settings (Fix ERR_SSL_VERSION_OR_CIPHER_MISMATCH)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain `regressorstaleofcultivation.space`
3. Go to **SSL/TLS** in the sidebar
4. Set **SSL/TLS encryption mode** to: **"Full"** (not "Flexible")
   - This ensures Cloudflare uses HTTPS to connect to Bluehost
   - **Full** = Cloudflare ↔ Bluehost (HTTPS) ✅
   - **Flexible** = Cloudflare ↔ Bluehost (HTTP) ❌ (causes SSL errors)
5. Go to **SSL/TLS** → **Edge Certificates**
6. Make sure **"Always Use HTTPS"** is enabled
7. Make sure **"Automatic HTTPS Rewrites"** is enabled

### 3. Verify DNS Settings
Your DNS in Cloudflare should be:
- **A record** for `@` pointing to your **Bluehost server IP**
  - Get the IP from Bluehost cPanel or contact Bluehost support
  - Make sure the **proxy status is ON** (orange cloud icon)
- **CNAME** for `www` pointing to your domain or Bluehost hostname
  - Make sure the **proxy status is ON** (orange cloud icon)

**NOT** pointing to any tunnel hostname or GitHub Pages!

### 4. Configure Bluehost
1. Log into Bluehost cPanel
2. Make sure your domain is properly configured
3. Ensure SSL certificate is installed (Let's Encrypt or similar)
4. If using Cloudflare, make sure Bluehost allows Cloudflare IPs

### 5. Activate Cloudflare (if not already active)
If your domain shows "not active on Cloudflare":
1. Go to your domain registrar
2. Update nameservers to Cloudflare's nameservers (shown in Cloudflare dashboard)
3. Wait 24-48 hours for propagation

## Why This Happened
- The tunnel route exists in Cloudflare Zero Trust, causing Error 1033
- SSL/TLS mode might be set to "Flexible" which doesn't work well with Bluehost
- Or the DNS is pointing to the wrong location (tunnel instead of Bluehost)

## After Fixing
- Both errors will stop
- Your site will work normally via Bluehost with HTTPS
- API calls will go directly to Render (already configured in `api-config.js`)

## Important Notes for Bluehost + Cloudflare
- Make sure your Bluehost server IP is correct in Cloudflare DNS
- SSL/TLS mode MUST be "Full" (not "Flexible")
- The orange cloud (proxy) should be ON for all DNS records
- If you have issues, you can temporarily set SSL/TLS to "Flexible" to test, but "Full" is recommended

