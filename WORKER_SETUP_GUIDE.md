# 🔄 Email Worker & IMAP Setup - How It Works

## Quick Answer

**For Development:** Just run `npm run dev` - it starts EVERYTHING (API + Worker)

**For Production:** Run both processes separately:

- `npm run api-only` (API server)
- `npm run worker` (Email worker in another terminal/service)

---

## 📝 How Users Add IMAP Credentials

### Step 1: User Registers/Logs In

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

**Gets back:**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Step 2: User Adds Mailbox via API

```bash
curl -X POST http://localhost:3000/api/v1/mailboxes \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_address": "myemail@gmail.com",
    "provider": "gmail",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "myemail@gmail.com",
    "imap_password": "app-password-here"
  }'
```

**What happens:**

- Password is encrypted and stored
- Mailbox status set to `ACTIVE`
- `last_synced_uid` = 0 (will fetch all messages)

### Step 3: Worker Automatically Processes It

The email worker runs **every 5 minutes** and:

1. Queries database for all `ACTIVE` mailboxes
2. For each mailbox:
   - Connects to IMAP
   - Fetches new emails since `last_synced_uid`
   - Detects bounce messages
   - Stores bounce data
   - Updates `last_synced_uid`

**User doesn't need to do anything - it's automatic!**

---

## 🔄 Complete Flow Diagram

```
┌──────────────────────────────────────────────────┐
│  User App (Flutter/Web)                          │
└────────────┬─────────────────────────────────────┘
             │
             │ 1. POST /auth/login
             ↓
┌──────────────────────────────────────────────────┐
│  API Server (port 3000)                          │
│  - Handles auth, mailbox CRUD, bounces queries   │
└────────────┬─────────────────────────────────────┘
             │
             │ 2. POST /mailboxes (add Gmail account)
             ↓
┌──────────────────────────────────────────────────┐
│  Supabase Database                               │
│  - mailboxes table (status: ACTIVE)              │
└────────────┬─────────────────────────────────────┘
             │
             │ 3. Worker checks every 5 min
             ↓
┌──────────────────────────────────────────────────┐
│  Email Worker (Background Process)               │
│  - Runs cron job: */5 * * * *                    │
│  - Fetches ACTIVE mailboxes                      │
└────────────┬─────────────────────────────────────┘
             │
             │ 4. For each mailbox
             ↓
┌──────────────────────────────────────────────────┐
│  IMAP Client                                     │
│  - Connects to Gmail IMAP                        │
│  - Fetches messages since last_synced_uid        │
└────────────┬─────────────────────────────────────┘
             │
             │ 5. Detect bounces
             ↓
┌──────────────────────────────────────────────────┐
│  Bounce Detector                                 │
│  - Checks if email is bounce                     │
│  - Parses error codes                            │
│  - Classifies HARD/SOFT/UNKNOWN                  │
└────────────┬─────────────────────────────────────┘
             │
             │ 6. Store results
             ↓
┌──────────────────────────────────────────────────┐
│  Supabase Database                               │
│  - email_bounces table                           │
│  - email_bounce_events table                     │
└────────────┬─────────────────────────────────────┘
             │
             │ 7. User fetches data
             ↓
┌──────────────────────────────────────────────────┐
│  GET /api/v1/bounces                             │
│  GET /api/v1/bounces/stats                       │
└──────────────────────────────────────────────────┘
```

---

## ⏰ Timing Example

**Time 10:00** - User adds Gmail mailbox via API  
**Time 10:05** - Worker runs, processes mailbox for first time  
**Time 10:10** - Worker runs again, checks for new emails  
**Time 10:15** - Worker runs again, etc...

**User sees bounce data immediately** after first worker run (max 5-minute delay)

---

## 🎯 Why Two Processes?

### API Server (app.js or server.js)

- **Purpose:** Handle user requests
- **Must be:** Fast, responsive
- **Can't:** Do long-running IMAP operations (blocks requests)

### Email Worker (scheduler.js or built into server.js)

- **Purpose:** Background processing
- **Can:** Take time to check mailboxes
- **Runs:** Independently without blocking API

---

## 🛠️ Your Options

### Option 1: Combined (EASIEST - What I Just Created)

```bash
npm run dev
```

**File:** `server.js`  
**Pros:** One command, easy development  
**Cons:** If API crashes, worker stops too

