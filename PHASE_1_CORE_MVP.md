# Phase 1: Core MVP (Foundation)

## Overview
Build the foundational email bounce detection system with basic dashboard capabilities.

## Prerequisites
✅ Database schema already set up with:
- `mailboxes` table
- `email_bounces` table  
- `email_bounce_events` table
- `increment_failure()` function

## What You Need to Build

### 1. Backend Services

#### 1.1 Email Worker Service (`/services/email-worker/`)

**File: `services/email-worker/imap-client.js`**
```javascript
// IMAP connection and message fetching
// Requirements:
// - Connect to Gmail IMAP using credentials from mailboxes table
// - Fetch messages starting from last_synced_uid
// - Return array of message objects with: uid, messageId, subject, from, to, body, receivedDate
// - Handle connection errors gracefully
// - Support TLS/SSL connection on port 993

const ImapFlow = require('imapflow');

class ImapClient {
  constructor(config) {
    // config: { host, port, secure, username, password }
  }
  
  async connect() {
    // Establish IMAP connection
  }
  
  async fetchNewMessages(lastUid = 0) {
    // Fetch messages with UID > lastUid
    // Return: [{ uid, messageId, subject, from, to, body, receivedDate }]
  }
  
  async disconnect() {
    // Close connection
  }
}

module.exports = ImapClient;
```

**File: `services/email-worker/bounce-detector.js`**
```javascript
// Bounce message detection and parsing
// Requirements:
// - Detect if email is a bounce message (check subject, from address, headers)
// - Parse RFC 3464 format bounce messages
// - Extract: failed recipient email, SMTP error code, diagnostic message
// - Classify as HARD, SOFT, or UNKNOWN bounce
// - Return: { isBounce, email, bounceType, errorCode, diagnostic }

class BounceDetector {
  isBounceMessage(email) {
    // Check if email is a bounce
    // Indicators:
    // - From: mailer-daemon@, postmaster@, noreply@
    // - Subject contains: "Undelivered", "Failure", "returned mail"
    // - Content-Type: multipart/report; report-type=delivery-status
  }
  
  parseBounce(email) {
    // Parse bounce and extract details
    // Return: {
    //   failedRecipient: 'user@example.com',
    //   errorCode: '550',
    //   diagnostic: 'User not found',
    //   bounceType: 'HARD' | 'SOFT' | 'UNKNOWN'
    // }
    
    // HARD bounce codes: 5xx (550, 551, 553, 554)
    // SOFT bounce codes: 4xx (450, 451, 452)
  }
}

module.exports = BounceDetector;
```

**File: `services/email-worker/processor.js`**
```javascript
// Main email processing logic
// Requirements:
// - Fetch mailbox config from database
// - Connect to IMAP
// - Fetch new messages since last_synced_uid
// - For each message:
//   - Check if bounce
//   - If bounce, parse and store in email_bounces
//   - Create email_bounce_events entry
//   - Update or increment existing bounce record
// - Update mailbox.last_synced_uid
// - Handle errors and update mailbox.status/last_error

const { createClient } = require('@supabase/supabase-js');
const ImapClient = require('./imap-client');
const BounceDetector = require('./bounce-detector');

class EmailProcessor {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
    this.bounceDetector = new BounceDetector();
  }
  
  async processMailbox(mailboxId) {
    // 1. Fetch mailbox config
    // 2. Decrypt IMAP credentials
    // 3. Connect to IMAP
    // 4. Fetch messages since last_synced_uid
    // 5. Process each message
    // 6. Update last_synced_uid
  }
  
  async processBounce(mailboxId, userId, message, bounceData) {
    // 1. Check if email_bounces record exists
    // 2. If exists: call increment_failure() and update last_failed_at
    // 3. If new: insert into email_bounces
    // 4. Insert into email_bounce_events
    // 5. Return bounce_id
  }
}

module.exports = EmailProcessor;
```

