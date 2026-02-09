# Phase 2: Inbox Intelligence

## Overview
Expand beyond bounce detection to full inbox management with email classification, threading, and intelligent inbox exploration.

## Prerequisites
✅ Phase 1 completed and stable
✅ Bounce detection working reliably
✅ Basic dashboard operational

## Database Schema Additions

**File: `migrations/phase2_inbox_intelligence.sql`**
```sql
-- Full email metadata storage
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  
  -- IMAP identifiers
  uid bigint not null,
  message_id text not null,
  
  -- Email metadata
  subject text,
  from_address text not null,
  from_name text,
  to_addresses text[], -- Array of recipients
  cc_addresses text[],
  bcc_addresses text[],
  
  -- Classification
  category text not null default 'UNKNOWN', 
  -- Categories: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER
  
  -- Threading
  thread_id uuid null references email_threads(id) on delete set null,
  in_reply_to text, -- Message-ID of parent
  references text[], -- Array of referenced message IDs
  
  -- Content flags
  has_attachments boolean default false,
  is_read boolean default false,
  is_starred boolean default false,
  
  -- Timestamps
  received_at timestamptz not null,
  sent_at timestamptz,
  
  -- Metadata
  size_bytes bigint,
  headers jsonb, -- Store important headers as JSON
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  
  unique (mailbox_id, uid),
  unique (mailbox_id, message_id)
);

-- Indexes for performance
create index idx_emails_mailbox_received on emails(mailbox_id, received_at desc);
create index idx_emails_category on emails(category);
create index idx_emails_thread on emails(thread_id);
create index idx_emails_from on emails(from_address);

-- Email threads/conversations
create table if not exists email_threads (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  
  subject text not null,
  participants text[], -- Array of email addresses
  
  message_count int default 1,
  
  first_message_at timestamptz not null,
  last_message_at timestamptz not null,
  
  -- Thread state
  is_unread boolean default true,
  is_archived boolean default false,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index idx_threads_mailbox on email_threads(mailbox_id, last_message_at desc);

-- Email labels/tags (for future filtering)
create table if not exists email_labels (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  
  name text not null,
  color text default '#6366f1',
  
  created_at timestamptz default timezone('utc', now()),
  
  unique (mailbox_id, name)
);

-- Many-to-many: emails <-> labels
create table if not exists email_label_assignments (
  email_id uuid not null references emails(id) on delete cascade,
  label_id uuid not null references email_labels(id) on delete cascade,
  
  assigned_at timestamptz default timezone('utc', now()),
  
  primary key (email_id, label_id)
);
```

## What You Need to Build

### 1. Backend Services

#### 1.1 Enhanced Email Processor

**File: `services/email-worker/classifier.js`**
```javascript
// Email classification engine
// Requirements:
// - Classify emails into categories
// - Rule-based classification logic
// - Return category + confidence score

class EmailClassifier {
  
  classify(email) {
    // Input: { subject, from, to, body, headers }
    // Output: { category: 'BOUNCE' | 'TRANSACTIONAL' | ..., confidence: 0.95 }
    
    // Classification rules:
    
    // 1. BOUNCE
    if (this.isBounce(email)) {
      return { category: 'BOUNCE', confidence: 1.0 };
    }
    
    // 2. TRANSACTIONAL
    // - From: noreply@, no-reply@, notifications@
    // - Subject: password reset, order confirmation, receipt, invoice
    // - Headers: List-Unsubscribe absent
    if (this.isTransactional(email)) {
      return { category: 'TRANSACTIONAL', confidence: 0.9 };
    }
    
    // 3. NOTIFICATION
    // - From: notifications@, alerts@, updates@
    // - Subject: activity on, you have a new, reminder
    if (this.isNotification(email)) {
      return { category: 'NOTIFICATION', confidence: 0.85 };
    }
    
    // 4. MARKETING
    // - Headers: List-Unsubscribe present
    // - Many links in body
    // - Subject: sale, offer, deal, discount, limited time
    if (this.isMarketing(email)) {
      return { category: 'MARKETING', confidence: 0.8 };
    }
    
    // 5. NEWSLETTER
    // - Headers: List-Unsubscribe + List-Post
    // - Regular sender
    if (this.isNewsletter(email)) {
      return { category: 'NEWSLETTER', confidence: 0.75 };
    }
    
    // 6. HUMAN (default for person-to-person)
    // - From domain not in common provider list
    // - Reply-To is personal address
    return { category: 'HUMAN', confidence: 0.6 };
  }
  
  isBounce(email) {
    // Check bounce indicators
    const from = email.from.toLowerCase();
    const subject = email.subject.toLowerCase();
    
    return (
      from.includes('mailer-daemon') ||
      from.includes('postmaster') ||
      subject.includes('undelivered') ||
      subject.includes('failure notice') ||
      subject.includes('returned mail')
    );
  }
  
  isTransactional(email) {
    // Check transactional indicators
  }
  
  isNotification(email) {
    // Check notification indicators
  }
  
  isMarketing(email) {
    // Check marketing indicators
  }
  
  isNewsletter(email) {
    // Check newsletter indicators
  }
}

module.exports = EmailClassifier;
```