### Option 2: Separate Processes

```bash
# Terminal 1
npm run api-only

# Terminal 2
npm run worker
```

**Pros:** Independent, production-ready  
**Cons:** Need to manage 2 processes

### Option 3: Production Setup

Use process manager like PM2:

```bash
pm2 start server.js --name "mailsuite"
# OR
pm2 start app.js --name "mailsuite-api"
pm2 start services/email-worker/scheduler.js --name "mailsuite-worker"
```

---

## ⚙️ Worker Configuration (Production-Critical)

### Email Batch Processing Settings

For mailboxes with **thousands of emails**, configure these environment variables to prevent memory issues and timeouts:

```env
# .env
EMAIL_BATCH_SIZE=100        # Max emails fetched per sync
EMAIL_FETCH_DAYS=30         # Only fetch emails from last N days
```

### Why These Settings Matter

**Without batch limiting:**

- Worker attempts to fetch ALL emails (could be 10,000+)
- Causes memory exhaustion, timeouts, server crashes
- Processing takes 30+ seconds per sync

**With batch limiting:**

- Fetches max 100 emails per 5-minute sync
- Uses IMAP `SINCE` date filter (only last 30 days)
- Each sync completes in <5 seconds
- Stable memory usage (<50MB)

### Recommended Settings by Mailbox Size

| Mailbox Size        | EMAIL_BATCH_SIZE | EMAIL_FETCH_DAYS  |
| ------------------- | ---------------- | ----------------- |
| **< 1,000 emails**  | 200              | 90 days           |
| **1,000 - 10,000**  | 100              | 30 days (default) |
| **> 10,000 emails** | 50               | 7 days            |

**Example for large mailboxes:**

```env
EMAIL_BATCH_SIZE=50
EMAIL_FETCH_DAYS=7
```

### How Batch Processing Works

```
Mailbox: 11,961 total emails

Without batching:
└── Sync 1: Attempts 11,961 emails → CRASH ❌

With batching (EMAIL_BATCH_SIZE=100, EMAIL_FETCH_DAYS=30):
└── Sync 1 (5 min):  Process 100 emails from last 30 days ✅
└── Sync 2 (10 min): Process next 100 emails ✅
└── Sync 3 (15 min): Process next 100 emails ✅
└── ...gradually catches up without overwhelming server
```

---

## 🧪 Testing the Flow

### 1. Start the server

```bash
npm run dev
```

You'll see:

```
🚀 API running on port 3000
📧 Email worker scheduler started
⏰ Running every 5 minutes
```

### 2. Register and login

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 3. Add Gmail mailbox

```bash
curl -X POST http://localhost:3000/api/v1/mailboxes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_address": "youremail@gmail.com",
    "provider": "gmail",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "youremail@gmail.com",
    "imap_password": "your-app-password"
  }'
```

### 4. Wait 5 minutes (or change cron to `* * * * *` for every minute during testing)

### 5. Check logs

You'll see:

```
🔄 Starting email sync...
📬 Found 1 active mailbox(es)
📬 Processing mailbox: youremail@gmail.com
📧 Fetched 5 new messages
✅ Processed 5 messages, found 2 bounces
✅ Email sync completed
```

### 6. Fetch bounces

```bash
curl -X GET http://localhost:3000/api/v1/bounces \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚀 Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up .env:**

   ```bash
   # Generate keys
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

   Update `JWT_SECRET` and `ENCRYPTION_KEY` in `.env`

3. **Create users table in Supabase**
   Run SQL from `database/users_table.sql`

4. **Start everything:**

   ```bash
   npm run dev
   ```

5. **Test:**

   ```bash
   # Register
   curl -X POST http://localhost:3000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'

   # Add mailbox
   curl -X POST http://localhost:3000/api/v1/mailboxes \
     -H "Authorization: Bearer TOKEN" \
     -d '{"email_address":"...","imap_password":"..."}'

   # Wait 5 minutes, then check bounces
   curl http://localhost:3000/api/v1/bounces \
     -H "Authorization: Bearer TOKEN"
   ```

---

## ✅ Summary

**You DON'T need to manually trigger anything!**

1. User adds mailbox → Stored in database
2. Worker runs automatically every 5 minutes
3. Worker processes all ACTIVE mailboxes
4. Bounces appear in API responses

**For development:** Just run `npm run dev` ✨
