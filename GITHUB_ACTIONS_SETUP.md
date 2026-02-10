# 🤖 GitHub Actions Email Sync Setup

This guide walks you through setting up **free** email syncing using GitHub Actions - perfect for Vercel's free plan!

## ✨ What You Get

- ✅ **Completely Free** - No paid plans needed
- ✅ **Runs Every 5 Minutes** - Automatic email sync
- ✅ **Manual Trigger** - Run sync on-demand from GitHub
- ✅ **Error Notifications** - Know when something goes wrong
- ✅ **Works with Vercel Free Plan** - No Pro subscription needed

---

## 📋 Setup Steps

### Step 1: Configure GitHub Secrets

Your workflow needs two secrets to work:

1. **Go to your GitHub repository**
   - Navigate to: `Settings` → `Secrets and variables` → `Actions`
   - Click `New repository secret`

2. **Add CRON_SECRET**
   - Name: `CRON_SECRET`
   - Value: Generate a secure random token:

     ```bash
     # On Mac/Linux
     openssl rand -base64 32

     # On Windows PowerShell
     [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
     ```

   - Click `Add secret`

3. **Add VERCEL_APP_URL**
   - Name: `VERCEL_APP_URL`
   - Value: Your Vercel deployment URL (e.g., `https://mailsuite-backend.vercel.app`)
   - ⚠️ **Important:** Do NOT include trailing slash
   - Click `Add secret`

### Step 2: Add CRON_SECRET to Vercel

The same `CRON_SECRET` must be added to Vercel:

1. **Go to Vercel Dashboard**
   - Open your project
   - Go to `Settings` → `Environment Variables`

2. **Add Environment Variable**
   - Name: `CRON_SECRET`
   - Value: The SAME value you used in GitHub
   - Scope: All environments (Production, Preview, Development)
   - Click `Save`

3. **Redeploy** (important!)
   ```bash
   vercel --prod
   ```
   Or trigger a new deployment via Git push

### Step 3: Enable GitHub Actions

1. **Commit and Push Workflow**

   ```bash
   git add .github/workflows/email-sync.yml
   git commit -m "Add GitHub Actions email sync"
   git push origin main
   ```

2. **Verify Workflow is Active**
   - Go to your GitHub repo
   - Click `Actions` tab
   - You should see "Email Sync Cron Job" workflow

3. **Test Manual Trigger (optional)**
   - Click on "Email Sync Cron Job"
   - Click `Run workflow` dropdown
   - Click `Run workflow` button
   - Watch it execute in real-time!

---

## ✅ Verification

### Check if it's Working

1. **View Workflow Runs**

   ```
   GitHub Repo → Actions → Email Sync Cron Job
   ```

   - Green checkmark ✅ = Success
   - Red X ❌ = Failed (check logs)

2. **Check Vercel Logs**

   ```bash
   vercel logs --follow
   ```

   Look for:

   ```
   🔄 Cron job triggered: 2026-02-10T...
   📬 Found X active mailbox(es)
   ✅ Email sync completed
   ```

3. **Verify Database**
   In Supabase SQL Editor:

   ```sql
   -- Check if emails are syncing
   SELECT COUNT(*) FROM emails;

   -- Check last sync time
   SELECT email_address, last_synced_at
   FROM mailboxes
   WHERE status = 'ACTIVE';
   ```

### Expected Timeline

- **First run:** Within 5 minutes of pushing the workflow
- **Subsequent runs:** Every 5 minutes (GitHub Actions schedule)
- **Manual runs:** Immediate when triggered

---

## 🔧 Configuration

### Change Sync Frequency

Edit `.github/workflows/email-sync.yml`:

```yaml
on:
  schedule:
    # Every 5 minutes (default)
    - cron: "*/5 * * * *"

    # Every 10 minutes
    # - cron: '*/10 * * * *'

    # Every hour
    # - cron: '0 * * * *'

    # Every 6 hours
    # - cron: '0 */6 * * *'
```

**Cron syntax:** `minute hour day month weekday`

### Adjust Timeout

Default timeout is 6 hours. To change:

```yaml
jobs:
  sync-emails:
    runs-on: ubuntu-latest
    timeout-minutes: 10 # Add this line
```

---

## 🐛 Troubleshooting

### ❌ Workflow Fails with "HTTP Status: 401"

**Problem:** CRON_SECRET mismatch

**Solution:**

1. Regenerate secret: `openssl rand -base64 32`
2. Update GitHub Secret: `Settings → Secrets → CRON_SECRET`
3. Update Vercel Env: `Settings → Environment Variables → CRON_SECRET`
4. Redeploy Vercel: `vercel --prod`
5. Run workflow manually to test

### ❌ Workflow Fails with "HTTP Status: 404"

**Problem:** Wrong VERCEL_APP_URL

**Solution:**

1. Check your Vercel deployment URL
2. Update GitHub Secret: `Settings → Secrets → VERCEL_APP_URL`
3. Ensure NO trailing slash (❌ `https://app.vercel.app/` → ✅ `https://app.vercel.app`)
4. Run workflow manually to test

### ❌ Workflow Doesn't Run Automatically

**Problem:** GitHub Actions disabled or workflow not committed

**Solution:**

1. Check: `GitHub Repo → Settings → Actions → General`
2. Ensure "Allow all actions" is selected
3. Verify workflow file is committed: `.github/workflows/email-sync.yml`
4. Check Actions tab for any errors

