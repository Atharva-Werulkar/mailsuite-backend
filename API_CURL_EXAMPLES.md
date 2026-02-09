# MailSuite API - cURL Examples

## 🔐 Authentication Endpoints

### Register New User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'
```

**Response:**

```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2026-02-04T10:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response:**

```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2026-02-04T10:00:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Refresh Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Get Current User

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2026-02-04T10:00:00Z"
  }
}
```

---

## 📬 Mailbox Endpoints

### Test IMAP Connection (Public - No Auth Required)

```bash
curl -X POST http://localhost:3000/api/v1/mailboxes/test \
  -H "Content-Type: application/json" \
  -d '{
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "your-email@gmail.com",
    "imap_password": "your-app-password"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Connection successful"
}
```

---

### Add New Mailbox

```bash
curl -X POST http://localhost:3000/api/v1/mailboxes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "email_address": "your-email@gmail.com",
    "provider": "gmail",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "your-email@gmail.com",
    "imap_password": "your-app-password"
  }'
```

**Response:**

```json
{
  "data": {
    "id": "mailbox-uuid",
    "user_id": "user-uuid",
    "provider": "gmail",
    "email_address": "your-email@gmail.com",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "status": "ACTIVE",
    "last_synced_at": null,
    "created_at": "2026-02-04T10:00:00Z"
  }
}
```

---

### List All Mailboxes

```bash
curl -X GET http://localhost:3000/api/v1/mailboxes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "data": [
    {
      "id": "mailbox-uuid",
      "user_id": "user-uuid",
      "provider": "gmail",
      "email_address": "your-email@gmail.com",
      "imap_host": "imap.gmail.com",
      "imap_port": 993,
      "status": "ACTIVE",
      "last_error": null,
      "last_synced_at": "2026-02-04T10:05:00Z",
      "created_at": "2026-02-04T10:00:00Z"
    }
  ]
}
```

---

### Update Mailbox

```bash
curl -X PUT http://localhost:3000/api/v1/mailboxes/MAILBOX_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "DISABLED"
  }'
```

---

### Delete Mailbox

```bash
curl -X DELETE http://localhost:3000/api/v1/mailboxes/MAILBOX_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:** `204 No Content`

---

## 📧 Bounce Endpoints

### List Bounces (with Pagination)

```bash
curl -X GET "http://localhost:3000/api/v1/bounces?limit=50&page=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**With Mailbox Filter:**

```bash
curl -X GET "http://localhost:3000/api/v1/bounces?limit=50&page=1&mailbox_id=MAILBOX_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "data": [
    {
      "id": "bounce-uuid",
      "user_id": "user-uuid",
      "mailbox_id": "mailbox-uuid",
      "email": "failed@example.com",
      "bounce_type": "HARD",
      "error_code": "550",
      "reason": "User not found",
      "failure_count": 3,
      "first_failed_at": "2026-02-01T10:00:00Z",
      "last_failed_at": "2026-02-04T10:00:00Z",
      "mailboxes": {
        "email_address": "your-email@gmail.com"
      }
    }
  ],
  "total": 125,
  "limit": 50,
  "offset": 0
}
```

---

### Get Unique Failed Emails Count

```bash
curl -X GET http://localhost:3000/api/v1/bounces/unique \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**With Mailbox Filter:**

```bash
curl -X GET "http://localhost:3000/api/v1/bounces/unique?mailbox_id=MAILBOX_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "total": 45,
  "hard": 30,
  "soft": 10,
  "unknown": 5
}
```

---

### Get Bounce Statistics

```bash
curl -X GET http://localhost:3000/api/v1/bounces/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "totalFailures": 125,
  "uniqueEmails": 45,
  "byType": {
    "hard": 30,
    "soft": 10,
    "unknown": 5
  },
  "recentCount": 15,
  "trend": {
    "last7Days": 15
  }
}
```

---

## 🔧 Complete Workflow Example

### 1. Register and Login

```bash
# Register
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }' | jq -r '.accessToken')

echo "Access Token: $ACCESS_TOKEN"
```

### 2. Add a Mailbox

```bash
curl -X POST http://localhost:3000/api/v1/mailboxes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "email_address": "your-email@gmail.com",
    "provider": "gmail",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_username": "your-email@gmail.com",
    "imap_password": "your-app-password"
  }'
```

### 3. Check Bounces

```bash
curl -X GET http://localhost:3000/api/v1/bounces \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 4. Get Statistics

```bash
curl -X GET http://localhost:3000/api/v1/bounces/stats \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 🛠️ Testing Tips

### Save Token to Environment Variable

```bash
# After login, save token
export ACCESS_TOKEN="your_token_here"

# Use in subsequent requests
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3000/api/v1/bounces
```

### Pretty Print JSON (with jq)

```bash
curl -X GET http://localhost:3000/api/v1/bounces \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
```

### Save Response to File

```bash
curl -X GET http://localhost:3000/api/v1/bounces \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o bounces.json
```

### Check Response Status Code

```bash
curl -I -X GET http://localhost:3000/api/v1/bounces \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 🚨 Common Errors

### 401 Unauthorized

```json
{
  "error": "Missing Authorization header"
}
```

**Fix:** Add `Authorization: Bearer YOUR_TOKEN` header

### 400 Bad Request

```json
{
  "error": "Email and password are required"
}
```

**Fix:** Check request body has all required fields

### 409 Conflict

```json
{
  "error": "User with this email already exists"
}
```

**Fix:** Use different email or login instead

---

## 📝 Notes

1. **Replace `YOUR_ACCESS_TOKEN`** with actual token from login/register response
2. **Replace `MAILBOX_ID`** with actual mailbox UUID
3. **For Gmail:** Use App Password, not your regular password
4. **Base URL:** Change `http://localhost:3000` to your production URL when deployed
