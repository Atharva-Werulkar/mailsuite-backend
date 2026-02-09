# Phase 3: Analytics & SLA Tracking

## Overview
Add advanced analytics, response-time tracking, SLA monitoring, and alerting capabilities to provide actionable insights into inbox performance.

## Prerequisites
✅ Phase 1 and 2 completed
✅ Full inbox ingestion working
✅ Email classification operational
✅ Thread grouping functional

## Database Schema Additions

**File: `migrations/phase3_analytics_sla.sql`**
```sql
-- Response time tracking
create table if not exists email_responses (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  thread_id uuid not null references email_threads(id) on delete cascade,
  
  -- Original message (incoming)
  received_email_id uuid not null references emails(id) on delete cascade,
  received_at timestamptz not null,
  
  -- Response message (outgoing)
  response_email_id uuid references emails(id) on delete set null,
  responded_at timestamptz,
  
  -- Response time metrics
  response_time_seconds bigint,
  response_time_business_hours bigint, -- Exclude weekends/nights
  
  -- SLA tracking
  sla_target_seconds bigint, -- Expected response time
  sla_met boolean,
  
  -- Status
  status text not null default 'PENDING', -- PENDING, RESPONDED, OVERDUE
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index idx_responses_status on email_responses(status);
create index idx_responses_thread on email_responses(thread_id);
create index idx_responses_mailbox on email_responses(mailbox_id, received_at desc);

-- SLA rules configuration
create table if not exists sla_rules (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete cascade, -- null = applies to all
  
  name text not null,
  description text,
  
  -- Conditions
  email_category text, -- HUMAN, TRANSACTIONAL, etc. (null = all)
  from_domain text, -- Apply to emails from specific domain
  priority text default 'NORMAL', -- HIGH, NORMAL, LOW
  
  -- SLA targets (in seconds)
  first_response_target bigint not null, -- e.g. 3600 = 1 hour
  
  -- Business hours settings
  use_business_hours boolean default true,
  business_hours_start int default 9, -- 9 AM
  business_hours_end int default 17, -- 5 PM
  business_days int[] default '{1,2,3,4,5}', -- Mon-Fri
  
  is_active boolean default true,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- Analytics aggregations (for performance)
create table if not exists analytics_daily_summary (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  
  date date not null,
  
  -- Volume metrics
  total_received int default 0,
  total_sent int default 0,
  
  -- By category
  human_count int default 0,
  transactional_count int default 0,
  notification_count int default 0,
  marketing_count int default 0,
  bounce_count int default 0,
  
  -- Response metrics
  responses_sent int default 0,
  avg_response_time_seconds bigint,
  median_response_time_seconds bigint,
  sla_met_count int default 0,
  sla_missed_count int default 0,
  
  -- Thread metrics
  new_threads_count int default 0,
  active_threads_count int default 0,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  
  unique (mailbox_id, date)
);

create index idx_analytics_mailbox_date on analytics_daily_summary(mailbox_id, date desc);

-- Alerts configuration
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete cascade,
  
  name text not null,
  
  -- Alert type
  type text not null, -- SLA_BREACH, HIGH_BOUNCE_RATE, PENDING_BACKLOG, VOLUME_SPIKE
  
  -- Conditions
  threshold_value numeric,
  threshold_operator text, -- GT, LT, EQ
  
  -- Notification settings
  notify_email boolean default true,
  notify_webhook boolean default false,
  webhook_url text,
  
  -- State
  is_active boolean default true,
  last_triggered_at timestamptz,
  
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- Alert events log
create table if not exists alert_events (
  id uuid primary key default gen_random_uuid(),
  
  alert_id uuid not null references alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  
  message text not null,
  data jsonb, -- Additional context
  
  notified boolean default false,
  
  created_at timestamptz default timezone('utc', now())
);

create index idx_alert_events_alert on alert_events(alert_id, created_at desc);

-- Helper function: Calculate business hours between two timestamps
create or replace function calculate_business_hours(
  start_time timestamptz,
  end_time timestamptz,
  business_start int default 9,
  business_end int default 17,
  business_days int[] default '{1,2,3,4,5}'
)
returns bigint as $$
declare
  total_seconds bigint := 0;
  current_time timestamptz := start_time;
  day_of_week int;
  hour_of_day int;
begin
  while current_time < end_time loop
    day_of_week := extract(isodow from current_time);
    hour_of_day := extract(hour from current_time);
    
    -- Check if current time is within business hours
    if day_of_week = any(business_days) and 
       hour_of_day >= business_start and 
       hour_of_day < business_end then
      total_seconds := total_seconds + 1;
    end if;
    
    current_time := current_time + interval '1 second';
  end loop;
  
  return total_seconds;
end;
$$ language plpgsql;
```

