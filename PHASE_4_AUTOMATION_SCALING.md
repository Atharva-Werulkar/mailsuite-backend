# Phase 4: Automation & Scaling

## Overview
Implement advanced automation, multi-inbox support, provider abstraction, and production hardening for enterprise-grade deployment.

## Prerequisites
✅ Phase 1, 2, and 3 completed
✅ Core functionality stable
✅ Analytics operational
✅ Users successfully using the system

## Database Schema Additions

**File: `migrations/phase4_automation_scaling.sql`**
```sql
-- Automation rules
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete cascade, -- null = all mailboxes
  
  name text not null,
  description text,
  
  -- Trigger conditions
  trigger_type text not null, -- EMAIL_RECEIVED, BOUNCE_DETECTED, SLA_BREACH, RESPONSE_PENDING
  
  -- Filters (all optional, must match ALL to trigger)
  category text, -- HUMAN, TRANSACTIONAL, etc.
  from_pattern text, -- Regex pattern for from address
  subject_pattern text, -- Regex pattern for subject
  bounce_type text, -- HARD, SOFT
  
  -- Actions (at least one required)
  action_type text not null, -- BLOCK_EMAIL, APPLY_LABEL, ARCHIVE, NOTIFY, WEBHOOK, FORWARD
  
  -- Action parameters (JSON)
  action_params jsonb,
  -- Examples:
  -- { "label_name": "Important" }
  -- { "webhook_url": "https://..." }
  -- { "forward_to": "admin@example.com" }
  -- { "block_permanently": true }
  
  -- State
  is_active boolean default true,
  execution_count int default 0,
  last_executed_at timestamptz,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index idx_automation_rules_active on automation_rules(is_active, trigger_type);

-- Automation execution log
create table if not exists automation_executions (
  id uuid primary key default gen_random_uuid(),
  
  rule_id uuid not null references automation_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- What triggered this
  trigger_entity_type text not null, -- email, bounce, response
  trigger_entity_id uuid not null,
  
  -- Execution result
  status text not null, -- SUCCESS, FAILED, SKIPPED
  error_message text,
  
  executed_at timestamptz default timezone('utc', now())
);

create index idx_automation_executions_rule on automation_executions(rule_id, executed_at desc);

-- Email blocklist (auto-populated by hard bounces or manual additions)
create table if not exists email_blocklist (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete cascade, -- null = global for user
  
  email text not null,
  reason text not null, -- HARD_BOUNCE, MANUAL, SPAM_REPORT, etc.
  
  -- Source
  blocked_by_rule_id uuid references automation_rules(id) on delete set null,
  
  -- Metadata
  blocked_at timestamptz default timezone('utc', now()),
  bounce_count int default 0,
  
  unique (user_id, email)
);

create index idx_blocklist_email on email_blocklist(email);

-- Multi-provider support: Extended mailbox configuration
alter table mailboxes add column if not exists oauth_token text;
alter table mailboxes add column if not exists oauth_refresh_token text;
alter table mailboxes add column if not exists oauth_expires_at timestamptz;
alter table mailboxes add column if not exists auth_type text default 'PASSWORD'; -- PASSWORD, OAUTH

-- Provider-specific settings (JSON)
alter table mailboxes add column if not exists provider_settings jsonb;
-- Examples:
-- Gmail: { "use_labels": true, "sync_sent": true }
-- Outlook: { "folder": "Inbox" }

-- Webhooks for external integrations
create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  
  name text not null,
  url text not null,
  
  -- Events to subscribe to
  events text[], -- BOUNCE_DETECTED, EMAIL_RECEIVED, SLA_BREACH, etc.
  
  -- Security
  secret text, -- For signature verification
  
  -- State
  is_active boolean default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count int default 0,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- Webhook delivery log
create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  
  webhook_id uuid not null references webhooks(id) on delete cascade,
  
  event_type text not null,
  payload jsonb not null,
  
  -- Delivery result
  status_code int,
  response_body text,
  delivered_at timestamptz,
  
  attempts int default 1,
  
  created_at timestamptz default timezone('utc', now())
);

create index idx_webhook_deliveries_webhook on webhook_deliveries(webhook_id, created_at desc);

-- Performance optimization: Materialized view for dashboard stats
create materialized view if not exists inbox_stats as
select
  mailbox_id,
  user_id,
  category,
  count(*) as total_count,
  count(*) filter (where is_read = false) as unread_count,
  max(received_at) as latest_email_at
from emails
group by mailbox_id, user_id, category;

create unique index idx_inbox_stats_mailbox_category on inbox_stats(mailbox_id, category);

-- Refresh function
create or replace function refresh_inbox_stats()
returns void as $$
begin
  refresh materialized view concurrently inbox_stats;
end;
$$ language plpgsql;
```