**File: `services/email-worker/scheduler.js`**
```javascript
// Cron job to run email processing periodically
// Requirements:
// - Run every 5 minutes
// - Fetch all ACTIVE mailboxes
// - Process each mailbox
// - Log errors

const cron = require('node-cron');
const EmailProcessor = require('./processor');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Starting email sync...');
  const processor = new EmailProcessor(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  
  // Fetch all active mailboxes and process
  // Handle errors per mailbox
});
```

#### 1.2 API Service (`/services/api/`)

**File: `services/api/server.js`**
```javascript
// Main API server using Fastify
// Requirements:
// - CORS enabled
// - Authentication middleware (Supabase JWT)
// - Rate limiting
// - Request logging
// - Error handling

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');

fastify.register(cors);
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Routes
fastify.register(require('./routes/bounces'));
fastify.register(require('./routes/mailboxes'));

const start = async () => {
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
};

start();
```

**File: `services/api/routes/bounces.js`**
```javascript
// Bounce-related API endpoints
// Requirements:
// - GET /bounces - List all bounces for user's mailboxes
// - GET /bounces/unique - Count unique failed emails
// - GET /bounces/stats - Bounce statistics
// - All endpoints require authentication

async function routes(fastify, options) {
  
  // GET /bounces?mailbox_id=xxx&limit=50&offset=0
  fastify.get('/bounces', async (request, reply) => {
    // 1. Verify user authentication
    // 2. Query email_bounces where user_id = current_user
    // 3. Optional filter by mailbox_id
    // 4. Order by last_failed_at DESC
    // 5. Return: { data: [], total: 0 }
  });
  
  // GET /bounces/unique?mailbox_id=xxx
  fastify.get('/bounces/unique', async (request, reply) => {
    // 1. Verify user authentication
    // 2. Count distinct emails from email_bounces
    // 3. Group by bounce_type
    // 4. Return: { total: 0, hard: 0, soft: 0, unknown: 0 }
  });
  
  // GET /bounces/stats
  fastify.get('/bounces/stats', async (request, reply) => {
    // 1. Verify user authentication
    // 2. Aggregate stats:
    //    - Total failures
    //    - Unique failed emails
    //    - Bounces by type
    //    - Recent trend (last 7 days)
    // 3. Return stats object
  });
  
}

module.exports = routes;
```

**File: `services/api/routes/mailboxes.js`**
```javascript
// Mailbox management endpoints
// Requirements:
// - POST /mailboxes - Add new mailbox
// - GET /mailboxes - List user's mailboxes
// - PUT /mailboxes/:id - Update mailbox
// - DELETE /mailboxes/:id - Delete mailbox

async function routes(fastify, options) {
  
  // POST /mailboxes
  fastify.post('/mailboxes', async (request, reply) => {
    // Body: { email_address, imap_host, imap_port, imap_username, imap_password }
    // 1. Verify user authentication
    // 2. Encrypt IMAP password
    // 3. Test IMAP connection
    // 4. Insert into mailboxes table
    // 5. Return created mailbox
  });
  
  // GET /mailboxes
  fastify.get('/mailboxes', async (request, reply) => {
    // 1. Verify user authentication
    // 2. Fetch mailboxes for current user
    // 3. Don't return encrypted password
    // 4. Return mailboxes array
  });
  
  // PUT /mailboxes/:id
  fastify.put('/mailboxes/:id', async (request, reply) => {
    // Update mailbox settings
  });
  
  // DELETE /mailboxes/:id
  fastify.delete('/mailboxes/:id', async (request, reply) => {
    // Soft delete or hard delete mailbox
  });
  
}

module.exports = routes;
```

### 2. Frontend (Flutter App)

#### 2.1 API Client (`lib/api/`)