## What You Need to Build

### 1. Backend Services

#### 1.1 Response Time Tracker

**File: `services/analytics/response-tracker.js`**
```javascript
// Track email responses and calculate response times
// Requirements:
// - Detect when an email is a response to an earlier email
// - Calculate response time (total and business hours)
// - Check against SLA rules
// - Update email_responses table

const { createClient } = require('@supabase/supabase-js');

class ResponseTracker {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async trackResponse(email) {
    // 1. Check if this email is an outgoing response
    if (!this.isOutgoingEmail(email)) {
      return; // Only track outgoing emails
    }
    
    // 2. Find the original incoming email in the thread
    const originalEmail = await this.findOriginalIncomingEmail(email.threadId);
    
    if (!originalEmail) {
      return; // No incoming email to respond to
    }
    
    // 3. Check if response already tracked
    const existing = await this.db
      .from('email_responses')
      .select('id')
      .eq('received_email_id', originalEmail.id)
      .single();
    
    if (existing) {
      // Update existing response
      return this.updateResponse(existing.id, email);
    }
    
    // 4. Calculate response time
    const responseTimeSeconds = this.calculateResponseTime(
      originalEmail.receivedAt,
      email.sentAt
    );
    
    // 5. Get applicable SLA rule
    const slaRule = await this.getSlaRule(email.mailboxId, originalEmail);
    
    // 6. Calculate business hours response time
    const businessHoursResponseTime = slaRule?.use_business_hours
      ? await this.calculateBusinessHoursResponseTime(
          originalEmail.receivedAt,
          email.sentAt,
          slaRule
        )
      : responseTimeSeconds;
    
    // 7. Check SLA compliance
    const slaMet = slaRule
      ? businessHoursResponseTime <= slaRule.first_response_target
      : null;
    
    // 8. Insert response record
    const response = await this.db
      .from('email_responses')
      .insert({
        user_id: email.userId,
        mailbox_id: email.mailboxId,
        thread_id: email.threadId,
        received_email_id: originalEmail.id,
        received_at: originalEmail.receivedAt,
        response_email_id: email.id,
        responded_at: email.sentAt,
        response_time_seconds: responseTimeSeconds,
        response_time_business_hours: businessHoursResponseTime,
        sla_target_seconds: slaRule?.first_response_target,
        sla_met: slaMet,
        status: 'RESPONDED',
      })
      .select()
      .single();
    
    // 9. Check if SLA was breached and trigger alert
    if (slaMet === false) {
      await this.triggerSlaBreachAlert(response);
    }
    
    return response;
  }
  
  isOutgoingEmail(email) {
    // Check if email is sent (not received)
    // This requires knowing user's email addresses
    // Simple heuristic: check if from_address matches mailbox
  }
  
  async findOriginalIncomingEmail(threadId) {
    // Find first incoming (non-sent) email in thread
    const { data } = await this.db
      .from('emails')
      .select('*')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true })
      .limit(1);
    
    return data?.[0];
  }
  
  calculateResponseTime(receivedAt, respondedAt) {
    return Math.floor(
      (new Date(respondedAt) - new Date(receivedAt)) / 1000
    );
  }
  
  async calculateBusinessHoursResponseTime(receivedAt, respondedAt, slaRule) {
    // Call PostgreSQL function
    const { data } = await this.db.rpc('calculate_business_hours', {
      start_time: receivedAt,
      end_time: respondedAt,
      business_start: slaRule.business_hours_start,
      business_end: slaRule.business_hours_end,
      business_days: slaRule.business_days,
    });
    
    return data;
  }
  
  async getSlaRule(mailboxId, email) {
    // Find applicable SLA rule
    const { data } = await this.db
      .from('sla_rules')
      .select('*')
      .eq('is_active', true)
      .or(`mailbox_id.eq.${mailboxId},mailbox_id.is.null`)
      .or(`email_category.eq.${email.category},email_category.is.null`)
      .order('priority', { ascending: false })
      .limit(1)
      .single();
    
    return data;
  }
  
  async trackPendingResponses() {
    // Find emails awaiting response
    // Create PENDING response records
    
    const { data: incomingEmails } = await this.db
      .from('emails')
      .select('*, email_threads!inner(*)')
      .eq('category', 'HUMAN')
      .is('response_email_id', null); // Not yet responded
    
    for (const email of incomingEmails) {
      // Check if response record exists
      const { data: existing } = await this.db
        .from('email_responses')
        .select('id')
        .eq('received_email_id', email.id)
        .single();
      
      if (!existing) {
        // Create pending response
        const slaRule = await this.getSlaRule(email.mailboxId, email);
        
        await this.db
          .from('email_responses')
          .insert({
            user_id: email.userId,
            mailbox_id: email.mailboxId,
            thread_id: email.threadId,
            received_email_id: email.id,
            received_at: email.receivedAt,
            sla_target_seconds: slaRule?.first_response_target,
            status: 'PENDING',
          });
      }
    }
  }
  
  async updateOverdueStatus() {
    // Mark pending responses as OVERDUE if past SLA
    const now = new Date();
    
    const { data: pending } = await this.db
      .from('email_responses')
      .select('*')
      .eq('status', 'PENDING')
      .not('sla_target_seconds', 'is', null);
    
    for (const response of pending) {
      const elapsedSeconds = Math.floor(
        (now - new Date(response.received_at)) / 1000
      );
      
      if (elapsedSeconds > response.sla_target_seconds) {
        await this.db
          .from('email_responses')
          .update({ status: 'OVERDUE' })
          .eq('id', response.id);
        
        await this.triggerSlaBreachAlert(response);
      }
    }
  }
  
  async triggerSlaBreachAlert(response) {
    // Find applicable alert rules and trigger them
    // (Implementation in alert service)
  }
}

module.exports = ResponseTracker;
```