## What You Need to Build

### 1. Backend Services

#### 1.1 Automation Engine

**File: `services/automation/rule-executor.js`**
```javascript
// Execute automation rules based on triggers
// Requirements:
// - Evaluate rule conditions
// - Execute actions
// - Log execution results

const { createClient } = require('@supabase/supabase-js');

class RuleExecutor {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async executeRulesForEmail(email) {
    // Trigger type: EMAIL_RECEIVED
    await this.executeRules('EMAIL_RECEIVED', email, 'email', email.id);
  }
  
  async executeRulesForBounce(bounce) {
    // Trigger type: BOUNCE_DETECTED
    await this.executeRules('BOUNCE_DETECTED', bounce, 'bounce', bounce.id);
  }
  
  async executeRules(triggerType, entity, entityType, entityId) {
    // 1. Fetch active rules for this trigger type
    const { data: rules } = await this.db
      .from('automation_rules')
      .select('*')
      .eq('is_active', true)
      .eq('trigger_type', triggerType)
      .or(`mailbox_id.eq.${entity.mailboxId},mailbox_id.is.null`);
    
    // 2. Evaluate each rule
    for (const rule of rules) {
      const matches = this.evaluateConditions(rule, entity);
      
      if (!matches) {
        // Log as SKIPPED
        await this.logExecution(rule.id, entity.userId, entityType, entityId, 'SKIPPED', null);
        continue;
      }
      
      // 3. Execute action
      try {
        await this.executeAction(rule, entity);
        
        // Log as SUCCESS
        await this.logExecution(rule.id, entity.userId, entityType, entityId, 'SUCCESS', null);
        
        // Update rule stats
        await this.db
          .from('automation_rules')
          .update({
            execution_count: rule.execution_count + 1,
            last_executed_at: new Date().toISOString(),
          })
          .eq('id', rule.id);
        
      } catch (error) {
        // Log as FAILED
        await this.logExecution(rule.id, entity.userId, entityType, entityId, 'FAILED', error.message);
      }
    }
  }
  
  evaluateConditions(rule, entity) {
    // Check if all filter conditions match
    
    // Category filter
    if (rule.category && entity.category !== rule.category) {
      return false;
    }
    
    // From pattern filter
    if (rule.from_pattern) {
      const regex = new RegExp(rule.from_pattern, 'i');
      if (!regex.test(entity.fromAddress || entity.from_address || entity.email)) {
        return false;
      }
    }
    
    // Subject pattern filter
    if (rule.subject_pattern) {
      const regex = new RegExp(rule.subject_pattern, 'i');
      if (!regex.test(entity.subject || '')) {
        return false;
      }
    }
    
    // Bounce type filter (for bounce entities)
    if (rule.bounce_type && entity.bounceType !== rule.bounce_type) {
      return false;
    }
    
    return true;
  }
  
  async executeAction(rule, entity) {
    const params = rule.action_params || {};
    
    switch (rule.action_type) {
      case 'BLOCK_EMAIL':
        await this.blockEmail(entity, rule, params);
        break;
      
      case 'APPLY_LABEL':
        await this.applyLabel(entity, params);
        break;
      
      case 'ARCHIVE':
        await this.archiveEmail(entity);
        break;
      
      case 'NOTIFY':
        await this.sendNotification(entity, params);
        break;
      
      case 'WEBHOOK':
        await this.callWebhook(entity, params);
        break;
      
      case 'FORWARD':
        await this.forwardEmail(entity, params);
        break;
      
      default:
        throw new Error(`Unknown action type: ${rule.action_type}`);
    }
  }
  
  async blockEmail(entity, rule, params) {
    const email = entity.email || entity.fromAddress || entity.from_address;
    
    if (!email) return;
    
    // Add to blocklist
    await this.db
      .from('email_blocklist')
      .upsert({
        user_id: entity.userId,
        mailbox_id: entity.mailboxId,
        email: email,
        reason: params.reason || 'AUTOMATED_RULE',
        blocked_by_rule_id: rule.id,
        bounce_count: entity.failureCount || 0,
      }, {
        onConflict: 'user_id,email'
      });
  }
  
  async applyLabel(entity, params) {
    if (!params.label_name) return;
    
    // Get or create label
    let { data: label } = await this.db
      .from('email_labels')
      .select('id')
      .eq('mailbox_id', entity.mailboxId)
      .eq('name', params.label_name)
      .single();
    
    if (!label) {
      const { data: newLabel } = await this.db
        .from('email_labels')
        .insert({
          user_id: entity.userId,
          mailbox_id: entity.mailboxId,
          name: params.label_name,
          color: params.label_color || '#6366f1',
        })
        .select()
        .single();
      
      label = newLabel;
    }
    
    // Assign label to email
    await this.db
      .from('email_label_assignments')
      .insert({
        email_id: entity.id,
        label_id: label.id,
      })
      .onConflict('email_id,label_id')
      .ignore();
  }
  
  async archiveEmail(entity) {
    if (entity.threadId) {
      await this.db
        .from('email_threads')
        .update({ is_archived: true })
        .eq('id', entity.threadId);
    }
  }
  
  async sendNotification(entity, params) {
    // Send email notification
    // Implementation depends on email service (SendGrid, SES, etc.)
  }
  
  async callWebhook(entity, params) {
    if (!params.webhook_url) return;
    
    await fetch(params.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'automation_triggered',
        entity: entity,
        timestamp: new Date().toISOString(),
      }),
    });
  }
  
  async forwardEmail(entity, params) {
    // Forward email to another address
    // Requires SMTP sending capability
  }
  
  async logExecution(ruleId, userId, entityType, entityId, status, errorMessage) {
    await this.db
      .from('automation_executions')
      .insert({
        rule_id: ruleId,
        user_id: userId,
        trigger_entity_type: entityType,
        trigger_entity_id: entityId,
        status,
        error_message: errorMessage,
      });
  }
}

module.exports = RuleExecutor;
```

