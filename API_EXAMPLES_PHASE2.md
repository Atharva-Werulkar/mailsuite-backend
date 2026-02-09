# API Examples - Phase 2

Quick reference for testing Phase 2 endpoints.

## Authentication

All endpoints require Bearer token authentication except public routes.

```bash
# Get access token first
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'

# Response
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}

# Use accessToken in subsequent requests
export TOKEN="eyJhbGc..."
```

## Email Endpoints

### List All Emails

```bash
curl -X GET "http://localhost:3000/api/v1/emails?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### List Emails by Category

```bash
# Human emails only
curl -X GET "http://localhost:3000/api/v1/emails?category=HUMAN" \
  -H "Authorization: Bearer $TOKEN"

# Unread notifications
curl -X GET "http://localhost:3000/api/v1/emails?category=NOTIFICATION&is_read=false" \
  -H "Authorization: Bearer $TOKEN"

# Starred emails
curl -X GET "http://localhost:3000/api/v1/emails?is_starred=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Emails

```bash
curl -X GET "http://localhost:3000/api/v1/emails?search=invoice" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Single Email

```bash
curl -X GET "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Category Counts

```bash
curl -X GET "http://localhost:3000/api/v1/emails/categories" \
  -H "Authorization: Bearer $TOKEN"

# Response
{
  "total": {
    "HUMAN": 45,
    "TRANSACTIONAL": 120,
    "NOTIFICATION": 85,
    "MARKETING": 200,
    "NEWSLETTERS": 50,
    "BOUNCE": 5,
    "UNKNOWN": 10
  },
  "unread": {
    "HUMAN": 12,
    "TRANSACTIONAL": 8,
    "NOTIFICATION": 25,
    "MARKETING": 50
  }
}
```

### Mark Email as Read

```bash
curl -X PUT "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_read": true}'
```

### Mark Email as Unread

```bash
curl -X PUT "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_read": false}'
```

### Star Email

```bash
curl -X PUT "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000/star" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_starred": true}'
```

### Unstar Email

```bash
curl -X PUT "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000/star" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_starred": false}'
```

### Archive Email

```bash
curl -X PUT "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000/archive" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_archived": true}'
```

### Delete Email

```bash
curl -X DELETE "http://localhost:3000/api/v1/emails/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

## Thread Endpoints

### List All Threads

```bash
curl -X GET "http://localhost:3000/api/v1/threads?limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### List Unread Threads

```bash
curl -X GET "http://localhost:3000/api/v1/threads?is_unread=true" \
  -H "Authorization: Bearer $TOKEN"
```

### List Archived Threads

```bash
curl -X GET "http://localhost:3000/api/v1/threads?is_archived=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Thread with All Messages

```bash
curl -X GET "http://localhost:3000/api/v1/threads/660e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"

# Response
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "subject": "Project Discussion",
  "normalized_subject": "project discussion",
  "participants": ["john@example.com", "jane@example.com"],
  "message_count": 5,
  "is_unread": true,
  "first_message_at": "2026-02-08T10:00:00Z",
  "last_message_at": "2026-02-09T15:30:00Z",
  "messages": [
    {
      "id": "email-1-uuid",
      "subject": "Project Discussion",
      "from_address": "john@example.com",
      "from_name": "John Doe",
      "received_at": "2026-02-08T10:00:00Z",
      "body_preview": "Let's discuss the project timeline...",
      "is_read": true
    },
    {
      "id": "email-2-uuid",
      "subject": "Re: Project Discussion",
      "from_address": "jane@example.com",
      "from_name": "Jane Smith",
      "received_at": "2026-02-08T11:00:00Z",
      "body_preview": "Great idea! I think we should...",
      "is_read": false
    }
  ]
}
```

### Mark Thread as Read

```bash
curl -X PUT "http://localhost:3000/api/v1/threads/660e8400-e29b-41d4-a716-446655440000/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_read": true}'
```

### Archive Thread

```bash
curl -X PUT "http://localhost:3000/api/v1/threads/660e8400-e29b-41d4-a716-446655440000/archive" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_archived": true}'
```

### Delete Thread (and all messages)

```bash
curl -X DELETE "http://localhost:3000/api/v1/threads/660e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Thread Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/threads/stats" \
  -H "Authorization: Bearer $TOKEN"