#### 1.2 Analytics Aggregator

**File: `services/analytics/aggregator.js`**
```javascript
// Daily analytics aggregation
// Requirements:
// - Run daily to aggregate previous day's metrics
// - Calculate volume, response time, SLA metrics
// - Store in analytics_daily_summary

class AnalyticsAggregator {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async aggregateDay(date, mailboxId) {
    // date: YYYY-MM-DD format
    
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);
    
    // 1. Count emails received
    const { data: received } = await this.db
      .from('emails')
      .select('category')
      .eq('mailbox_id', mailboxId)
      .gte('received_at', startOfDay.toISOString())
      .lte('received_at', endOfDay.toISOString());
    
    // 2. Count by category
    const categoryCounts = this.countByCategory(received);
    
    // 3. Response metrics
    const { data: responses } = await this.db
      .from('email_responses')
      .select('response_time_seconds, sla_met')
      .eq('mailbox_id', mailboxId)
      .gte('responded_at', startOfDay.toISOString())
      .lte('responded_at', endOfDay.toISOString());
    
    const responseTimes = responses.map(r => r.response_time_seconds).filter(Boolean);
    const avgResponseTime = responseTimes.length > 0
      ? Math.floor(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;
    
    const medianResponseTime = this.calculateMedian(responseTimes);
    
    const slaMetCount = responses.filter(r => r.sla_met === true).length;
    const slaMissedCount = responses.filter(r => r.sla_met === false).length;
    
    // 4. Thread metrics
    const { data: newThreads } = await this.db
      .from('email_threads')
      .select('id')
      .eq('mailbox_id', mailboxId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
    
    const { data: activeThreads } = await this.db
      .from('email_threads')
      .select('id')
      .eq('mailbox_id', mailboxId)
      .gte('last_message_at', startOfDay.toISOString())
      .lte('last_message_at', endOfDay.toISOString());
    
    // 5. Upsert summary
    const { data: mailbox } = await this.db
      .from('mailboxes')
      .select('user_id')
      .eq('id', mailboxId)
      .single();
    
    await this.db
      .from('analytics_daily_summary')
      .upsert({
        user_id: mailbox.user_id,
        mailbox_id: mailboxId,
        date,
        total_received: received.length,
        total_sent: responses.length,
        human_count: categoryCounts.HUMAN || 0,
        transactional_count: categoryCounts.TRANSACTIONAL || 0,
        notification_count: categoryCounts.NOTIFICATION || 0,
        marketing_count: categoryCounts.MARKETING || 0,
        bounce_count: categoryCounts.BOUNCE || 0,
        responses_sent: responses.length,
        avg_response_time_seconds: avgResponseTime,
        median_response_time_seconds: medianResponseTime,
        sla_met_count: slaMetCount,
        sla_missed_count: slaMissedCount,
        new_threads_count: newThreads.length,
        active_threads_count: activeThreads.length,
      }, {
        onConflict: 'mailbox_id,date'
      });
  }
  
  countByCategory(emails) {
    return emails.reduce((acc, email) => {
      acc[email.category] = (acc[email.category] || 0) + 1;
      return acc;
    }, {});
  }
  
  calculateMedian(numbers) {
    if (numbers.length === 0) return null;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  
  async runDailyAggregation() {
    // Run for yesterday for all mailboxes
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const { data: mailboxes } = await this.db
      .from('mailboxes')
      .select('id')
      .eq('status', 'ACTIVE');
    
    for (const mailbox of mailboxes) {
      await this.aggregateDay(dateStr, mailbox.id);
    }
  }
}

module.exports = AnalyticsAggregator;
```