#### 1.2 Auto-Block System

**File: `services/automation/auto-blocker.js`**
```javascript
// Automatically block hard-bounced emails
// Requirements:
// - Trigger after hard bounce detection
// - Add to blocklist
// - Respect configuration (auto-block threshold)

class AutoBlocker {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async processHardBounce(bounce) {
    // Only auto-block HARD bounces
    if (bounce.bounceType !== 'HARD') {
      return;
    }
    
    // Check if already blocked
    const { data: existing } = await this.db
      .from('email_blocklist')
      .select('id')
      .eq('email', bounce.email)
      .eq('user_id', bounce.userId)
      .single();
    
    if (existing) {
      // Update bounce count
      await this.db
        .from('email_blocklist')
        .update({
          bounce_count: bounce.failureCount,
        })
        .eq('id', existing.id);
      
      return;
    }
    
    // Add to blocklist
    await this.db
      .from('email_blocklist')
      .insert({
        user_id: bounce.userId,
        mailbox_id: bounce.mailboxId,
        email: bounce.email,
        reason: 'HARD_BOUNCE',
        bounce_count: bounce.failureCount,
      });
  }
  
  async isBlocked(userId, email) {
    const { data } = await this.db
      .from('email_blocklist')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .single();
    
    return !!data;
  }
}

module.exports = AutoBlocker;
```

#### 1.3 Provider Abstraction Layer

**File: `services/providers/email-provider.js`**
```javascript
// Abstract interface for email providers
// Requirements:
// - Define common interface
// - Support Gmail, Outlook, generic IMAP

class EmailProvider {
  constructor(config) {
    this.config = config;
  }
  
  async connect() {
    throw new Error('Not implemented');
  }
  
  async disconnect() {
    throw new Error('Not implemented');
  }
  
  async fetchMessages(lastUid) {
    throw new Error('Not implemented');
  }
  
  async sendMessage(to, subject, body) {
    throw new Error('Not implemented');
  }
  
  async markAsRead(messageId) {
    throw new Error('Not implemented');
  }
  
  async archive(messageId) {
    throw new Error('Not implemented');
  }
}

module.exports = EmailProvider;
```

