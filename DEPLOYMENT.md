# 🚀 Quick Deployment Guide

This is a quick reference for deploying MailSuite backend. For detailed guides, see the full documentation files.

---

## 📋 Pre-Deployment Checklist

- [ ] Database migrations run on Supabase
- [ ] All environment variables ready
- [ ] Code pushed to GitHub repository
- [ ] Email sync method chosen (GitHub Actions recommended)

---

## 🎯 Deployment Method: Vercel + GitHub Actions (Free)

**Recommended for:** Free hosting with automated email sync

### Step 1: Deploy to Vercel

1. **Push to GitHub:**

   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Add environment variables (see below)
   - Click "Deploy"

### Step 2: Add Environment Variables

In Vercel project settings, add these:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# JWT & Security
JWT_SECRET=your-jwt-secret (min 32 chars)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=your-32-char-hex-key

# Email Worker
PROCESSOR_MODE=enhanced
EMAIL_BATCH_SIZE=100
EMAIL_FETCH_DAYS=30

# GitHub Actions Cron
CRON_SECRET=your-random-secret-token
```

**Generate secrets:**

```bash
# JWT_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (exactly 32 chars)
openssl rand -hex 16

# CRON_SECRET
openssl rand -base64 32
```

### Step 3: Setup GitHub Actions Email Sync

1. **Add GitHub Secrets:**
   - Go to: `GitHub Repo → Settings → Secrets and variables → Actions`
   - Add two secrets:
     - `CRON_SECRET` (same as Vercel)
     - `VERCEL_APP_URL` (e.g., `https://your-app.vercel.app`)

2. **Verify Workflow:**

   ```bash
   git add .github/workflows/email-sync.yml
   git commit -m "Add GitHub Actions cron"
   git push origin main
   ```

3. **Test it:**
   - Go to: `GitHub → Actions → Email Sync Cron Job`
   - Click "Run workflow" → "Run workflow"
   - Check logs for success ✅

### Step 4: Verify Deployment

```bash
# Test health endpoint (no auth)
curl https://your-app.vercel.app/health

# Test cron endpoint (with secret)
curl -X POST https://your-app.vercel.app/api/cron/sync-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Check Vercel logs
vercel logs --follow
```

---

## 📚 Detailed Documentation

Choose the guide that matches your setup:

### Email Sync Methods

| Method                                                                        | Cost   | Setup   | Recommended For           |
| ----------------------------------------------------------------------------- | ------ | ------- | ------------------------- |
| **[GitHub Actions](./GITHUB_ACTIONS_SETUP.md)** ⭐                            | Free   | Easy    | Vercel Free Plan users    |
| **[Vercel Cron](./VERCEL_DEPLOYMENT.md)**                                     | $20/mo | Easiest | Vercel Pro users          |
| **[Railway/Render](./VERCEL_DEPLOYMENT.md#-alternative-full-server-hosting)** | $5/mo  | Medium  | Need persistent processes |

### Full Setup Guides

- **[GitHub Actions Setup](./GITHUB_ACTIONS_SETUP.md)** - Complete free email sync (⭐ RECOMMENDED)
- **[Vercel Deployment](./VERCEL_DEPLOYMENT.md)** - All Vercel options + alternatives
- **[Quick Start Unified](./QUICK_START_UNIFIED.md)** - Local development guide
- **[Processor Modes](./PROCESSOR_MODES_GUIDE.md)** - Enhanced vs Legacy modes

---

## ⚡ Quick Commands

### Development

```bash
npm run dev          # Start everything (API + Worker)
npm run api          # API server only
npm run worker       # Email worker only
```

### Deployment

```bash
# Vercel
vercel --prod
vercel logs --follow
vercel env add VARIABLE_NAME

# GitHub Actions (manual trigger)
# Go to: Actions → Email Sync Cron Job → Run workflow
```

### Database

```sql
-- Check sync status
SELECT email_address, last_synced_at, status
FROM mailboxes;

-- Check email count
SELECT COUNT(*) FROM emails;

-- Check bounce stats
SELECT COUNT(*) as total_bounces FROM email_bounces;
```

---

## 🐛 Common Issues

### Issue: Email sync not running

**GitHub Actions:**

```bash
# Check GitHub Actions tab
# Verify CRON_SECRET matches in both GitHub & Vercel
# Check workflow is enabled
```

**Vercel Cron:**

```bash
# Only works on Vercel Pro ($20/mo)
# Check vercel.json has crons array
# Verify in Vercel Dashboard → Cron Jobs
```

### Issue: 401 Unauthorized

```bash
# CRON_SECRET mismatch
# Regenerate and update both GitHub & Vercel
openssl rand -base64 32
```

### Issue: No emails syncing

```bash
# Check Vercel logs
vercel logs --follow

# Common causes:
# - Missing mailbox credentials
# - Wrong ENCRYPTION_KEY
# - IMAP connection blocked
# - Database migration not run
```

---

## 📊 Architecture Overview

```
┌─────────────────┐
│  GitHub Actions │ ──(every 5 min)──┐
└─────────────────┘                   │
                                      ▼
┌─────────────────┐           ┌──────────────┐
│   Vercel API    │◄─────────►│ /api/cron    │
│   (Serverless)  │           │  /sync-emails│
└─────────────────┘           └──────────────┘
         │                            │
         │                            ▼
         │                    ┌──────────────┐
         │                    │ Email Worker │
         │                    │  (Enhanced)  │
         │                    └──────────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐           ┌──────────────┐
│   Client Apps   │           │   Supabase   │
│   (Flutter)     │◄─────────►│   Database   │
└─────────────────┘           └──────────────┘
```

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Health endpoint returns 200: `curl https://your-app.vercel.app/health`
- [ ] Cron endpoint works: Test with CRON_SECRET
- [ ] GitHub Actions running every 5 minutes
- [ ] Vercel logs show email sync activity
- [ ] Emails appearing in Supabase database
- [ ] Mailboxes show recent `last_synced_at`

---

## 🆘 Get Help

1. **Check logs first:**
   - GitHub: `Actions → Latest run → Logs`
   - Vercel: `vercel logs --follow`
   - Database: Check `mailboxes` table for errors

2. **Review documentation:**
   - [GitHub Actions Setup](./GITHUB_ACTIONS_SETUP.md)
   - [Vercel Deployment](./VERCEL_DEPLOYMENT.md)
   - [Troubleshooting](./VERCEL_DEPLOYMENT.md#-troubleshooting)

3. **Common fixes:**
   - Regenerate secrets and update both locations
   - Verify all environment variables
   - Check database migrations completed
   - Test endpoints with curl

---

**Your MailSuite backend is production-ready!** 🎉

Choose **[GitHub Actions Setup](./GITHUB_ACTIONS_SETUP.md)** for the easiest free deployment.