#### 1.3 Alert System

**File: `services/analytics/alert-manager.js`**
```javascript
// Alert evaluation and triggering
// Requirements:
// - Evaluate alert conditions
// - Trigger notifications (email, webhook)
// - Log alert events

class AlertManager {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
  }
  
  async evaluateAlerts() {
    const { data: alerts } = await this.db
      .from('alerts')
      .select('*')
      .eq('is_active', true);
    
    for (const alert of alerts) {
      await this.evaluateAlert(alert);
    }
  }
  
  async evaluateAlert(alert) {
    let triggered = false;
    let message = '';
    let data = {};
    
    switch (alert.type) {
      case 'SLA_BREACH':
        const result = await this.checkSlaBreaches(alert);
        triggered = result.triggered;
        message = result.message;
        data = result.data;
        break;
      
      case 'HIGH_BOUNCE_RATE':
        // Check if bounce rate exceeds threshold
        break;
      
      case 'PENDING_BACKLOG':
        // Check if pending responses exceed threshold
        break;
      
      case 'VOLUME_SPIKE':
        // Check if email volume increased significantly
        break;
    }
    
    if (triggered) {
      await this.triggerAlert(alert, message, data);
    }
  }
  
  async checkSlaBreaches(alert) {
    // Count SLA breaches in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const { data: breaches } = await this.db
      .from('email_responses')
      .select('*')
      .eq('sla_met', false)
      .gte('responded_at', oneHourAgo.toISOString());
    
    if (alert.mailbox_id) {
      breaches = breaches.filter(b => b.mailbox_id === alert.mailbox_id);
    }
    
    const triggered = this.compareThreshold(
      breaches.length,
      alert.threshold_value,
      alert.threshold_operator
    );
    
    return {
      triggered,
      message: `${breaches.length} SLA breaches in the last hour`,
      data: { breach_count: breaches.length }
    };
  }
  
  compareThreshold(value, threshold, operator) {
    switch (operator) {
      case 'GT': return value > threshold;
      case 'LT': return value < threshold;
      case 'EQ': return value === threshold;
      case 'GTE': return value >= threshold;
      case 'LTE': return value <= threshold;
      default: return false;
    }
  }
  
  async triggerAlert(alert, message, data) {
    // 1. Log alert event
    await this.db
      .from('alert_events')
      .insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        message,
        data,
      });
    
    // 2. Send notifications
    if (alert.notify_email) {
      await this.sendEmailNotification(alert, message);
    }
    
    if (alert.notify_webhook && alert.webhook_url) {
      await this.sendWebhookNotification(alert, message, data);
    }
    
    // 3. Update last_triggered_at
    await this.db
      .from('alerts')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', alert.id);
  }
  
  async sendEmailNotification(alert, message) {
    // Send email via SMTP or service like SendGrid
  }
  
  async sendWebhookNotification(alert, message, data) {
    // POST to webhook_url
    await fetch(alert.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_id: alert.id,
        alert_name: alert.name,
        message,
        data,
        timestamp: new Date().toISOString(),
      }),
    });
  }
}

module.exports = AlertManager;
```