**File: `services/email-worker/thread-builder.js`**
```javascript
// Email threading logic
// Requirements:
// - Group emails into conversations
// - Use In-Reply-To and References headers
// - Match by subject similarity as fallback

class ThreadBuilder {
  
  async findOrCreateThread(db, mailboxId, userId, email) {
    // 1. Check if In-Reply-To references existing message
    if (email.inReplyTo) {
      const parent = await db
        .from('emails')
        .select('thread_id')
        .eq('mailbox_id', mailboxId)
        .eq('message_id', email.inReplyTo)
        .single();
      
      if (parent?.thread_id) {
        return parent.thread_id;
      }
    }
    
    // 2. Check References header
    if (email.references && email.references.length > 0) {
      const referenced = await db
        .from('emails')
        .select('thread_id')
        .eq('mailbox_id', mailboxId)
        .in('message_id', email.references)
        .limit(1)
        .single();
      
      if (referenced?.thread_id) {
        return referenced.thread_id;
      }
    }
    
    // 3. Subject matching (fuzzy - remove Re:, Fwd:)
    const normalizedSubject = this.normalizeSubject(email.subject);
    const recent = await db
      .from('email_threads')
      .select('id')
      .eq('mailbox_id', mailboxId)
      .ilike('subject', `%${normalizedSubject}%`)
      .gte('last_message_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      .limit(1)
      .single();
    
    if (recent) {
      return recent.id;
    }
    
    // 4. Create new thread
    const thread = await db
      .from('email_threads')
      .insert({
        user_id: userId,
        mailbox_id: mailboxId,
        subject: normalizedSubject,
        participants: this.extractParticipants(email),
        first_message_at: email.receivedAt,
        last_message_at: email.receivedAt,
      })
      .select()
      .single();
    
    return thread.id;
  }
  
  normalizeSubject(subject) {
    // Remove Re:, Fwd:, [External], etc.
    return subject
      .replace(/^(re|fwd|fw):\s*/gi, '')
      .replace(/\[external\]/gi, '')
      .trim();
  }
  
  extractParticipants(email) {
    // Get unique email addresses from from, to, cc
    const all = [
      email.from,
      ...email.to,
      ...(email.cc || [])
    ];
    return [...new Set(all)];
  }
  
  async updateThreadStats(db, threadId) {
    // Update thread message_count and last_message_at
    const stats = await db
      .from('emails')
      .select('received_at')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: false });
    
    await db
      .from('email_threads')
      .update({
        message_count: stats.length,
        last_message_at: stats[0].received_at,
      })
      .eq('id', threadId);
  }
}

module.exports = ThreadBuilder;
```