**File: `services/providers/gmail-provider.js`**
```javascript
// Gmail-specific implementation
const EmailProvider = require('./email-provider');
const ImapFlow = require('imapflow');
const { google } = require('googleapis');

class GmailProvider extends EmailProvider {
  constructor(config) {
    super(config);
    
    if (config.auth_type === 'OAUTH') {
      this.oauth2Client = this.setupOAuth();
    }
  }
  
  setupOAuth() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
      access_token: this.config.oauth_token,
      refresh_token: this.config.oauth_refresh_token,
    });
    
    return oauth2Client;
  }
  
  async connect() {
    if (this.config.auth_type === 'OAUTH') {
      // Use Gmail API with OAuth
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    } else {
      // Use IMAP with app password
      this.client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: this.config.imap_username,
          pass: this.config.imap_password,
        },
      });
      
      await this.client.connect();
    }
  }
  
  async fetchMessages(lastUid) {
    if (this.config.auth_type === 'OAUTH') {
      return this.fetchMessagesViaAPI(lastUid);
    } else {
      return this.fetchMessagesViaIMAP(lastUid);
    }
  }
  
  async fetchMessagesViaAPI(lastUid) {
    // Use Gmail API to fetch messages
    const res = await this.gmail.users.messages.list({
      userId: 'me',
      q: `after:${lastUid}`,
      maxResults: 100,
    });
    
    const messages = [];
    
    for (const msg of res.data.messages || []) {
      const detail = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });
      
      messages.push(this.parseGmailMessage(detail.data));
    }
    
    return messages;
  }
  
  async fetchMessagesViaIMAP(lastUid) {
    // Standard IMAP fetch
    await this.client.mailboxOpen('INBOX');
    
    const messages = [];
    
    for await (const msg of this.client.fetch(`${lastUid + 1}:*`, {
      uid: true,
      envelope: true,
      bodyStructure: true,
      source: true,
    })) {
      messages.push({
        uid: msg.uid,
        messageId: msg.envelope.messageId,
        subject: msg.envelope.subject,
        from: msg.envelope.from[0].address,
        to: msg.envelope.to?.map(t => t.address) || [],
        receivedAt: msg.envelope.date,
        // ... parse body
      });
    }
    
    return messages;
  }
  
  parseGmailMessage(gmailMsg) {
    // Parse Gmail API message format
    const headers = gmailMsg.payload.headers.reduce((acc, h) => {
      acc[h.name.toLowerCase()] = h.value;
      return acc;
    }, {});
    
    return {
      uid: gmailMsg.historyId, // Use historyId as UID equivalent
      messageId: gmailMsg.id,
      subject: headers['subject'],
      from: headers['from'],
      to: headers['to']?.split(',').map(t => t.trim()) || [],
      receivedAt: new Date(parseInt(gmailMsg.internalDate)),
      // ... parse body from payload
    };
  }
  
  async sendMessage(to, subject, body) {
    if (this.config.auth_type === 'OAUTH') {
      // Use Gmail API
      const message = this.createMimeMessage(to, subject, body);
      
      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: Buffer.from(message).toString('base64'),
        },
      });
    } else {
      // Use SMTP
      // Implementation...
    }
  }
  
  createMimeMessage(to, subject, body) {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ];
    
    return lines.join('\r\n');
  }
}

module.exports = GmailProvider;
```

**File: `services/providers/outlook-provider.js`**
```javascript
// Outlook/Office365-specific implementation
const EmailProvider = require('./email-provider');
const { Client } = require('@microsoft/microsoft-graph-client');

class OutlookProvider extends EmailProvider {
  async connect() {
    this.client = Client.init({
      authProvider: (done) => {
        done(null, this.config.oauth_token);
      },
    });
  }
  
  async fetchMessages(lastUid) {
    const messages = await this.client
      .api('/me/messages')
      .filter(`receivedDateTime gt ${lastUid}`)
      .top(100)
      .get();
    
    return messages.value.map(msg => this.parseOutlookMessage(msg));
  }
  
  parseOutlookMessage(outlookMsg) {
    return {
      uid: outlookMsg.id,
      messageId: outlookMsg.internetMessageId,
      subject: outlookMsg.subject,
      from: outlookMsg.from.emailAddress.address,
      to: outlookMsg.toRecipients.map(r => r.emailAddress.address),
      receivedAt: new Date(outlookMsg.receivedDateTime),
      body: outlookMsg.body.content,
    };
  }
}

module.exports = OutlookProvider;
```