### ❌ "No active mailboxes" in Logs

**Problem:** No mailboxes configured in database

**Solution:**

1. Log in to your app
2. Add a mailbox via API:
   ```bash
   curl -X POST https://your-app.vercel.app/api/v1/mailboxes \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "email_address": "your@email.com",
       "imap_host": "imap.gmail.com",
       "imap_port": 993,
       "imap_username": "your@email.com",
       "imap_password": "your-password"
     }'
   ```

### ❌ Workflow Succeeds but No Emails

**Problem:** IMAP connection or database issues

**Solution:**

1. Check Vercel logs: `vercel logs --follow`
2. Look for specific errors:
   - `IMAP connection failed` → Check mailbox credentials
   - `Database error` → Verify Supabase credentials
   - `Encryption error` → Check ENCRYPTION_KEY (must be 32 chars)

---

## 📊 Monitoring Best Practices

### 1. Enable Email Notifications

Get notified when workflows fail:

1. Go to: `GitHub → Settings → Notifications`
2. Under "Actions", enable:
   - ✅ "Notify me when a workflow run fails"

### 2. Check Workflow Status Badge

Add to your README.md:

```markdown
![Email Sync](https://github.com/YOUR_USERNAME/mailsuite-backend/actions/workflows/email-sync.yml/badge.svg)
```

Shows real-time status of your email sync!

### 3. Review Logs Regularly

```bash
# Quick check on GitHub
GitHub → Actions → Email Sync Cron Job → Latest run

# Quick check on Vercel
vercel logs --since 1h
```

### 4. Set Up Uptime Monitoring (Optional)

Use a service like:

- **UptimeRobot** (free) - Monitor your API health endpoint
- **Better Uptime** - Get alerts when API is down
- **Cronitor** - Monitor cron job execution

---

## 💡 GitHub Actions Limits

### Free Plan Limits

- ✅ **2,000 minutes/month** per account
- ✅ **500 MB storage** for artifacts/logs
- ✅ **Unlimited** public repo usage

### Usage Calculation

- **Email sync every 5 minutes** = 12 runs/hour = 288 runs/day
- **Each run takes ~10 seconds** = ~48 minutes/day
- **Monthly usage** = ~1,440 minutes/month

**Verdict:** ✅ Well within free limits!

### If You Hit Limits

1. **Reduce frequency** to every 10-15 minutes
2. **Optimize** the sync process (fewer emails per run)
3. **Upgrade** to GitHub Pro ($4/month) for 3,000 minutes

---

## 🔄 Migration from Vercel Cron

Already using Vercel Cron? Here's how to switch:

### Step 1: Remove Vercel Cron

```bash
# Delete or comment out in vercel.json
{
  "crons": []  // Clear this array
}
```

### Step 2: Set Up GitHub Actions

Follow the setup steps above.

### Step 3: Redeploy

```bash
vercel --prod
```

### Step 4: Test

Run workflow manually on GitHub to verify.

---

## 🚀 Advanced: Multiple Schedules

Run different sync frequencies for different times:

```yaml
on:
  schedule:
    # Every 5 minutes during work hours
    - cron: "*/5 9-17 * * 1-5"

    # Every 30 minutes outside work hours
    - cron: "*/30 0-8,18-23 * * 1-5"

    # Every hour on weekends
    - cron: "0 * * * 0,6"
```

---

## 📝 Summary

### ✅ What You Have Now

- Free automated email syncing
- Runs every 5 minutes via GitHub Actions
- Works with Vercel free plan
- Manual trigger option
- Error notifications

### 🎯 Next Steps

1. Monitor the Actions tab for first few runs
2. Check Vercel logs to confirm syncing
3. Verify emails in Supabase database
4. Adjust frequency if needed

### 🆘 Need Help?

1. Check workflow logs: `GitHub → Actions → Latest run`
2. Check Vercel logs: `vercel logs --follow`
3. Verify all secrets are set correctly
4. Test cron endpoint manually:
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/sync-emails \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

Your email sync is now running completely free! 🎉


### Step 1: Remove Vercel Cron

```bash
# Delete or comment out in vercel.json
{
  "crons": []  // Clear this array

}
```

### Step 2: Set Up GitHub Actions

Follow the setup steps above.

### Step 3: Redeploy

```bash
vercel --prod

```

### Step 4: Test

Run workflow manually on GitHub to verify.


---

## 🚀 Advanced: Multiple Schedules

Run different sync frequencies for different times:

```yaml

on:
  schedule:
    # Every 5 minutes during work hours
    - cron: '*/5 9-17 * * 1-5'
    
    # Every 30 minutes outside work hours
    - cron: '*/30 0-8,18-23 * * 1-5'
    
    # Every hour on weekends
    - cron: '0 * * * 0,6'
```


---

## 📝 Summary

### ✅ What You Have Now

- Free automated email syncing
- Runs every 5 minutes via GitHub Actions
- Works with Vercel free plan
- Manual trigger option
- Error notifications

### 🎯 Next Steps

1. Monitor the Actions tab for first few runs
2. Check Vercel logs to confirm syncing
3. Verify emails in Supabase database
4. Adjust frequency if needed

### 🆘 Need Help?

1. Check workflow logs: `GitHub → Actions → Latest run`
2. Check Vercel logs: `vercel logs --follow`
3. Verify all secrets are set correctly
4. Test cron endpoint manually:

   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/sync-emails \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

Your email sync is now running completely free! 🎉
