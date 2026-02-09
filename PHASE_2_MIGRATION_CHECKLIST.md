# Phase 2 Migration Checklist

Use this checklist to ensure a smooth Phase 2 deployment.

## Pre-Deployment

- [ ] **Backup Database**

  ```bash
  # Take a Supabase backup before migration
  # Go to Supabase Dashboard > Settings > Database > Backups
  ```

- [ ] **Review Current System**
  - [ ] Phase 1 is working correctly
  - [ ] Bounces are being detected
  - [ ] No pending issues

- [ ] **Environment Check**
  - [ ] All environment variables are set
  - [ ] Database connection is working
  - [ ] Worker is running

## Database Migration

- [ ] **Execute Migration Script**

  ```sql
  -- Run database/phase2_inbox_intelligence.sql
  -- In Supabase Dashboard > SQL Editor
  ```

- [ ] **Verify Tables Created**

  ```sql
  -- Check tables exist
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('emails', 'email_threads', 'email_labels', 'email_label_assignments');
  ```

- [ ] **Verify Indexes Created**

  ```sql
  -- Check indexes
  SELECT indexname FROM pg_indexes
  WHERE tablename IN ('emails', 'email_threads');
  ```

- [ ] **Test Triggers**

  ```sql
  -- Test updated_at trigger
  INSERT INTO emails (user_id, mailbox_id, uid, message_id, from_address, subject, received_at)
  VALUES
    ((SELECT id FROM users LIMIT 1),
     (SELECT id FROM mailboxes LIMIT 1),
     999999,
     'test@example.com',
     'test@example.com',
     'Test',
     NOW());

  SELECT updated_at FROM emails WHERE uid = 999999;

  -- Cleanup
  DELETE FROM emails WHERE uid = 999999;
  ```

## Code Deployment

- [ ] **Pull Latest Code**

  ```bash
  git pull origin main
  ```

- [ ] **Install Dependencies**

  ```bash
  npm install
  ```

- [ ] **Verify New Files Exist**
  - [ ] `services/email-worker/classifier.js`
  - [ ] `services/email-worker/thread-builder.js`
  - [ ] `services/email-worker/enhanced-processor.js`
  - [ ] `routes/emails.js`
  - [ ] `routes/threads.js`

- [ ] **Check app.js Updated**
  - [ ] Email routes imported
  - [ ] Thread routes imported
  - [ ] Routes registered

- [ ] **Check scheduler.js Updated**
  - [ ] Uses `EnhancedEmailProcessor`
  - [ ] Import path correct

## Testing

### 1. API Server

- [ ] **Start Server**

  ```bash
  npm run dev
  ```

- [ ] **Check Health**

  ```bash
  curl http://localhost:3000/health
  ```

- [ ] **Test Auth**
  ```bash
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "password"}'
  ```

### 2. New Endpoints

- [ ] **Test Email Endpoints**

  ```bash
  # Export token first
  export TOKEN="your-token"

  # List emails
  curl -X GET http://localhost:3000/api/v1/emails \
    -H "Authorization: Bearer $TOKEN"

  # Category counts
  curl -X GET http://localhost:3000/api/v1/emails/categories \
    -H "Authorization: Bearer $TOKEN"
  ```

- [ ] **Test Thread Endpoints**
  ```bash
  # List threads
  curl -X GET http://localhost:3000/api/v1/threads \
    -H "Authorization: Bearer $TOKEN"

  # Thread stats
  curl -X GET http://localhost:3000/api/v1/threads/stats \
    -H "Authorization: Bearer $TOKEN"
  ```

### 3. Email Worker

- [ ] **Start Worker**

  ```bash
  npm run worker
  ```

- [ ] **Monitor Logs**

  ```bash
  tail -f logs/worker.log
  ```

- [ ] **Verify Processing**
  - [ ] Worker connects to mailboxes
  - [ ] Emails are being classified
  - [ ] Threads are being created
  - [ ] No errors in logs

### 4. Data Verification

- [ ] **Check Emails Table**

  ```sql
  SELECT COUNT(*) FROM emails;
  SELECT category, COUNT(*) FROM emails GROUP BY category;
  ```

- [ ] **Check Threads Table**

  ```sql
  SELECT COUNT(*) FROM email_threads;
  SELECT message_count, COUNT(*) FROM email_threads GROUP BY message_count;
  ```

- [ ] **Check Classification Distribution**

  ```sql
  SELECT
    category,
    COUNT(*) as count,
    ROUND(AVG(category_confidence), 2) as avg_confidence
  FROM emails
  GROUP BY category
  ORDER BY count DESC;
  ```

- [ ] **Check Threading Accuracy**

  ```sql
  -- Threads with multiple messages (good sign)
  SELECT COUNT(*) FROM email_threads WHERE message_count > 1;

  -- Single message threads (might need tuning)
  SELECT COUNT(*) FROM email_threads WHERE message_count = 1;
  ```

## Backward Compatibility

- [ ] **Verify Phase 1 Still Works**
  - [ ] Bounces are still detected
  - [ ] Bounce API endpoints work
  - [ ] Mailbox management works

