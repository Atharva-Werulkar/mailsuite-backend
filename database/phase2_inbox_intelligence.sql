-- Phase 2: Inbox Intelligence Migration
-- Adapted for custom auth system (public.users)
-- Full email metadata storage
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    -- IMAP identifiers
    uid BIGINT NOT NULL,
    message_id TEXT NOT NULL,
    -- Email metadata
    subject TEXT,
    from_address TEXT NOT NULL,
    from_name TEXT,
    to_addresses TEXT [],
    -- Array of recipients
    cc_addresses TEXT [],
    bcc_addresses TEXT [],
    -- Classification
    category TEXT NOT NULL DEFAULT 'UNKNOWN',
    -- Categories: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER
    category_confidence DECIMAL(3, 2) DEFAULT 0.00,
    -- Threading
    thread_id UUID NULL REFERENCES email_threads(id) ON DELETE
    SET NULL,
        in_reply_to TEXT,
        -- Message-ID of parent
        references TEXT [],
        -- Array of referenced message IDs
        -- Content and flags
        body_preview TEXT,
        -- First 300 chars for list view
        has_attachments BOOLEAN DEFAULT FALSE,
        is_read BOOLEAN DEFAULT FALSE,
        is_starred BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        -- Timestamps
        received_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ,
        -- Metadata
        size_bytes BIGINT,
        headers JSONB,
        -- Store important headers as JSON
        created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
        updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
        CONSTRAINT emails_mailbox_uid_unique UNIQUE (mailbox_id, uid),
        CONSTRAINT emails_mailbox_message_id_unique UNIQUE (mailbox_id, message_id)
) TABLESPACE pg_default;
-- Indexes for emails table performance
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON public.emails USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emails_mailbox_received ON public.emails USING btree (mailbox_id, received_at DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emails_category ON public.emails USING btree (category) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emails_thread ON public.emails USING btree (thread_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emails_from ON public.emails USING btree (from_address) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON public.emails USING btree (is_read)
WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_emails_is_starred ON public.emails USING btree (is_starred)
WHERE is_starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_emails_user_category ON public.emails USING btree (user_id, category) TABLESPACE pg_default;
-- Email threads/conversations
CREATE TABLE IF NOT EXISTS public.email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    normalized_subject TEXT NOT NULL,
    -- Subject without Re:, Fwd:, etc.
    participants TEXT [],
    -- Array of email addresses
    message_count INT DEFAULT 1,
    first_message_at TIMESTAMPTZ NOT NULL,
    last_message_at TIMESTAMPTZ NOT NULL,
    -- Thread state
    is_unread BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
) TABLESPACE pg_default;
-- Indexes for threads table
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.email_threads USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_threads_mailbox ON public.email_threads USING btree (mailbox_id, last_message_at DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_threads_normalized_subject ON public.email_threads USING btree (normalized_subject) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_threads_is_unread ON public.email_threads USING btree (is_unread)
WHERE is_unread = TRUE;
-- Email labels/tags (for future filtering)
CREATE TABLE IF NOT EXISTS public.email_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    CONSTRAINT email_labels_mailbox_name_unique UNIQUE (mailbox_id, name)
) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_labels_user_id ON public.email_labels USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_labels_mailbox_id ON public.email_labels USING btree (mailbox_id) TABLESPACE pg_default;
-- Many-to-many: emails <-> labels
CREATE TABLE IF NOT EXISTS public.email_label_assignments (
    email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    PRIMARY KEY (email_id, label_id)
) TABLESPACE pg_default;
-- Trigger to update emails.updated_at
CREATE OR REPLACE FUNCTION update_emails_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = timezone('utc', now());
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tg_emails_updated_at BEFORE
UPDATE ON public.emails FOR EACH ROW EXECUTE FUNCTION update_emails_updated_at();
-- Trigger to update email_threads.updated_at
CREATE OR REPLACE FUNCTION update_email_threads_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = timezone('utc', now());
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tg_email_threads_updated_at BEFORE
UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION update_email_threads_updated_at();
-- Add comment to document categories
COMMENT ON COLUMN public.emails.category IS 'Email category: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER, UNKNOWN';