**File: `services/providers/provider-factory.js`**
```javascript
// Factory to create appropriate provider
const GmailProvider = require('./gmail-provider');
const OutlookProvider = require('./outlook-provider');
const ImapProvider = require('./imap-provider'); // Generic IMAP

class ProviderFactory {
  static create(mailbox) {
    switch (mailbox.provider.toLowerCase()) {
      case 'gmail':
        return new GmailProvider(mailbox);
      
      case 'outlook':
      case 'office365':
        return new OutlookProvider(mailbox);
      
      case 'imap':
      default:
        return new ImapProvider(mailbox);
    }
  }
}

module.exports = ProviderFactory;
```

#### 1.4 Webhook System

**File: `services/webhooks/webhook-dispatcher.js`**
```javascript
// Dispatch webhook events
// Requirements:
// - Send webhook POST requests
// - Retry on failure
// - Sign payloads for security

const crypto = require('crypto');

class WebhookDispatcher {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async dispatch(userId, eventType, payload) {
    // Find webhooks subscribed to this event
    const { data: webhooks } = await this.db
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .contains('events', [eventType]);
    
    for (const webhook of webhooks) {
      await this.sendWebhook(webhook, eventType, payload);
    }
  }
  
  async sendWebhook(webhook, eventType, payload) {
    const fullPayload = {
      event: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    };
    
    const signature = this.signPayload(fullPayload, webhook.secret);
    
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body: JSON.stringify(fullPayload),
        });
        
        // Log delivery
        await this.db
          .from('webhook_deliveries')
          .insert({
            webhook_id: webhook.id,
            event_type: eventType,
            payload: fullPayload,
            status_code: response.status,
            response_body: await response.text(),
            delivered_at: new Date().toISOString(),
            attempts: attempt + 1,
          });
        
        if (response.ok) {
          // Success
          await this.db
            .from('webhooks')
            .update({
              last_success_at: new Date().toISOString(),
              failure_count: 0,
            })
            .eq('id', webhook.id);
          
          break;
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
        
      } catch (error) {
        attempt++;
        
        if (attempt >= maxAttempts) {
          // Final failure
          await this.db
            .from('webhooks')
            .update({
              last_failure_at: new Date().toISOString(),
              failure_count: webhook.failure_count + 1,
            })
            .eq('id', webhook.id);
          
          // Disable webhook if too many failures
          if (webhook.failure_count + 1 >= 10) {
            await this.db
              .from('webhooks')
              .update({ is_active: false })
              .eq('id', webhook.id);
          }
        } else {
          // Retry with exponential backoff
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }
  }
  
  signPayload(payload, secret) {
    if (!secret) return '';
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebhookDispatcher;
```

### 2. API Endpoints

