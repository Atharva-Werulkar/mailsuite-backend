# Phase 2 Implementation Guide

## 🎉 Phase 2: Inbox Intelligence - Complete!

This guide will help you deploy Phase 2 to your MailSuite backend.

## What's New in Phase 2

### 📦 Backend Features

- ✅ **Full Email Ingestion** - All emails are now stored, not just bounces
- ✅ **Email Classification** - Automatic categorization into: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER
- ✅ **Email Threading** - Groups emails into conversations
- ✅ **Email Management APIs** - Browse, search, filter, and manage emails
- ✅ **Thread Management APIs** - View and manage conversations
- ✅ **Backward Compatible** - Phase 1 bounce detection still works

### 📊 Database Tables Added

- `emails` - Full email metadata storage
- `email_threads` - Conversation grouping
- `email_labels` - Custom labels (for future use)
- `email_label_assignments` - Many-to-many labels

## Deployment Steps

### Step 1: Run Database Migration

Execute the Phase 2 migration script in your Supabase SQL editor:

```bash
# Run this SQL file in Supabase Dashboard > SQL Editor
database/phase2_inbox_intelligence.sql
```

This will create:

- `emails` table with indexes
- `email_threads` table with indexes
- `email_labels` table
- `email_label_assignments` table
- Triggers for `updated_at` columns

### Step 2: Verify Environment Variables

Ensure your `.env` file has all required variables:

```env
# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption (for IMAP passwords)
ENCRYPTION_KEY=your-32-character-encryption-key

# Server
PORT=3000
NODE_ENV=production

# Optional: Debug bounce detection
DEBUG_BOUNCES=false
```

### Step 3: Install Dependencies (if any new)

```bash
npm install
```

### Step 4: Test the Migration

Start the server in development mode:

```bash
npm run dev
```

Expected output:

```
🚀 API running on port 3000
```

### Step 5: Test Email Sync

The enhanced processor will automatically start syncing emails.

**Initial Sync:**

- All existing emails in INBOX will be processed
- Classification will be applied
- Threads will be created
- Bounces will continue to be tracked

**Monitor logs:**

```bash
# Check worker logs
tail -f logs/worker.log

# Or if using PM2
pm2 logs email-worker
```

Expected log output:

```
📬 Processing mailbox: user@example.com
📨 Processing 10 new messages...
🏷️  Classified as: TRANSACTIONAL (Password reset req...)
🧵 Creating new thread for: Password reset
✅ Stored email: abc-123-uuid
✅ Updated thread abc-456-uuid: 1 messages
✅ Processed 10/10 messages (2 bounces)
```

## New API Endpoints

### Email Endpoints

#### 1. List Emails

```http
GET /api/v1/emails?category=HUMAN&limit=50&offset=0
Authorization: Bearer {access_token}

Response:
{
  "data": [
    {
      "id": "uuid",
      "subject": "Meeting tomorrow",
      "from_address": "john@example.com",
      "from_name": "John Doe",
      "category": "HUMAN",
      "is_read": false,
      "is_starred": false,
      "received_at": "2026-02-09T10:30:00Z",
      "body_preview": "Hi, just wanted to confirm...",
      "thread_id": "thread-uuid"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Query Parameters:**

- `category`: BOUNCE | TRANSACTIONAL | NOTIFICATION | MARKETING | HUMAN | NEWSLETTER
- `mailbox_id`: UUID
- `thread_id`: UUID
- `is_read`: boolean
- `is_starred`: boolean
- `is_archived`: boolean
- `search`: Search in subject and from_address
- `limit`: Number (default 50)
- `offset`: Number (default 0)

#### 2. Get Email Details

```http
GET /api/v1/emails/:id
Authorization: Bearer {access_token}
```

#### 3. Get Category Counts

```http
GET /api/v1/emails/categories
Authorization: Bearer {access_token}

Response:
{
  "total": {
    "HUMAN": 45,
    "TRANSACTIONAL": 120,
    "NOTIFICATION": 85,
    "MARKETING": 200,
    "BOUNCE": 5
  },
  "unread": {
    "HUMAN": 12,
    "TRANSACTIONAL": 8,
    "NOTIFICATION": 25
  }
}
```

#### 4. Mark as Read/Unread

```http
PUT /api/v1/emails/:id/read
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "is_read": true
}
```

#### 5. Star/Unstar Email

```http
PUT /api/v1/emails/:id/star
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "is_starred": true
}
```

#### 6. Archive Email

```http
PUT /api/v1/emails/:id/archive
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "is_archived": true
}
```

#### 7. Delete Email

```http
DELETE /api/v1/emails/:id
Authorization: Bearer {access_token}
```

### Thread Endpoints

#### 1. List Threads

```http
GET /api/v1/threads?limit=50&offset=0
Authorization: Bearer {access_token}

