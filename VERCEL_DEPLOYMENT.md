# 🚀 Vercel Deployment Guide

## Important: Email Worker on Vercel

**Vercel uses serverless functions** - your code only runs on-demand when requests come in. This means:

❌ **Won't Work on Vercel:**

- `node-cron` scheduler in `server.js`
- `scheduler.js` background worker
- Any persistent Node.js processes

✅ **Solution Implemented:**

- Vercel Cron Jobs (configured in `vercel.json`)
- API endpoint: `/api/cron/sync-emails`
- Runs every 5 minutes automatically

---

## 📋 Pre-Deployment Checklist

### 1. Environment Variables Setup

In your Vercel project settings, add these environment variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# JWT
JWT_SECRET=your-secret-key-min-32-characters
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption (exactly 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key

# Email Worker
PROCESSOR_MODE=enhanced

# Vercel Cron Security (IMPORTANT!)
CRON_SECRET=generate-random-secret-token
```

**Generate secure secrets:**

```bash
# For JWT_SECRET
openssl rand -base64 32

# For ENCRYPTION_KEY (must be exactly 32 characters)
openssl rand -hex 16

# For CRON_SECRET
openssl rand -base64 32
```

### 2. Database Migration

Run these SQL scripts in Supabase SQL Editor (in order):

1. ✅ `database/users_table.sql` (if not done)
2. ✅ `database/fix_foreign_keys.sql` (if not done)
3. ✅ `database/phase2_inbox_intelligence.sql`
4. ✅ `database/create_increment_failure_function.sql`

---

## 🔧 Vercel Configuration

The project includes `vercel.json` which configures:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-emails",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Cron Schedule:**

- `*/5 * * * *` = Every 5 minutes
- Vercel automatically calls `/api/cron/sync-emails`

---

## 📦 Deployment Steps

### Option 1: Deploy via GitHub (Recommended)

1. **Push code to GitHub:**

   ```bash
   git add .
   git commit -m "Add Vercel deployment support"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import your GitHub repository
   - Add environment variables
   - Click "Deploy"

3. **Enable Cron Jobs:**
   - Vercel Pro or Team plan required for Cron
   - Free plan: Use Option 2 below

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI:**

   ```bash
   npm install -g vercel
   ```

2. **Login:**

   ```bash
   vercel login
   ```

3. **Deploy:**

   ```bash
   vercel --prod
   ```

4. **Add environment variables:**
   ```bash
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   # ... add all other env vars
   ```

---

## 🔒 Secure Your Cron Endpoint

The `/api/cron/sync-emails` endpoint is protected by `CRON_SECRET`:

1. **Generate a secret:**

   ```bash
   openssl rand -base64 32
   ```

2. **Add to Vercel environment variables:**

   ```
   CRON_SECRET=your-generated-secret
   ```

3. **How it works:**
   - Vercel Cron automatically adds: `Authorization: Bearer <CRON_SECRET>`
   - Your endpoint validates the token
   - Unauthorized requests are rejected

---

## 🎯 Cron Job Pricing & Limits

### Vercel Plans

- **Free (Hobby):** ❌ No Cron Jobs
- **Pro ($20/mo):** ✅ Unlimited Cron Jobs
- **Team ($20/user/mo):** ✅ Unlimited Cron Jobs

### Alternative for Free Plan

If you're on Vercel Free plan, use external cron services:

#### Option A: GitHub Actions (Free)

Create `.github/workflows/email-sync.yml`:

```yaml
name: Email Sync Cron

on:
  schedule:
    - cron: "*/5 * * * *" # Every 5 minutes
  workflow_dispatch: # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Email Sync
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-app.vercel.app/api/cron/sync-emails
```

**Setup:**

1. Add `CRON_SECRET` to GitHub Secrets
2. Push workflow file
3. GitHub runs it every 5 minutes

#### Option B: Cron-Job.org (Free)

1. Go to https://cron-job.org
2. Create account
3. Create new cron job:
   - URL: `https://your-app.vercel.app/api/cron/sync-emails`
   - Schedule: Every 5 minutes
   - HTTP Method: POST
   - Headers: `Authorization: Bearer your-cron-secret`

#### Option C: UptimeRobot (Free)

1. Go to https://uptimerobot.com
2. Create HTTP(s) monitor
3. URL: Your cron endpoint
4. Interval: 5 minutes
5. Custom headers: Add Authorization

---

## ✅ Post-Deployment Verification

### 1. Test Health Endpoint

```bash
curl https://your-app.vercel.app/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-02-10T..."
}
```

### 2. Test Cron Endpoint (with secret)

```bash
curl -X POST https://your-app.vercel.app/api/cron/sync-emails \
  -H "Authorization: Bearer your-cron-secret"
```

Response:

```json
{
  "status": "success",
  "mailboxes": 1,
  "processed": 1,
  "errors": 0,
  "timestamp": "2026-02-10T..."
}
```

### 3. Check Vercel Logs

```bash
vercel logs --follow
```

Or in Vercel Dashboard:

- Go to your project
- Click "Logs" tab
- Filter by "Cron"
- Look for email sync logs

### 4. Verify Database

Check Supabase:

```sql
-- Check if emails are being synced
SELECT COUNT(*) FROM emails;

-- Check last sync time
SELECT id, email_address, last_synced_at
FROM mailboxes
WHERE status = 'ACTIVE';
```

---

## 🐛 Troubleshooting

### Issue: Cron Not Running

**Check:**

1. Vercel plan supports Cron (Pro/Team)
2. `vercel.json` is in root directory
3. Endpoint is accessible: Test manually with curl

**Solution:**

- Upgrade to Vercel Pro, OR
- Use external cron service (GitHub Actions, cron-job.org)

### Issue: 401 Unauthorized on Cron

**Check:**

1. `CRON_SECRET` is set in Vercel environment variables
2. Secret matches in both Vercel and cron service

**Solution:**

```bash
vercel env add CRON_SECRET
# Redeploy after adding
vercel --prod
```

### Issue: Emails Not Syncing

**Check Vercel Logs:**

```bash
vercel logs --follow
```

**Common issues:**

- Missing Supabase credentials
- Wrong ENCRYPTION_KEY (must be 32 chars)
- IMAP connection failures
- Database migration not run

### Issue: Function Timeout

Vercel free plan: 10 second timeout
Vercel Pro: 60 second timeout

**Solution:**

1. Upgrade to Pro for longer timeout
2. Process fewer emails per run
3. Optimize IMAP connection

---

## 📊 Monitoring

### Vercel Dashboard

Monitor your cron jobs:

1. Go to project in Vercel
2. Click "Cron Jobs" tab
3. View execution history

### Custom Monitoring

Add monitoring to your cron endpoint:

```javascript
// In routes/cron.js
await fetch("https://your-monitoring-service.com/ping", {
  method: "POST",
  body: JSON.stringify({
    status: "success",
    mailboxes: processedCount,
  }),
});
```

Recommended services:

- Better Uptime
- Cronitor
- Dead Man's Snitch
- Sentry

---

## 🔄 Local Development vs Vercel

### Local Development (npm run dev)

- Uses `scheduler.js` with node-cron
- Background worker runs continuously
- Both API and worker in development mode

### Vercel Production

- Uses Vercel Cron
- Calls `/api/cron/sync-emails` endpoint
- Serverless functions (no persistent process)

### Switch Between Environments

The code automatically detects the environment:

**Local:** `startEmailWorker()` in `server.js` runs
**Vercel:** Only cron endpoint is used

---

## 🚀 Alternative: Full Server Hosting

If you need persistent processes or want to avoid cron limitations:

### Railway.app (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

**Pricing:** $5/month (includes persistent processes)

### Render.com

- Supports background workers
- Free tier available
- Easy deployment

### Fly.io

- Persistent processes
- Global edge deployment
- Free tier available

### DigitalOcean App Platform

- Full Node.js support
- Background workers
- $5/month

---

## 📝 Summary

### ✅ What Works on Vercel

- API endpoints
- Vercel Cron Jobs (Pro/Team plan)
- Serverless functions
- Enhanced email processor

### ❌ What Doesn't Work on Vercel

- `node-cron` scheduler
- Background workers
- Persistent Node.js processes

### 💡 Best Setup

1. Deploy to Vercel (API)
2. Use Vercel Cron (if Pro) OR GitHub Actions (if Free)
3. Monitor via Vercel Dashboard
4. Check logs regularly

---

## 🆘 Need Help?

1. Check Vercel logs: `vercel logs --follow`
2. Test cron endpoint manually
3. Verify environment variables
4. Check Supabase connection
5. Review this guide's troubleshooting section

Your MailSuite backend is now production-ready! 🎉
---

## 📝 Summary

### ✅ What Works on Vercel

- API endpoints
- Vercel Cron Jobs (Pro/Team plan)
- Serverless functions
- Enhanced email processor

### ❌ What Doesn't Work on Vercel

- `node-cron` scheduler
- Background workers
- Persistent Node.js processes

### 💡 Best Setup

1. Deploy to Vercel (API)
2. Use Vercel Cron (if Pro) OR GitHub Actions (if Free)
3. Monitor via Vercel Dashboard
4. Check logs regularly

---

## 🆘 Need Help?

1. Check Vercel logs: `vercel logs --follow`
2. Test cron endpoint manually
3. Verify environment variables
4. Check Supabase connection
5. Review this guide's troubleshooting section

Your MailSuite backend is now production-ready! 🎉