**File: `services/api/routes/automation.js`**
```javascript
// Automation rule management
// Requirements:
// - CRUD operations for automation rules
// - Test rule execution
// - View execution logs

async function routes(fastify, options) {
  
  // POST /automation/rules
  fastify.post('/automation/rules', async (request, reply) => {
    const rule = request.body;
    
    const { data } = await this.db
      .from('automation_rules')
      .insert({
        ...rule,
        user_id: request.user.id,
      })
      .select()
      .single();
    
    return data;
  });
  
  // GET /automation/rules
  fastify.get('/automation/rules', async (request, reply) => {
    const { data } = await this.db
      .from('automation_rules')
      .select('*, automation_executions(count)')
      .eq('user_id', request.user.id)
      .order('created_at', { ascending: false });
    
    return data;
  });
  
  // PUT /automation/rules/:id
  fastify.put('/automation/rules/:id', async (request, reply) => {
    const updates = request.body;
    
    const { data } = await this.db
      .from('automation_rules')
      .update(updates)
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .select()
      .single();
    
    return data;
  });
  
  // DELETE /automation/rules/:id
  fastify.delete('/automation/rules/:id', async (request, reply) => {
    await this.db
      .from('automation_rules')
      .delete()
      .eq('id', request.params.id)
      .eq('user_id', request.user.id);
    
    return { success: true };
  });
  
  // POST /automation/rules/:id/test
  fastify.post('/automation/rules/:id/test', async (request, reply) => {
    // Test rule with sample data
    const { sample_email } = request.body;
    
    const { data: rule } = await this.db
      .from('automation_rules')
      .select('*')
      .eq('id', request.params.id)
      .single();
    
    const executor = new RuleExecutor(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const matches = executor.evaluateConditions(rule, sample_email);
    
    return { matches, rule };
  });
  
  // GET /automation/executions?rule_id=xxx
  fastify.get('/automation/executions', async (request, reply) => {
    const { rule_id, limit = 50 } = request.query;
    
    let query = this.db
      .from('automation_executions')
      .select('*')
      .eq('user_id', request.user.id)
      .order('executed_at', { ascending: false })
      .limit(limit);
    
    if (rule_id) {
      query = query.eq('rule_id', rule_id);
    }
    
    const { data } = await query;
    
    return data;
  });
  
}

module.exports = routes;
```

**File: `services/api/routes/blocklist.js`**
```javascript
// Email blocklist management
async function routes(fastify, options) {
  
  // GET /blocklist
  fastify.get('/blocklist', async (request, reply) => {
    const { data } = await this.db
      .from('email_blocklist')
      .select('*')
      .eq('user_id', request.user.id)
      .order('blocked_at', { ascending: false });
    
    return data;
  });
  
  // POST /blocklist
  fastify.post('/blocklist', async (request, reply) => {
    const { email, reason } = request.body;
    
    const { data } = await this.db
      .from('email_blocklist')
      .insert({
        user_id: request.user.id,
        email,
        reason: reason || 'MANUAL',
      })
      .select()
      .single();
    
    return data;
  });
  
  // DELETE /blocklist/:id
  fastify.delete('/blocklist/:id', async (request, reply) => {
    await this.db
      .from('email_blocklist')
      .delete()
      .eq('id', request.params.id)
      .eq('user_id', request.user.id);
    
    return { success: true };
  });
  
  // POST /blocklist/check
  fastify.post('/blocklist/check', async (request, reply) => {
    const { emails } = request.body; // Array of emails
    
    const { data } = await this.db
      .from('email_blocklist')
      .select('email')
      .eq('user_id', request.user.id)
      .in('email', emails);
    
    const blocked = data.map(d => d.email);
    
    return {
      checked: emails.length,
      blocked: blocked.length,
      blocked_emails: blocked,
    };
  });
  
}

module.exports = routes;
```

### 3. Frontend (Flutter)

#### 3.1 Automation Configuration

**File: `lib/screens/automation_screen.dart`**
```dart
// Automation rules management
class AutomationScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Automation Rules'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => AddAutomationRuleScreen()),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<List<AutomationRule>>(
        future: fetchAutomationRules(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          
          final rules = snapshot.data!;
          
          if (rules.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.settings_suggest, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text('No automation rules yet'),
                  SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => AddAutomationRuleScreen()),
                      );
                    },
                    child: Text('Create First Rule'),
                  ),
                ],
              ),
            );
          }
          
          return ListView.builder(
            itemCount: rules.length,
            itemBuilder: (context, index) {
              return AutomationRuleCard(rule: rules[index]);
            },
          );
        },
      ),
    );
  }
}
```