**File: `lib/api/api_client.dart`**
```dart
// HTTP client for API communication
// Requirements:
// - Base URL configuration
// - JWT token handling
// - Request/response interceptors
// - Error handling

import 'package:dio/dio.dart';

class ApiClient {
  final Dio _dio;
  
  ApiClient(String baseUrl) : _dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: Duration(seconds: 30),
    receiveTimeout: Duration(seconds: 30),
  )) {
    _dio.interceptors.add(AuthInterceptor());
    _dio.interceptors.add(LogInterceptor());
  }
  
  Future<Response> get(String path, {Map<String, dynamic>? params}) async {
    // GET request
  }
  
  Future<Response> post(String path, {dynamic data}) async {
    // POST request
  }
}
```

**File: `lib/api/bounce_service.dart`**
```dart
// Bounce data service
// Requirements:
// - fetchBounces(mailboxId, limit, offset)
// - getUniqueCount(mailboxId)
// - getStats()

class BounceService {
  final ApiClient _client;
  
  BounceService(this._client);
  
  Future<BounceListResponse> fetchBounces({
    String? mailboxId,
    int limit = 50,
    int offset = 0,
  }) async {
    // Call GET /bounces
  }
  
  Future<UniqueCountResponse> getUniqueCount({String? mailboxId}) async {
    // Call GET /bounces/unique
  }
  
  Future<BounceStatsResponse> getStats() async {
    // Call GET /bounces/stats
  }
}
```

#### 2.2 State Management (`lib/state/`)

**File: `lib/state/bounce_provider.dart`**
```dart
// Bounce state management using Riverpod or Bloc
// Requirements:
// - Hold bounce list
// - Loading/error states
// - Pagination support
// - Pull-to-refresh

import 'package:flutter_riverpod/flutter_riverpod.dart';

class BounceState {
  final List<Bounce> bounces;
  final bool isLoading;
  final String? error;
  final int total;
  
  BounceState({
    required this.bounces,
    this.isLoading = false,
    this.error,
    this.total = 0,
  });
}

class BounceNotifier extends StateNotifier<BounceState> {
  final BounceService _service;
  
  BounceNotifier(this._service) : super(BounceState(bounces: []));
  
  Future<void> loadBounces({int offset = 0}) async {
    // Load bounces with pagination
  }
  
  Future<void> refresh() async {
    // Refresh from beginning
  }
}

final bounceProvider = StateNotifierProvider<BounceNotifier, BounceState>((ref) {
  // Provider setup
});
```

#### 2.3 UI Screens (`lib/screens/`)

**File: `lib/screens/dashboard_screen.dart`**
```dart
// Main dashboard screen
// Requirements:
// - Show total failures count
// - Show unique failed emails count
// - Show bounce breakdown (hard/soft/unknown)
// - Recent bounces list (last 10)
// - Navigate to full bounce list

import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('MailSuite Dashboard')),
      body: Column(
        children: [
          // Stats cards
          StatsCard(title: 'Total Failures', value: '1,234'),
          StatsCard(title: 'Unique Failed Emails', value: '456'),
          
          // Bounce type breakdown
          BounceBreakdownChart(),
          
          // Recent bounces list
          RecentBouncesList(),
        ],
      ),
    );
  }
}
```

**File: `lib/screens/bounce_list_screen.dart`**
```dart
// Full bounce list screen
// Requirements:
// - Searchable/filterable list
// - Pagination
// - Pull-to-refresh
// - Show: email, bounce_type, error_code, failure_count, last_failed_at

class BounceListScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Email Bounces')),
      body: RefreshIndicator(
        onRefresh: () async {
          // Refresh bounces
        },
        child: ListView.builder(
          itemCount: bounces.length,
          itemBuilder: (context, index) {
            return BounceListTile(bounce: bounces[index]);
          },
        ),
      ),
    );
  }
}
```