**File: `services/email-worker/enhanced-processor.js`**
```javascript
// Enhanced email processor with classification and threading
// Requirements:
// - Process ALL emails, not just bounces
// - Classify each email
// - Group into threads
// - Store in emails table
// - Still handle bounces from Phase 1

const EmailClassifier = require('./classifier');
const ThreadBuilder = require('./thread-builder');
const BounceDetector = require('./bounce-detector');

class EnhancedEmailProcessor {
  constructor(supabaseUrl, supabaseKey) {
    // ... same as Phase 1
    this.classifier = new EmailClassifier();
    this.threadBuilder = new ThreadBuilder();
    this.bounceDetector = new BounceDetector();
  }
  
  async processMailbox(mailboxId) {
    // 1. Fetch mailbox config
    const mailbox = await this.db
      .from('mailboxes')
      .select('*')
      .eq('id', mailboxId)
      .single();
    
    // 2. Connect to IMAP
    const imap = new ImapClient({
      host: mailbox.imap_host,
      port: mailbox.imap_port,
      secure: mailbox.imap_secure,
      username: mailbox.imap_username,
      password: this.decrypt(mailbox.imap_password_encrypted),
    });
    
    await imap.connect();
    
    // 3. Fetch new messages
    const messages = await imap.fetchNewMessages(mailbox.last_synced_uid);
    
    // 4. Process each message
    for (const msg of messages) {
      await this.processMessage(mailbox, msg);
    }
    
    // 5. Update last synced UID
    if (messages.length > 0) {
      const maxUid = Math.max(...messages.map(m => m.uid));
      await this.db
        .from('mailboxes')
        .update({ last_synced_uid: maxUid })
        .eq('id', mailboxId);
    }
    
    await imap.disconnect();
  }
  
  async processMessage(mailbox, message) {
    // 1. Classify email
    const classification = this.classifier.classify(message);
    
    // 2. Find or create thread
    const threadId = await this.threadBuilder.findOrCreateThread(
      this.db,
      mailbox.id,
      mailbox.user_id,
      message
    );
    
    // 3. Store email
    const email = await this.db
      .from('emails')
      .insert({
        user_id: mailbox.user_id,
        mailbox_id: mailbox.id,
        uid: message.uid,
        message_id: message.messageId,
        subject: message.subject,
        from_address: message.from,
        to_addresses: message.to,
        category: classification.category,
        thread_id: threadId,
        in_reply_to: message.inReplyTo,
        references: message.references,
        received_at: message.receivedAt,
        sent_at: message.sentAt,
        has_attachments: message.attachments?.length > 0,
        size_bytes: message.size,
        headers: message.headers,
      })
      .select()
      .single();
    
    // 4. Update thread stats
    await this.threadBuilder.updateThreadStats(this.db, threadId);
    
    // 5. If bounce, also process as bounce (Phase 1 logic)
    if (classification.category === 'BOUNCE') {
      const bounceData = this.bounceDetector.parseBounce(message);
      if (bounceData) {
        await this.processBounce(mailbox.id, mailbox.user_id, message, bounceData);
      }
    }
  }
}

module.exports = EnhancedEmailProcessor;
```

#### 1.2 New API Endpoints

**File: `services/api/routes/emails.js`**
```javascript
// Email browsing and filtering endpoints
// Requirements:
// - GET /emails - List emails with filters
// - GET /emails/:id - Get single email details
// - GET /emails/categories - Get category counts
// - PUT /emails/:id/read - Mark as read
// - PUT /emails/:id/star - Toggle star

async function routes(fastify, options) {
  
  // GET /emails?category=HUMAN&limit=50&offset=0&thread_id=xxx
  fastify.get('/emails', async (request, reply) => {
    const { category, limit = 50, offset = 0, thread_id, search } = request.query;
    
    let query = this.db
      .from('emails')
      .select('*')
      .eq('user_id', request.user.id)
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (category) {
      query = query.eq('category', category);
    }
    
    if (thread_id) {
      query = query.eq('thread_id', thread_id);
    }
    
    if (search) {
      query = query.or(`subject.ilike.%${search}%,from_address.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    
    return { data, total: data.length };
  });
  
  // GET /emails/categories
  fastify.get('/emails/categories', async (request, reply) => {
    // Aggregate count by category
    const { data } = await this.db
      .from('emails')
      .select('category')
      .eq('user_id', request.user.id);
    
    const counts = data.reduce((acc, email) => {
      acc[email.category] = (acc[email.category] || 0) + 1;
      return acc;
    }, {});
    
    return counts;
  });
  
  // GET /emails/:id
  fastify.get('/emails/:id', async (request, reply) => {
    const { data } = await this.db
      .from('emails')
      .select('*, email_threads(*)')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .single();
    
    return data;
  });
  
  // PUT /emails/:id/read
  fastify.put('/emails/:id/read', async (request, reply) => {
    const { is_read } = request.body;
    
    const { data } = await this.db
      .from('emails')
      .update({ is_read })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .select()
      .single();
    
    return data;
  });
  
  // PUT /emails/:id/star
  fastify.put('/emails/:id/star', async (request, reply) => {
    const { is_starred } = request.body;
    
    const { data } = await this.db
      .from('emails')
      .update({ is_starred })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .select()
      .single();
    
    return data;
  });
  
}

module.exports = routes;
```

**File: `services/api/routes/threads.js`**
```javascript
// Thread/conversation endpoints
// Requirements:
// - GET /threads - List threads
// - GET /threads/:id - Get thread with all messages
// - PUT /threads/:id/archive - Archive thread