**File: `lib/screens/add_automation_rule_screen.dart`**
```dart
// Create/edit automation rule
class AddAutomationRuleScreen extends StatefulWidget {
  final AutomationRule? rule; // null for new rule
  
  AddAutomationRuleScreen({this.rule});
  
  @override
  _AddAutomationRuleScreenState createState() => _AddAutomationRuleScreenState();
}

class _AddAutomationRuleScreenState extends State<AddAutomationRuleScreen> {
  final _formKey = GlobalKey<FormState>();
  
  String _name = '';
  String _description = '';
  String _triggerType = 'EMAIL_RECEIVED';
  String? _category;
  String? _fromPattern;
  String _actionType = 'APPLY_LABEL';
  Map<String, dynamic> _actionParams = {};
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.rule == null ? 'New Rule' : 'Edit Rule'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            TextFormField(
              decoration: InputDecoration(labelText: 'Rule Name'),
              validator: (value) => value?.isEmpty ?? true ? 'Required' : null,
              onSaved: (value) => _name = value!,
            ),
            
            TextFormField(
              decoration: InputDecoration(labelText: 'Description'),
              maxLines: 2,
              onSaved: (value) => _description = value ?? '',
            ),
            
            SizedBox(height: 16),
            Text('Trigger', style: Theme.of(context).textTheme.titleMedium),
            
            DropdownButtonFormField<String>(
              value: _triggerType,
              items: [
                DropdownMenuItem(value: 'EMAIL_RECEIVED', child: Text('Email Received')),
                DropdownMenuItem(value: 'BOUNCE_DETECTED', child: Text('Bounce Detected')),
                DropdownMenuItem(value: 'SLA_BREACH', child: Text('SLA Breach')),
              ],
              onChanged: (value) => setState(() => _triggerType = value!),
            ),
            
            SizedBox(height: 16),
            Text('Conditions (optional)', style: Theme.of(context).textTheme.titleMedium),
            
            DropdownButtonFormField<String>(
              value: _category,
              decoration: InputDecoration(labelText: 'Category'),
              items: [
                DropdownMenuItem(value: null, child: Text('Any')),
                DropdownMenuItem(value: 'HUMAN', child: Text('Human')),
                DropdownMenuItem(value: 'TRANSACTIONAL', child: Text('Transactional')),
                DropdownMenuItem(value: 'MARKETING', child: Text('Marketing')),
              ],
              onChanged: (value) => setState(() => _category = value),
            ),
            
            TextFormField(
              decoration: InputDecoration(
                labelText: 'From Pattern (regex)',
                hintText: '.*@example\\.com',
              ),
              onSaved: (value) => _fromPattern = value,
            ),
            
            SizedBox(height: 16),
            Text('Action', style: Theme.of(context).textTheme.titleMedium),
            
            DropdownButtonFormField<String>(
              value: _actionType,
              items: [
                DropdownMenuItem(value: 'APPLY_LABEL', child: Text('Apply Label')),
                DropdownMenuItem(value: 'ARCHIVE', child: Text('Archive')),
                DropdownMenuItem(value: 'BLOCK_EMAIL', child: Text('Block Email')),
                DropdownMenuItem(value: 'WEBHOOK', child: Text('Call Webhook')),
              ],
              onChanged: (value) => setState(() {
                _actionType = value!;
                _actionParams = {};
              }),
            ),
            
            // Dynamic action parameters based on action type
            if (_actionType == 'APPLY_LABEL')
              TextFormField(
                decoration: InputDecoration(labelText: 'Label Name'),
                onSaved: (value) => _actionParams['label_name'] = value,
              ),
            
            if (_actionType == 'WEBHOOK')
              TextFormField(
                decoration: InputDecoration(labelText: 'Webhook URL'),
                onSaved: (value) => _actionParams['webhook_url'] = value,
              ),
            
            SizedBox(height: 24),
            
            ElevatedButton(
              onPressed: _saveRule,
              child: Text('Save Rule'),
            ),
          ],
        ),
      ),
    );
  }
  
  Future<void> _saveRule() async {
    if (!_formKey.currentState!.validate()) return;
    
    _formKey.currentState!.save();
    
    final rule = {
      'name': _name,
      'description': _description,
      'trigger_type': _triggerType,
      'category': _category,
      'from_pattern': _fromPattern,
      'action_type': _actionType,
      'action_params': _actionParams,
    };
    
    // Save via API
    await createAutomationRule(rule);
    
    Navigator.pop(context);
  }
}
```

#### 3.2 Blocklist Management

