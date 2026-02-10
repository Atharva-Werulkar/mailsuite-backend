# ✅ Deployment Checklist - GitHub Actions + Vercel (Free)

Use this checklist to deploy MailSuite backend with **completely free** email syncing.

---

## 📋 Before You Start

- [ ] Code pushed to GitHub repository
- [ ] Supabase project created
- [ ] Vercel account created (free plan OK)

---

## Step 1️⃣: Database Setup (5 minutes)

- [ ] **Run migrations in Supabase SQL Editor** (in order):
  1. [ ] `database/users_table.sql`
  2. [ ] `database/fix_foreign_keys.sql`
  3. [ ] `database/phase2_inbox_intelligence.sql`
  4. [ ] `database/create_increment_failure_function.sql`

---

## Step 2️⃣: Generate Secrets (2 minutes)

Run these commands and save the outputs:

```bash
# JWT_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (exactly 32 chars)
openssl rand -hex 16

# CRON_SECRET
openssl rand -base64 32
```

- [ ] JWT_SECRET generated: `_______________`
- [ ] ENCRYPTION_KEY generated: `_______________`
- [ ] CRON_SECRET generated: `_______________`

---

## Step 3️⃣: Deploy to Vercel (5 minutes)

- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Click "Add New Project"
- [ ] Import your GitHub repo
- [ ] Add environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=________________
SUPABASE_ANON_KEY=________________
JWT_SECRET=________________
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=________________
PROCESSOR_MODE=enhanced
EMAIL_BATCH_SIZE=100
EMAIL_FETCH_DAYS=30
CRON_SECRET=________________
```

- [ ] Click "Deploy"
- [ ] Save your Vercel URL: `https://________________.vercel.app`

---

## Step 4️⃣: Setup GitHub Actions (3 minutes)

### Add GitHub Secrets

- [ ] Go to: `GitHub Repo → Settings → Secrets and variables → Actions`
- [ ] Click "New repository secret"
- [ ] Add **CRON_SECRET**:
  - Name: `CRON_SECRET`
  - Value: _(same as Vercel CRON_SECRET)_
- [ ] Add **VERCEL_APP_URL**:
  - Name: `VERCEL_APP_URL`
  - Value: `https://your-app.vercel.app` _(NO trailing slash)_

### Verify Workflow File

- [ ] Confirm `.github/workflows/email-sync.yml` exists in your repo
- [ ] If not, it was created - commit and push:
  ```bash
  git add .github/workflows/email-sync.yml
  git commit -m "Add GitHub Actions email sync"
  git push origin main
  ```

---

## Step 5️⃣: Test Everything (5 minutes)

### Test 1: Health Endpoint

```bash
curl https://YOUR-APP.vercel.app/health
```

**Expected:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-10T..."
}
```

- [ ] ✅ Health check returns 200

### Test 2: Cron Endpoint

```bash
curl -X POST https://YOUR-APP.vercel.app/api/cron/sync-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Expected:**

```json
{
  "status": "success",
  "mailboxes": 0,
  "processed": 0,
  "errors": 0
}
```

- [ ] ✅ Cron endpoint returns 200

### Test 3: GitHub Actions

- [ ] Go to: `GitHub → Actions → Email Sync Cron Job`
- [ ] Click "Run workflow" → "Run workflow"
- [ ] Wait for green checkmark ✅
- [ ] ✅ Workflow completes successfully

### Test 4: Check Logs

```bash
vercel logs --follow
```

- [ ] ✅ See "Cron job triggered" in logs
- [ ] ✅ No errors in logs

---

## Step 6️⃣: Add First Mailbox (5 minutes)

### Register User

```bash
curl -X POST https://YOUR-APP.vercel.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "password": "SecurePassword123",
    "name": "Your Name"
  }'
```

**Save the access token!**

- [ ] ✅ User registered
- [ ] Access token: `_______________`

### Add Mailbox

```bash
curl -X POST https://YOUR-APP.vercel.app/api/v1/mailboxes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_address": "your@email.com",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "your@email.com",
    "imap_password": "your-app-password"
  }'
```

**For Gmail:** Use App Password (not regular password)

- Go to: https://myaccount.google.com/apppasswords
- Generate password
- Use that in `imap_password`

- [ ] ✅ Mailbox added successfully

---

## Step 7️⃣: Verify Email Sync (10 minutes)

### Wait for GitHub Actions

- [ ] Wait 5 minutes for next cron run
- [ ] Check: `GitHub → Actions → Email Sync Cron Job`
- [ ] ✅ See successful run

### Check Vercel Logs

```bash
vercel logs --follow
```

**Look for:**

```
🔄 Cron job triggered: 2026-02-10T...
📬 Found 1 active mailbox(es)
📨 Processing X new messages...
✅ Email sync completed
```

- [ ] ✅ See email processing in logs

### Check Database

In Supabase SQL Editor:

```sql
-- Check emails
SELECT COUNT(*) FROM emails;

-- Check sync time
SELECT email_address, last_synced_at, status
FROM mailboxes;
```

- [ ] ✅ Emails appearing in database
- [ ] ✅ `last_synced_at` is recent

---

## 🎉 Success!

You now have:

- ✅ Backend deployed on Vercel (free)
- ✅ Email sync via GitHub Actions (free)
- ✅ Automatic sync every 5 minutes
- ✅ Database storing emails in Supabase

---

## 🔧 Optional Tweaks

### Change Sync Frequency

Edit `.github/workflows/email-sync.yml`:

```yaml
schedule:
  - cron: "*/10 * * * *" # Every 10 minutes
```

### Enable Email Notifications

- [ ] Go to: `GitHub → Settings → Notifications`
- [ ] Enable: "Notify me when a workflow run fails"

### Add Status Badge

Add to your README:

```markdown
![Email Sync](https://github.com/YOUR_USERNAME/mailsuite-backend/actions/workflows/email-sync.yml/badge.svg)
```

---

## 🐛 Troubleshooting

### Workflow fails with 401 Unauthorized

**Fix:** CRON_SECRET mismatch

1. Regenerate: `openssl rand -base64 32`
2. Update GitHub Secret
3. Update Vercel env var
4. Redeploy: `vercel --prod`

### Workflow fails with 404 Not Found

**Fix:** Wrong VERCEL_APP_URL

1. Check Vercel deployment URL
2. Update GitHub Secret (NO trailing slash)
3. Test again

### No emails syncing

**Fix:** Check these in order:

1. Mailbox credentials correct?
2. ENCRYPTION_KEY exactly 32 chars?
3. IMAP host/port correct?
4. Gmail: Using App Password?
5. Check Vercel logs for specific error

---

## 📚 Full Documentation

- **[GitHub Actions Setup Guide](./GITHUB_ACTIONS_SETUP.md)** - Detailed setup
- **[Deployment Guide](./DEPLOYMENT.md)** - All deployment options
- **[Troubleshooting](./VERCEL_DEPLOYMENT.md#-troubleshooting)** - Common issues

---

**Everything working?** Your MailSuite backend is production-ready! 🚀

**Having issues?** See the troubleshooting section above or check the detailed guides.