#### 1.4 Scheduled Jobs

**File: `services/analytics/scheduler.js`**
```javascript
// Cron jobs for analytics
const cron = require('node-cron');
const ResponseTracker = require('./response-tracker');
const AnalyticsAggregator = require('./aggregator');
const AlertManager = require('./alert-manager');

const tracker = new ResponseTracker(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const aggregator = new AnalyticsAggregator(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const alertManager = new AlertManager(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Track pending responses every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('Tracking pending responses...');
  await tracker.trackPendingResponses();
  await tracker.updateOverdueStatus();
});

// Evaluate alerts every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('Evaluating alerts...');
  await alertManager.evaluateAlerts();
});

// Daily aggregation at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running daily analytics aggregation...');
  await aggregator.runDailyAggregation();
});
```

### 2. API Endpoints

**File: `services/api/routes/analytics.js`**
```javascript
// Analytics API endpoints
// Requirements:
// - GET /analytics/summary - Overall metrics
// - GET /analytics/response-times - Response time trends
// - GET /analytics/sla - SLA compliance metrics
// - GET /analytics/volume - Email volume trends

async function routes(fastify, options) {
  
  // GET /analytics/summary?mailbox_id=xxx&period=7d
  fastify.get('/analytics/summary', async (request, reply) => {
    const { mailbox_id, period = '7d' } = request.query;
    const days = parseInt(period.replace('d', ''));
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let query = this.db
      .from('analytics_daily_summary')
      .select('*')
      .eq('user_id', request.user.id)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });
    
    if (mailbox_id) {
      query = query.eq('mailbox_id', mailbox_id);
    }
    
    const { data } = await query;
    
    // Aggregate totals
    const summary = {
      total_received: data.reduce((sum, d) => sum + d.total_received, 0),
      total_sent: data.reduce((sum, d) => sum + d.total_sent, 0),
      avg_response_time: this.calculateAverage(data.map(d => d.avg_response_time_seconds)),
      sla_compliance_rate: this.calculateSlaRate(data),
      daily_data: data,
    };
    
    return summary;
  });
  
  // GET /analytics/response-times?mailbox_id=xxx&period=7d
  fastify.get('/analytics/response-times', async (request, reply) => {
    const { mailbox_id, period = '7d' } = request.query;
    const days = parseInt(period.replace('d', ''));
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let query = this.db
      .from('email_responses')
      .select('responded_at, response_time_seconds, response_time_business_hours')
      .eq('user_id', request.user.id)
      .eq('status', 'RESPONDED')
      .gte('responded_at', startDate.toISOString())
      .order('responded_at', { ascending: true });
    
    if (mailbox_id) {
      query = query.eq('mailbox_id', mailbox_id);
    }
    
    const { data } = await query;
    
    // Group by day
    const grouped = this.groupByDay(data);
    
    return grouped;
  });
  
  // GET /analytics/sla?mailbox_id=xxx
  fastify.get('/analytics/sla', async (request, reply) => {
    const { mailbox_id } = request.query;
    
    let query = this.db
      .from('email_responses')
      .select('sla_met, status')
      .eq('user_id', request.user.id);
    
    if (mailbox_id) {
      query = query.eq('mailbox_id', mailbox_id);
    }
    
    const { data } = await query;
    
    const metrics = {
      total: data.length,
      met: data.filter(d => d.sla_met === true).length,
      missed: data.filter(d => d.sla_met === false).length,
      pending: data.filter(d => d.status === 'PENDING').length,
      overdue: data.filter(d => d.status === 'OVERDUE').length,
    };
    
    metrics.compliance_rate = metrics.total > 0
      ? (metrics.met / (metrics.met + metrics.missed)) * 100
      : 0;
    
    return metrics;
  });
  
  // GET /analytics/volume?mailbox_id=xxx&period=30d
  fastify.get('/analytics/volume', async (request, reply) => {
    // Similar to summary but focused on volume trends
  });
  
}

module.exports = routes;
```