Response:
{
  "data": [
    {
      "id": "uuid",
      "subject": "Project Discussion",
      "normalized_subject": "project discussion",
      "participants": ["john@example.com", "jane@example.com"],
      "message_count": 5,
      "is_unread": true,
      "last_message_at": "2026-02-09T15:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Query Parameters:**

- `mailbox_id`: UUID
- `is_unread`: boolean
- `is_archived`: boolean
- `limit`: Number (default 50)
- `offset`: Number (default 0)

#### 2. Get Thread with Messages

```http
GET /api/v1/threads/:id
Authorization: Bearer {access_token}

Response:
{
  "id": "thread-uuid",
  "subject": "Project Discussion",
  "message_count": 5,
  "messages": [
    {
      "id": "email-1-uuid",
      "subject": "Project Discussion",
      "from_address": "john@example.com",
      "received_at": "2026-02-08T10:00:00Z",
      "body_preview": "Let's discuss the project..."
    },
    {
      "id": "email-2-uuid",
      "subject": "Re: Project Discussion",
      "from_address": "jane@example.com",
      "received_at": "2026-02-08T11:00:00Z",
      "body_preview": "Great idea! I think we should..."
    }
  ]
}
```

#### 3. Archive Thread

```http
PUT /api/v1/threads/:id/archive
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "is_archived": true
}
```

#### 4. Mark Thread as Read

```http
PUT /api/v1/threads/:id/read
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "is_read": true
}
```

#### 5. Delete Thread

```http
DELETE /api/v1/threads/:id
Authorization: Bearer {access_token}
```

#### 6. Get Thread Statistics

```http
GET /api/v1/threads/stats?mailbox_id=uuid
Authorization: Bearer {access_token}

Response:
{
  "total": 45,
  "unread": 12,
  "archived": 8,
  "active": 37
}
```

## Testing Phase 2

### 1. Test Email Classification

```bash
# Send test emails to your connected mailbox
# Check the classification in the API

curl -X GET "http://localhost:3000/api/v1/emails/categories" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Test Threading

Send a reply to an existing email and verify it groups correctly:

```bash
curl -X GET "http://localhost:3000/api/v1/threads/:thread_id" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test Email Management

```bash
# Mark as read
curl -X PUT "http://localhost:3000/api/v1/emails/:id/read" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_read": true}'

# Star email
curl -X PUT "http://localhost:3000/api/v1/emails/:id/star" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_starred": true}'
```

### 4. Verify Backward Compatibility

Check that bounces still work:

```bash
curl -X GET "http://localhost:3000/api/v1/bounces" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Classification Rules

### BOUNCE

- From: mailer-daemon@, postmaster@
- Subject: undelivered, failure, returned mail

### TRANSACTIONAL

- From: noreply@, notifications@, support@
- Subject: password reset, order confirmation, receipt
- No List-Unsubscribe header

### NOTIFICATION

- From: notifications@, alerts@, updates@
- Subject: activity on, you have new, reminder

### MARKETING

- Has List-Unsubscribe header
- Subject: sale, discount, limited time, special offer
- Many links in body (>5)

### NEWSLETTER

- Has List-Unsubscribe AND List-Post headers
- Subject: newsletter, weekly roundup, edition

### HUMAN

- Not from automated senders (noreply, notifications, etc.)
- Personal Reply-To address
- Single recipient
- No list headers

## Performance Optimization

### Database Indexes

All necessary indexes are created by the migration:

- `idx_emails_user_id` - Fast user queries
- `idx_emails_mailbox_received` - Mailbox inbox view
- `idx_emails_category` - Category filtering
- `idx_emails_thread` - Thread grouping
- `idx_emails_from` - Sender filtering
- `idx_emails_is_read` - Unread emails
- `idx_emails_user_category` - Combined user + category

### Pagination

- Default limit: 50 emails per request
- Maximum limit: 100 emails per request
- Use offset for pagination

### Caching Recommendations

Consider implementing caching for:

- Category counts (5-minute cache)
- Thread lists (2-minute cache)
- Email metadata (1-minute cache)

## Troubleshooting

### Issue: Emails not being classified correctly

**Solution:** Check the classification confidence:

```sql
SELECT category, category_confidence, subject, from_address
FROM emails
WHERE category = 'UNKNOWN'
LIMIT 10;
```

If many emails are UNKNOWN, review the classification patterns in `classifier.js`.

### Issue: Threads not grouping correctly

**Solution:** Check the thread matching:

```sql
SELECT id, subject, normalized_subject, message_count
FROM email_threads
WHERE message_count = 1
LIMIT 10;
```

If many threads have only 1 message, review the threading logic in `thread-builder.js`.

### Issue: Performance is slow

**Solution 1:** Verify indexes exist:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('emails', 'email_threads');
```

**Solution 2:** Add composite indexes if needed:

```sql
CREATE INDEX idx_emails_user_mailbox_received
ON emails(user_id, mailbox_id, received_at DESC);
```

### Issue: Worker not processing emails

**Solution:** Check worker logs:

```bash
# View last 100 lines
tail -n 100 logs/worker.log

# Check if cron is running
ps aux | grep node
```

Restart worker:

```bash
npm run worker
```

## Next Steps

### Phase 3 Features (Coming Soon)

- Analytics dashboard
- SLA tracking
- Email trends and insights
- Sender reputation
- Advanced search

### Frontend Integration

Update your Flutter app to use the new endpoints:

- Create inbox view with category tabs
- Implement email list with swipe actions
- Add thread view with conversation display
- Build search functionality

## Support

If you encounter issues:

1. Check the logs: `logs/worker.log` and `logs/api.log`
2. Verify database schema is correctly applied
3. Test API endpoints with curl
4. Check Supabase dashboard for errors

## Rollback Plan

If you need to rollback to Phase 1:

1. Stop the worker
2. Update `scheduler.js` to use `EmailProcessor` instead of `EnhancedEmailProcessor`
3. Comment out the new routes in `app.js`
4. Restart the server

The Phase 1 bounce detection will continue to work as before.