# Response
{
  "total": 45,
  "unread": 12,
  "archived": 8,
  "active": 37
}
```

## Mailbox Endpoints (Phase 1 - Still Available)

### List Mailboxes

```bash
curl -X GET "http://localhost:3000/api/v1/mailboxes" \
  -H "Authorization: Bearer $TOKEN"
```

### Add Mailbox

```bash
curl -X POST "http://localhost:3000/api/v1/mailboxes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GMAIL",
    "email_address": "user@gmail.com",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "user@gmail.com",
    "imap_password": "app-password"
  }'
```

### Test Mailbox Connection

```bash
curl -X POST "http://localhost:3000/api/v1/mailboxes/test" \
  -H "Content-Type: application/json" \
  -d '{
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "user@gmail.com",
    "imap_password": "app-password"
  }'
```

### Delete Mailbox

```bash
curl -X DELETE "http://localhost:3000/api/v1/mailboxes/770e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

## Bounce Endpoints (Phase 1 - Still Available)

### List Bounces

```bash
curl -X GET "http://localhost:3000/api/v1/bounces" \
  -H "Authorization: Bearer $TOKEN"
```

### List Bounces by Mailbox

```bash
curl -X GET "http://localhost:3000/api/v1/bounces?mailbox_id=770e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Single Bounce

```bash
curl -X GET "http://localhost:3000/api/v1/bounces/880e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Bounce Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/bounces/stats" \
  -H "Authorization: Bearer $TOKEN"

# Response
{
  "total": 145,
  "hard": 98,
  "soft": 42,
  "unknown": 5,
  "critical": 12
}
```

### Dismiss Bounce

```bash
curl -X POST "http://localhost:3000/api/v1/bounces/880e8400-e29b-41d4-a716-446655440000/dismiss" \
  -H "Authorization: Bearer $TOKEN"
```

## Advanced Queries

### Get Unread Human Emails from Specific Mailbox

```bash
curl -X GET "http://localhost:3000/api/v1/emails?category=HUMAN&is_read=false&mailbox_id=770e8400-e29b-41d4-a716-446655440000&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Get All Marketing Emails Ordered by Date

```bash
curl -X GET "http://localhost:3000/api/v1/emails?category=MARKETING&limit=100&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Across All Emails

```bash
curl -X GET "http://localhost:3000/api/v1/emails?search=invoice%20payment" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Emails in a Specific Thread

```bash
curl -X GET "http://localhost:3000/api/v1/emails?thread_id=660e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

## Testing Workflow

### 1. Initial Setup

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

export TOKEN="your-access-token"

# Check mailboxes
curl -X GET http://localhost:3000/api/v1/mailboxes \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Monitor Email Sync

```bash
# Wait for worker to sync (runs every 5 minutes)
# Or manually trigger in code

# Check email counts
curl -X GET http://localhost:3000/api/v1/emails/categories \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Browse Emails

```bash
# Get first page of emails
curl -X GET "http://localhost:3000/api/v1/emails?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Get details of first email
curl -X GET "http://localhost:3000/api/v1/emails/EMAIL_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Manage Emails

```bash
# Mark as read
curl -X PUT "http://localhost:3000/api/v1/emails/EMAIL_ID/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_read": true}'

# Star important email
curl -X PUT "http://localhost:3000/api/v1/emails/EMAIL_ID/star" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_starred": true}'
```

### 5. Explore Threads

```bash
# List all threads
curl -X GET "http://localhost:3000/api/v1/threads" \
  -H "Authorization: Bearer $TOKEN"

# View conversation
curl -X GET "http://localhost:3000/api/v1/threads/THREAD_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "is_read must be a boolean"
}
```

### 401 Unauthorized

```json
{
  "error": "Invalid or expired token"
}
```

### 404 Not Found

```json
{
  "error": "Email not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

## Rate Limiting

Current rate limit: **100 requests per minute** per IP address

If exceeded:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```