**File: `lib/screens/mailbox_setup_screen.dart`**
```dart
// Mailbox setup/configuration screen
// Requirements:
// - Form to add Gmail IMAP credentials
// - Test connection button
// - Save mailbox
// - Show validation errors

class MailboxSetupScreen extends StatefulWidget {
  @override
  _MailboxSetupScreenState createState() => _MailboxSetupScreenState();
}

class _MailboxSetupScreenState extends State<MailboxSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Form fields
  String _email = '';
  String _imapHost = 'imap.gmail.com';
  int _imapPort = 993;
  String _username = '';
  String _password = '';
  
  Future<void> _testConnection() async {
    // Test IMAP connection
  }
  
  Future<void> _saveMailbox() async {
    // Save mailbox via API
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Setup Mailbox')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            TextFormField(
              decoration: InputDecoration(labelText: 'Email Address'),
              validator: (value) => value?.isEmpty ?? true ? 'Required' : null,
              onSaved: (value) => _email = value!,
            ),
            // ... other fields
            
            ElevatedButton(
              onPressed: _testConnection,
              child: Text('Test Connection'),
            ),
            
            ElevatedButton(
              onPressed: _saveMailbox,
              child: Text('Save Mailbox'),
            ),
          ],
        ),
      ),
    );
  }
}
```

### 3. Data Models (`lib/models/`)

**File: `lib/models/bounce.dart`**
```dart
class Bounce {
  final String id;
  final String userId;
  final String mailboxId;
  final String email;
  final String bounceType; // HARD, SOFT, UNKNOWN
  final String errorCode;
  final String? reason;
  final int failureCount;
  final DateTime firstFailedAt;
  final DateTime lastFailedAt;
  
  Bounce({
    required this.id,
    required this.userId,
    required this.mailboxId,
    required this.email,
    required this.bounceType,
    required this.errorCode,
    this.reason,
    required this.failureCount,
    required this.firstFailedAt,
    required this.lastFailedAt,
  });
  
  factory Bounce.fromJson(Map<String, dynamic> json) {
    // Parse from API response
  }
}
```

**File: `lib/models/mailbox.dart`**
```dart
class Mailbox {
  final String id;
  final String userId;
  final String provider;
  final String emailAddress;
  final String imapHost;
  final int imapPort;
  final String status; // ACTIVE, ERROR, DISABLED
  final String? lastError;
  final int lastSyncedUid;
  final DateTime createdAt;
  
  Mailbox({
    required this.id,
    required this.userId,
    required this.provider,
    required this.emailAddress,
    required this.imapHost,
    required this.imapPort,
    required this.status,
    this.lastError,
    required this.lastSyncedUid,
    required this.createdAt,
  });
  
  factory Mailbox.fromJson(Map<String, dynamic> json) {
    // Parse from API response
  }
}
```

## Environment Variables

**File: `.env`**
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# API
API_PORT=3000
API_HOST=0.0.0.0
JWT_SECRET=your-jwt-secret

# Email Worker
WORKER_INTERVAL=300000  # 5 minutes in ms

# Encryption (for IMAP passwords)
ENCRYPTION_KEY=your-32-char-encryption-key
```

## Testing Checklist

- [ ] Can add Gmail mailbox via UI
- [ ] IMAP connection test works
- [ ] Email worker fetches messages successfully
- [ ] Bounce messages are detected correctly
- [ ] Failed emails are stored in email_bounces
- [ ] Duplicate bounces increment failure_count
- [ ] Dashboard shows correct stats
- [ ] Bounce list displays and paginates
- [ ] API authentication works
- [ ] Error handling works for IMAP failures

## Deployment Steps

1. Deploy database schema (already done)
2. Deploy API service (Node.js)
3. Deploy email worker service
4. Set up cron job for worker
5. Build and deploy Flutter app
6. Configure environment variables
7. Test end-to-end flow

## Success Criteria

✅ User can add Gmail account
✅ System automatically detects bounce emails
✅ Dashboard shows bounce statistics
✅ Unique failed emails are tracked
✅ System runs reliably every 5 minutes
✅ No duplicate bounce records

## Next: Phase 2
Once Phase 1 is complete and stable, proceed to Phase 2 for full inbox intelligence.