**File: `services/api/routes/sla.js`**
```javascript
// SLA rule management
// Requirements:
// - POST /sla/rules - Create SLA rule
// - GET /sla/rules - List rules
// - PUT /sla/rules/:id - Update rule
// - DELETE /sla/rules/:id - Delete rule

async function routes(fastify, options) {
  
  fastify.post('/sla/rules', async (request, reply) => {
    const rule = request.body;
    
    const { data } = await this.db
      .from('sla_rules')
      .insert({
        ...rule,
        user_id: request.user.id,
      })
      .select()
      .single();
    
    return data;
  });
  
  fastify.get('/sla/rules', async (request, reply) => {
    const { data } = await this.db
      .from('sla_rules')
      .select('*')
      .eq('user_id', request.user.id)
      .order('created_at', { ascending: false });
    
    return data;
  });
  
  // PUT, DELETE endpoints...
}

module.exports = routes;
```

### 3. Frontend (Flutter)

#### 3.1 Analytics Dashboard

**File: `lib/screens/analytics_dashboard.dart`**
```dart
// Main analytics screen
// Requirements:
// - Response time charts
// - SLA compliance metrics
// - Volume trends
// - Pending responses list

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

class AnalyticsDashboard extends StatefulWidget {
  @override
  _AnalyticsDashboardState createState() => _AnalyticsDashboardState();
}

class _AnalyticsDashboardState extends State<AnalyticsDashboard> {
  String selectedPeriod = '7d';
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Analytics'),
        actions: [
          DropdownButton<String>(
            value: selectedPeriod,
            items: ['7d', '30d', '90d'].map((period) {
              return DropdownMenuItem(value: period, child: Text(period));
            }).toList(),
            onChanged: (value) {
              setState(() => selectedPeriod = value!);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Refresh analytics
        },
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            // SLA Compliance Card
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SLA Compliance', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    SlaComplianceWidget(),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Response Time Trend
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Average Response Time', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    ResponseTimeChart(period: selectedPeriod),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Volume Trend
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Email Volume', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    VolumeChart(period: selectedPeriod),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Pending Responses
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pending Responses', style: Theme.of(context).textTheme.titleLarge),
                    SizedBox(height: 16),
                    PendingResponsesList(),
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

**File: `lib/widgets/sla_compliance_widget.dart`**
```dart
// SLA compliance visualization
class SlaComplianceWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<SlaMetrics>(
      future: fetchSlaMetrics(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return CircularProgressIndicator();
        
        final metrics = snapshot.data!;
        
        return Column(
          children: [
            // Circular compliance rate indicator
            SizedBox(
              height: 200,
              child: PieChart(
                PieChartData(
                  sections: [
                    PieChartSectionData(
                      value: metrics.met.toDouble(),
                      title: '${metrics.complianceRate.toStringAsFixed(1)}%',
                      color: Colors.green,
                      radius: 80,
                    ),
                    PieChartSectionData(
                      value: metrics.missed.toDouble(),
                      title: '',
                      color: Colors.red,
                      radius: 80,
                    ),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 16),
            
            // Stats
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _StatItem('Met', metrics.met, Colors.green),
                _StatItem('Missed', metrics.missed, Colors.red),
                _StatItem('Pending', metrics.pending, Colors.orange),
                _StatItem('Overdue', metrics.overdue, Colors.deepOrange),
              ],
            ),
          ],
        );
      },
    );
  }
  
  Widget _StatItem(String label, int value, Color color) {
    return Column(
      children: [
        Text(value.toString(), style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }
}
```

**File: `lib/widgets/response_time_chart.dart`**
```dart
// Line chart showing response time trends
class ResponseTimeChart extends StatelessWidget {
  final String period;
  
  ResponseTimeChart({required this.period});
  
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ResponseTimeData>>(
      future: fetchResponseTimeData(period),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return CircularProgressIndicator();
        
        final data = snapshot.data!;
        
        return SizedBox(
          height: 200,
          child: LineChart(
            LineChartData(
              lineBarsData: [
                LineChartBarData(
                  spots: data.asMap().entries.map((entry) {
                    return FlSpot(entry.key.toDouble(), entry.value.avgSeconds / 3600); // Convert to hours
                  }).toList(),
                  isCurved: true,
                  color: Colors.blue,
                  dotData: FlDotData(show: false),
                ),
              ],
              titlesData: FlTitlesData(
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      if (value.toInt() >= data.length) return Text('');
                      return Text(data[value.toInt()].date);
                    },
                  ),
                ),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) => Text('${value.toInt()}h'),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
```

#### 3.2 SLA Configuration Screen

**File: `lib/screens/sla_config_screen.dart`**
```dart
// SLA rule management
class SlaConfigScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('SLA Rules'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => AddSlaRuleScreen()),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<List<SlaRule>>(
        future: fetchSlaRules(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          
          final rules = snapshot.data!;
          
          return ListView.builder(
            itemCount: rules.length,
            itemBuilder: (context, index) {
              return SlaRuleCard(rule: rules[index]);
            },
          );
        },
      ),
    );
  }
}
```

## Testing Checklist

- [ ] Response times are calculated correctly
- [ ] Business hours calculation is accurate
- [ ] SLA rules are applied correctly
- [ ] Pending responses are tracked
- [ ] Overdue emails are flagged
- [ ] Daily aggregation runs successfully
- [ ] Analytics charts display correctly
- [ ] Alerts trigger appropriately
- [ ] SLA configuration UI works
- [ ] Performance is acceptable with large datasets

## Success Criteria

✅ Response times tracked for all conversations
✅ SLA compliance measured accurately
✅ Analytics dashboard provides insights
✅ Alerts notify users of issues
✅ Users can configure SLA rules
✅ Historical trends are visible

## Next: Phase 4
Proceed to Phase 4 for automation and multi-provider support.