async function routes(fastify, options) {
  
  // GET /threads?limit=50&offset=0
  fastify.get('/threads', async (request, reply) => {
    const { limit = 50, offset = 0, is_unread, is_archived } = request.query;
    
    let query = this.db
      .from('email_threads')
      .select('*, emails(count)')
      .eq('user_id', request.user.id)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (is_unread !== undefined) {
      query = query.eq('is_unread', is_unread);
    }
    
    if (is_archived !== undefined) {
      query = query.eq('is_archived', is_archived);
    }
    
    const { data } = await query;
    
    return { data, total: data.length };
  });
  
  // GET /threads/:id
  fastify.get('/threads/:id', async (request, reply) => {
    const { data: thread } = await this.db
      .from('email_threads')
      .select('*')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .single();
    
    const { data: messages } = await this.db
      .from('emails')
      .select('*')
      .eq('thread_id', request.params.id)
      .order('received_at', { ascending: true });
    
    return { ...thread, messages };
  });
  
  // PUT /threads/:id/archive
  fastify.put('/threads/:id/archive', async (request, reply) => {
    const { is_archived } = request.body;
    
    const { data } = await this.db
      .from('email_threads')
      .update({ is_archived })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .select()
      .single();
    
    return data;
  });
  
}

module.exports = routes;
```

### 2. Frontend (Flutter App)

#### 2.1 New Screens

**File: `lib/screens/inbox_screen.dart`**
```dart
// Main inbox view with category filtering
// Requirements:
// - Tabbed interface for categories (All, Human, Transactional, etc.)
// - Email list with preview
// - Swipe actions (archive, star, mark read)
// - Pull-to-refresh
// - Search bar

import 'package:flutter/material.dart';

class InboxScreen extends StatefulWidget {
  @override
  _InboxScreenState createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  
  final categories = [
    'ALL',
    'HUMAN',
    'TRANSACTIONAL',
    'NOTIFICATION',
    'MARKETING',
    'NEWSLETTER'
  ];
  
  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: categories.length, vsync: this);
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Inbox'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: categories.map((cat) => Tab(text: cat)).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: categories.map((cat) => EmailListView(category: cat)).toList(),
      ),
    );
  }
}

class EmailListView extends StatelessWidget {
  final String category;
  
  EmailListView({required this.category});
  
  @override
  Widget build(BuildContext context) {
    // Fetch and display emails for this category
    return RefreshIndicator(
      onRefresh: () async {
        // Refresh emails
      },
      child: ListView.builder(
        itemCount: emails.length,
        itemBuilder: (context, index) {
          return Dismissible(
            key: Key(emails[index].id),
            background: Container(color: Colors.green),
            secondaryBackground: Container(color: Colors.red),
            onDismissed: (direction) {
              if (direction == DismissDirection.startToEnd) {
                // Mark as read
              } else {
                // Archive
              }
            },
            child: EmailListTile(email: emails[index]),
          );
        },
      ),
    );
  }
}
```

**File: `lib/screens/email_detail_screen.dart`**
```dart
// Single email detail view
// Requirements:
// - Show full email metadata
// - Render HTML content safely
// - Show thread context (if part of thread)
// - Actions: reply, forward, archive, star

class EmailDetailScreen extends StatelessWidget {
  final String emailId;
  
