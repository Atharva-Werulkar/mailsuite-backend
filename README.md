# MailSuite Backend - Phase 1 Setup

## 📦 Installation

```bash
npm install
```

## 🔐 Environment Setup

1. Generate an encryption key and JWT secret:

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

2. Update `.env` file with the generated keys:

```env
ENCRYPTION_KEY=your-generated-64-char-hex-string
JWT_SECRET=your-generated-128-char-hex-string

# Email Worker Configuration (Production-Critical)
EMAIL_BATCH_SIZE=100        # Max emails fetched per sync (prevents memory overload)
EMAIL_FETCH_DAYS=30         # Only fetch emails from last N days (prevents full mailbox scan)
```

**🚨 Important for Production:**

- `EMAIL_BATCH_SIZE`: Limits the number of emails fetched per sync. For mailboxes with thousands of emails, this prevents memory exhaustion and timeouts. Default: 100 emails.
- `EMAIL_FETCH_DAYS`: Only fetches emails from the last N days using IMAP SINCE filter. This prevents scanning entire mailbox history (critical for mailboxes with 10,000+ emails). Default: 30 days.

**Recommended Settings by Mailbox Size:**

- **Small** (< 1,000 emails): `EMAIL_BATCH_SIZE=200`, `EMAIL_FETCH_DAYS=90`
- **Medium** (1,000 - 10,000 emails): `EMAIL_BATCH_SIZE=100`, `EMAIL_FETCH_DAYS=30` (default)
- **Large** (> 10,000 emails): `EMAIL_BATCH_SIZE=50`, `EMAIL_FETCH_DAYS=7`

3. Create the users table in Supabase:
   - Go to Supabase SQL Editor
   - Run the SQL in `database/users_table.sql`

## 🚀 Running the Services

### ⚡ Development (All-in-One - RECOMMENDED)

**Single command runs API + Email Worker together:**

```bash
npm run dev
```

### 🏭 Production (Separate Services)

**API Server:**

```bash
npm run api-only
```

**Email Worker (In separate terminal/process):**

```bash
npm run worker
```

---

(Public Routes)

- `POST /api/v1/auth/register` - Register new user

  ```json
  {
    "email": "user@example.com",
    "password": "secure_password",
    "name": "User Name"
  }
  ```

- `POST /api/v1/auth/login` - Login user

  ```json
  {
    "email": "user@example.com",
    "password": "secure_password"
  }
  ```

- `POST /api/v1/auth/refresh` - Refresh access token

  ```json
  {
    "refreshToken": "your_refresh_token"
  }
  ```

- `GET /api/v1/auth/me` - Get current user info (requires auth)

### Protected Routes

All endpoints below require `Authorization: Bearer <accessT

```bash
node services/email-worker/scheduler.js
```

## 📋 Available API Endpoints

### Authentication

All endpoints require `Authorization: Bearer <jwt_token>` header

### Mailboxes

- `POST /api/v1/mailboxes` - Add new mailbox
- `GET /api/v1/mailboxes` - List mailboxes
- `PUT /api/v1/mailboxes/:id` - Update mailbox
- `DELETE /api/v1/mailboxes/:id` - Delete mailbox
- `POST /api/v1/mailboxes/test` - Test IMAP connection

### Bounces

- `GET /api/v1/bounces?limit=50&page=1&mailbox_id=xxx` - List bounces (paginated)
- `GET /api/v1/bounces/unique?mailbox_id=xxx` - Count unique failed emails
- `GET /api/v1/bounces/stats` - Get bounce statistics

## 📊 Database Schema

Make sure your Supabase database has:

- `mailboxes` table
- `email_bounces` table
- `email_bounce_events` table
- `increment_failure()` function

## ⚙️ Configuration

### Gmail IMAP Setup

For Gmail accounts, you need to:

1. Enable 2FA on the Gmail account
2. Generate an App Password
3. Use the App Password as `imap_password`

### IMAP Settings

- Host: `imap.gmail.com`
- Port: `993`
- Secure: `true`

## 🔄 How It Works

1. **User adds mailbox** via API
2. **Email worker runs every 5 minutes** (cron job)
3. **Worker fetches new emails** from IMAP since last sync
4. **Bounce detector** identifies bounce messages
5. **Parser extracts** failed recipient, error code, bounce type
6. **Data stored** in database with increment for duplicates
7. **Dashboard** shows bounce stats and trends

## 🧪 Testing Checklist

- [ ] Install dependencies: `npm install`
- [ ] Generate and set ENCRYPTION_KEY in .env
- [ ] Start API server: `npm start`
- [ ] Test API health: `curl http://localhost:3000`
- [ ] Add mailbox via POST /api/v1/mailboxes
- [ ] Test IMAP connection via POST /api/v1/mailboxes/test
- [ ] Start email worker: `node services/email-worker/scheduler.js`
- [ ] Check worker logs for email sync
- [ ] Verify bounces appear in GET /api/v1/bounces
- [ ] Check stats via GET /api/v1/bounces/stats

## 🚨 Troubleshooting

### IMAP Connection Fails

- Check Gmail App Password is correct
- Verify 2FA is enabled
- Ensure port 993 is not blocked

### No Bounces Detected

- Check that mailbox has bounce messages
- Review worker logs for processing errors
- Verify last_synced_uid is updating

### Authentication Errors

- Verify JWT token is valid
- Check SUPABASE_JWT_SECRET matches Supabase project

## 📝 Next Steps

Once Phase 1 is stable:

- Add Flutter frontend
- Implement data models
- Create dashboard UI
- Add bounce list screen
- Build mailbox setup UI