**File: `lib/screens/blocklist_screen.dart`**
```dart
// View and manage blocked emails
class BlocklistScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Blocked Emails'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () => _showAddBlockDialog(context),
          ),
        ],
      ),
      body: FutureBuilder<List<BlockedEmail>>(
        future: fetchBlocklist(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          
          final blocked = snapshot.data!;
          
          return ListView.builder(
            itemCount: blocked.length,
            itemBuilder: (context, index) {
              final item = blocked[index];
              
              return ListTile(
                leading: Icon(Icons.block, color: Colors.red),
                title: Text(item.email),
                subtitle: Text('Reason: ${item.reason}'),
                trailing: IconButton(
                  icon: Icon(Icons.delete),
                  onPressed: () async {
                    await unblockEmail(item.id);
                    // Refresh list
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
  
  void _showAddBlockDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) {
        String email = '';
        
        return AlertDialog(
          title: Text('Block Email'),
          content: TextField(
            decoration: InputDecoration(labelText: 'Email Address'),
            onChanged: (value) => email = value,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                await blockEmail(email, 'MANUAL');
                Navigator.pop(context);
              },
              child: Text('Block'),
            ),
          ],
        );
      },
    );
  }
}
```

## Production Hardening

### Security

1. **Environment Variables**
   - Never commit credentials
   - Use secret management (AWS Secrets Manager, HashiCorp Vault)
   - Rotate OAuth tokens regularly

2. **Rate Limiting**
   ```javascript
   fastify.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute',
     keyGenerator: (req) => req.user?.id || req.ip,
   });
   ```

3. **Input Validation**
   ```javascript
   const schema = {
     body: {
       type: 'object',
       required: ['name', 'trigger_type', 'action_type'],
       properties: {
         name: { type: 'string', minLength: 1, maxLength: 100 },
         trigger_type: { type: 'string', enum: ['EMAIL_RECEIVED', 'BOUNCE_DETECTED'] },
         // ...
       },
     },
   };
   
   fastify.post('/automation/rules', { schema }, async (request, reply) => {
     // Handler
   });
   ```

### Performance Optimization

1. **Database Indexes**
   - Already added in migrations
   - Monitor query performance with `EXPLAIN ANALYZE`

2. **Caching**
   ```javascript
   const Redis = require('ioredis');
   const redis = new Redis(process.env.REDIS_URL);
   
   // Cache mailbox configs
   async function getMailbox(id) {
     const cached = await redis.get(`mailbox:${id}`);
     if (cached) return JSON.parse(cached);
     
     const mailbox = await db.from('mailboxes').select('*').eq('id', id).single();
     await redis.setex(`mailbox:${id}`, 3600, JSON.stringify(mailbox));
     
     return mailbox;
   }
   ```

3. **Batch Processing**
   - Process emails in batches of 100
   - Use database transactions for consistency

### Monitoring

**File: `services/monitoring/metrics.js`**
```javascript
// Prometheus metrics
const client = require('prom-client');

const register = new client.Registry();

const emailsProcessed = new client.Counter({
  name: 'emails_processed_total',
  help: 'Total emails processed',
  labelNames: ['mailbox_id', 'category'],
  registers: [register],
});

const processingDuration = new client.Histogram({
  name: 'email_processing_duration_seconds',
  help: 'Email processing duration',
  registers: [register],
});

module.exports = {
  register,
  emailsProcessed,
  processingDuration,
};
```

### Deployment

**File: `docker-compose.yml`**
```yaml
version: '3.8'

services:
  api:
    build: ./services/api
    ports:
      - "3000:3000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
    depends_on:
      - redis
  
  worker:
    build: ./services/email-worker
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
    depends_on:
      - redis
  
  analytics:
    build: ./services/analytics
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Testing Checklist

- [ ] Automation rules execute correctly
- [ ] Hard bounces auto-block
- [ ] OAuth authentication works (Gmail, Outlook)
- [ ] Provider abstraction supports multiple providers
- [ ] Webhooks deliver successfully
- [ ] Retries work on webhook failure
- [ ] Performance is good under load
- [ ] Metrics are collected
- [ ] Error handling is robust

## Success Criteria

✅ Automation reduces manual work
✅ Multi-mailbox support operational
✅ Multiple providers supported
✅ Webhooks enable integrations
✅ System is production-ready
✅ Monitoring in place

## Conclusion

Phase 4 completes the MailSuite system with enterprise features. The platform is now production-ready, scalable, and extensible.