  EmailDetailScreen({required this.emailId});
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Email Details'),
        actions: [
          IconButton(
            icon: Icon(Icons.star_border),
            onPressed: () {
              // Toggle star
            },
          ),
          IconButton(
            icon: Icon(Icons.archive),
            onPressed: () {
              // Archive
            },
          ),
        ],
      ),
      body: FutureBuilder<Email>(
        future: fetchEmail(emailId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          
          final email = snapshot.data!;
          
          return SingleChildScrollView(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(email.subject, style: Theme.of(context).textTheme.headlineSmall),
                SizedBox(height: 8),
                
                // From/To info
                EmailHeader(email: email),
                
                Divider(),
                
                // Email body (HTML or plain text)
                EmailBody(content: email.body),
                
                // If part of thread, show related messages
                if (email.threadId != null)
                  ThreadMessages(threadId: email.threadId!),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

**File: `lib/screens/thread_view_screen.dart`**
```dart
// Conversation/thread view
// Requirements:
// - Show all messages in thread chronologically
// - Expandable message cards
// - Quick reply at bottom

class ThreadViewScreen extends StatelessWidget {
  final String threadId;
  
  ThreadViewScreen({required this.threadId});
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Conversation')),
      body: FutureBuilder<EmailThread>(
        future: fetchThread(threadId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          
          final thread = snapshot.data!;
          
          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  itemCount: thread.messages.length,
                  itemBuilder: (context, index) {
                    return MessageCard(message: thread.messages[index]);
                  },
                ),
              ),
              
              // Quick reply input
              QuickReplyBar(threadId: threadId),
            ],
          );
        },
      ),
    );
  }
}
```

#### 2.2 Widgets

**File: `lib/widgets/email_list_tile.dart`**
```dart
// Email preview tile for list view
// Requirements:
// - Show sender, subject, preview, timestamp
// - Unread indicator
// - Star indicator
// - Category badge

class EmailListTile extends StatelessWidget {
  final Email email;
  
  EmailListTile({required this.email});
  
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        child: Text(email.fromName[0].toUpperCase()),
        backgroundColor: _getColorForCategory(email.category),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              email.fromName,
              style: TextStyle(
                fontWeight: email.isRead ? FontWeight.normal : FontWeight.bold,
              ),
            ),
          ),
          if (!email.isRead)
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: Colors.blue,
                shape: BoxShape.circle,
              ),
            ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            email.subject,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: email.isRead ? FontWeight.normal : FontWeight.bold,
            ),
          ),
          Text(
            email.preview,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            _formatTimestamp(email.receivedAt),
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
          if (email.isStarred)
            Icon(Icons.star, color: Colors.amber, size: 16),
        ],
      ),
      onTap: () {
        // Navigate to email detail
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => EmailDetailScreen(emailId: email.id),
          ),
        );
      },
    );
  }
  
  Color _getColorForCategory(String category) {
    switch (category) {
      case 'HUMAN': return Colors.blue;
      case 'TRANSACTIONAL': return Colors.green;
      case 'NOTIFICATION': return Colors.orange;
      case 'MARKETING': return Colors.purple;
      case 'NEWSLETTER': return Colors.teal;
      default: return Colors.grey;
    }
  }
  
  String _formatTimestamp(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    
    if (diff.inDays == 0) {
      return '${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
    } else if (diff.inDays < 7) {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dt.weekday - 1];
    } else {
      return '${dt.day}/${dt.month}/${dt.year}';
    }
  }
}
```

**File: `lib/widgets/category_chip.dart`**
```dart
// Category badge widget
class CategoryChip extends StatelessWidget {
  final String category;
  
  CategoryChip({required this.category});
  
  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(
        category,
        style: TextStyle(fontSize: 10, color: Colors.white),
      ),
      backgroundColor: _getColorForCategory(category),
      padding: EdgeInsets.symmetric(horizontal: 4, vertical: 0),
    );
  }
  
  Color _getColorForCategory(String category) {
    // Same as EmailListTile
  }
}
```

### 3. Enhanced Dashboard

**File: `lib/screens/enhanced_dashboard.dart`**
```dart
// Updated dashboard with inbox insights
// Requirements:
// - Category breakdown chart
// - Unread count by category
// - Thread statistics
// - Recent activity timeline

class EnhancedDashboard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('MailSuite Dashboard')),
      body: RefreshIndicator(
        onRefresh: () async {
          // Refresh all stats
        },
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            // Category breakdown
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Inbox by Category', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    CategoryPieChart(),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Unread counts
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Unread Messages', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    UnreadCategoryList(),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Thread activity
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Active Conversations', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    ActiveThreadsList(),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Bounce stats (from Phase 1)
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Delivery Issues', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    BounceStatsWidget(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

## Testing Checklist

- [ ] All emails are ingested, not just bounces
- [ ] Classification accuracy is reasonable (>80%)
- [ ] Threads are grouped correctly
- [ ] Category filters work in inbox
- [ ] Email detail view renders correctly
- [ ] Thread view shows conversation properly
- [ ] Swipe actions work (archive, star, mark read)
- [ ] Search functionality works
- [ ] Dashboard shows category breakdown
- [ ] Performance is good with 1000+ emails

## Performance Considerations

**Indexing Strategy:**
```sql
-- Add these indexes if querying is slow
create index idx_emails_user_category on emails(user_id, category);
create index idx_emails_unread on emails(is_read) where is_read = false;
create index idx_threads_unread on email_threads(is_unread) where is_unread = true;
```

**Pagination:**
- Load emails in batches of 50
- Implement infinite scroll or "Load More"
- Cache results in Flutter app

**Email Content:**
- Don't store full email body by default (only metadata)
- Fetch body on-demand when user opens email
- Consider storing preview text (first 200 chars)

## Migration from Phase 1

1. Run Phase 2 database migration
2. Deploy updated email worker
3. Initial sync will classify all existing emails
4. Bounce detection continues to work (backward compatible)
5. Deploy updated API and Flutter app

## Success Criteria

✅ Full inbox is ingested and classified
✅ Users can browse emails by category
✅ Thread grouping works for conversations
✅ UI is responsive and performant
✅ Classification accuracy is satisfactory
✅ Phase 1 bounce detection still works

## Next: Phase 3
Proceed to Phase 3 for analytics and SLA tracking.