- [ ] **Test Bounce Endpoints**
  ```bash
  curl -X GET http://localhost:3000/api/v1/bounces \
    -H "Authorization: Bearer $TOKEN"

  curl -X GET http://localhost:3000/api/v1/bounces/stats \
    -H "Authorization: Bearer $TOKEN"
  ```

## Performance Check

- [ ] **Query Performance**

  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM emails
  WHERE user_id = 'YOUR_USER_ID'
  AND category = 'HUMAN'
  ORDER BY received_at DESC
  LIMIT 50;
  ```

- [ ] **Index Usage**

  ```sql
  -- Check if indexes are being used
  SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as rows_read,
    idx_tup_fetch as rows_fetched
  FROM pg_stat_user_indexes
  WHERE tablename IN ('emails', 'email_threads')
  ORDER BY idx_scan DESC;
  ```

- [ ] **API Response Times**
  - [ ] `/api/v1/emails` < 500ms
  - [ ] `/api/v1/threads` < 500ms
  - [ ] `/api/v1/emails/categories` < 200ms

## Production Deployment

- [ ] **Stop Workers**

  ```bash
  pm2 stop email-worker
  ```

- [ ] **Pull Latest Code**

  ```bash
  git pull origin main
  ```

- [ ] **Run Migration**

  ```bash
  # Execute database/phase2_inbox_intelligence.sql in Supabase
  ```

- [ ] **Deploy API Server**

  ```bash
  npm install
  pm2 restart mailsuite-api
  ```

- [ ] **Deploy Worker**

  ```bash
  pm2 restart email-worker
  ```

- [ ] **Monitor Logs**
  ```bash
  pm2 logs
  ```

## Post-Deployment Monitoring

### First Hour

- [ ] Check for errors in logs
- [ ] Monitor API response times
- [ ] Verify emails are being processed
- [ ] Check database growth rate

### First Day

- [ ] Review classification accuracy
- [ ] Check thread grouping quality
- [ ] Monitor system resources
- [ ] Verify no data loss

### First Week

- [ ] Analyze user feedback
- [ ] Review error rates
- [ ] Check performance metrics
- [ ] Optimize if needed

## Troubleshooting Guide

### Emails Not Being Classified

**Check:**

1. Classifier is imported correctly
2. Email headers are being parsed
3. Classification logic matches your needs

**Fix:**

```javascript
// Add debug logging in enhanced-processor.js
console.log("Raw headers:", message.headers);
console.log("Classification:", classification);
```

### Threads Not Grouping

**Check:**

1. In-Reply-To header exists
2. Subject normalization working
3. Thread matching logic

**Fix:**

```sql
-- Check messages without threads
SELECT * FROM emails WHERE thread_id IS NULL LIMIT 10;

-- Check thread statistics
SELECT message_count, COUNT(*)
FROM email_threads
GROUP BY message_count
ORDER BY message_count DESC;
```

### Performance Issues

**Check:**

1. Indexes are created
2. Query plans are optimal
3. Database connections not exhausted

**Fix:**

```sql
-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_emails_custom
ON emails(user_id, mailbox_id, received_at DESC);

-- Analyze queries
EXPLAIN ANALYZE SELECT ...;
```

### Worker Errors

**Check:**

1. Environment variables set
2. Database connection working
3. IMAP credentials valid

**Fix:**

```bash
# Test IMAP connection
curl -X POST http://localhost:3000/api/v1/mailboxes/test \
  -H "Content-Type: application/json" \
  -d '{...}'

# Restart worker
pm2 restart email-worker
```

## Rollback Plan

If critical issues occur:

1. **Stop Workers**

   ```bash
   pm2 stop email-worker
   ```

2. **Revert Code Changes**

   ```bash
   git revert HEAD
   npm install
   ```

3. **Update Scheduler**

   ```javascript
   // In scheduler.js, change back to:
   import { EmailProcessor } from "./processor.js";
   const processor = new EmailProcessor(supabaseUrl, supabaseKey);
   ```

4. **Restart Services**

   ```bash
   pm2 restart mailsuite-api
   pm2 restart email-worker
   ```

5. **Verify Phase 1 Works**
   - Test bounce detection
   - Check API endpoints
   - Monitor logs

**Note:** Database tables remain, but are not used. They can be dropped later if needed.

## Success Criteria

✅ All new tables created  
✅ Indexes performing well  
✅ Email classification working (>80% accuracy)  
✅ Thread grouping functional  
✅ API endpoints responding correctly  
✅ Worker processing emails without errors  
✅ Phase 1 bounce detection still functional  
✅ No performance degradation  
✅ No data loss

## Next Steps After Phase 2

1. **Monitor for 1 week**
2. **Gather user feedback**
3. **Optimize classification rules**
4. **Fine-tune threading logic**
5. **Plan Phase 3 features**

---

**Questions or Issues?**

Check these resources:

- `PHASE_2_IMPLEMENTATION_GUIDE.md`
- `API_EXAMPLES_PHASE2.md`
- Worker logs: `logs/worker.log`
- API logs: `logs/api.log`
