/**
 * Enhanced Email Processor - Phase 2
 * Processes ALL emails with classification and threading
 * Maintains backward compatibility with Phase 1 bounce detection
 */

import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../../utils/encryption.js";
import { BounceDetector } from "./bounce-detector.js";
import { EmailClassifier } from "./classifier.js";
import { ImapClient } from "./imap-client.js";
import { ThreadBuilder } from "./thread-builder.js";

export class EnhancedEmailProcessor {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
    this.bounceDetector = new BounceDetector();
    this.classifier = new EmailClassifier();
    this.threadBuilder = new ThreadBuilder(this.db);
  }

  async processMailbox(mailboxId) {
    let imapClient = null;

    try {
      // 1. Fetch mailbox config
      const { data: mailbox, error: fetchError } = await this.db
        .from("mailboxes")
        .select("*")
        .eq("id", mailboxId)
        .eq("status", "ACTIVE")
        .single();

      if (fetchError || !mailbox) {
        console.error(`❌ Mailbox ${mailboxId} not found or inactive`);
        return;
      }

      console.log(`📬 Processing mailbox: ${mailbox.email_address}`);

      // 2. Decrypt IMAP credentials
      const decryptedPassword = decrypt(mailbox.imap_password_encrypted);

      // 3. Connect to IMAP
      imapClient = new ImapClient({
        host: mailbox.imap_host,
        port: mailbox.imap_port,
        username: mailbox.imap_username,
        password: decryptedPassword,
      });

      await imapClient.connect();

      // 4. Fetch messages since last_synced_uid
      const messages = await imapClient.fetchNewMessages(
        mailbox.last_synced_uid,
      );

      if (messages.length === 0) {
        console.log("✅ No new messages");
        return;
      }

      console.log(`📨 Processing ${messages.length} new messages...`);

      // 5. Process each message
      let processedCount = 0;
      let bouncesFound = 0;
      let maxUid = mailbox.last_synced_uid;

      for (const message of messages) {
        if (message.uid > maxUid) {
          maxUid = message.uid;
        }

        try {
          await this.processMessage(mailbox, message);
          processedCount++;

          // Count bounces separately for reporting
          if (this.bounceDetector.isBounceMessage(message)) {
            bouncesFound++;
          }
        } catch (error) {
          console.error(
            `❌ Error processing message UID ${message.uid}:`,
            error.message,
          );
        }
      }

      // 6. Update last_synced_uid and last_synced_at
      await this.db
        .from("mailboxes")
        .update({
          last_synced_uid: maxUid,
          last_synced_at: new Date().toISOString(),
          status: "ACTIVE",
          last_error: null,
        })
        .eq("id", mailboxId);

      console.log(
        `✅ Processed ${processedCount}/${messages.length} messages (${bouncesFound} bounces)`,
      );
    } catch (error) {
      console.error(`❌ Error processing mailbox ${mailboxId}:`, error.message);

      // Update mailbox with error status
      try {
        await this.db
          .from("mailboxes")
          .update({
            status: "ERROR",
            last_error: error.message,
          })
          .eq("id", mailboxId);
      } catch (dbError) {
        console.error(
          "❌ Failed to update mailbox error status:",
          dbError.message,
        );
      }
    } finally {
      if (imapClient) {
        try {
          await imapClient.disconnect();
        } catch (disconnectError) {
          console.error(
            "❌ Error during IMAP disconnect:",
            disconnectError.message,
          );
        }
      }
    }
  }

  /**
   * Normalize email address field to array
   */
  normalizeEmailArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return [];
  }

  /**
   * Process a single message: classify, thread, store, and handle bounces
   */
  async processMessage(mailbox, message) {
    try {
      // Check if message already exists
      const { data: existing } = await this.db
        .from("emails")
        .select("id")
        .eq("mailbox_id", mailbox.id)
        .eq("uid", message.uid)
        .maybeSingle();

      if (existing) {
        console.log(`⏭️  Skipping duplicate message UID ${message.uid}`);
        return;
      }

      // Normalize email address arrays (IMAP returns strings or arrays)
      message.to = this.normalizeEmailArray(message.to);
      message.cc = this.normalizeEmailArray(message.cc);
      message.bcc = this.normalizeEmailArray(message.bcc);
      message.references = this.normalizeEmailArray(message.references);

      // 1. Classify email
      const classification = this.classifier.classify(message);
      console.log(
        `🏷️  Classified as: ${classification.category} (${message.subject?.substring(0, 50)}...)`,
      );

      // 2. Find or create thread
      const threadId = await this.threadBuilder.findOrCreateThread(
        mailbox.id,
        mailbox.user_id,
        {
          subject: message.subject,
          from: message.from,
          to: message.to,
          cc: message.cc,
          inReplyTo: message.inReplyTo,
          references: message.references,
          receivedAt: message.receivedAt || new Date().toISOString(),
        },
      );

      // 3. Extract body preview (first 300 chars)
      const bodyPreview = this.extractPreview(message.body);

      // 4. Parse from address and name
      const { address: fromAddress, name: fromName } = this.parseFromAddress(
        message.from,
      );

      // 5. Store email
      const { data: email, error: insertError } = await this.db
        .from("emails")
        .insert({
          user_id: mailbox.user_id,
          mailbox_id: mailbox.id,
          uid: message.uid,
          message_id:
            message.messageId || `${message.uid}@${mailbox.imap_host}`,
          subject: message.subject || "(No Subject)",
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: message.to,
          cc_addresses: message.cc,
          bcc_addresses: message.bcc,
          category: classification.category,
          category_confidence: classification.confidence,
          thread_id: threadId,
          in_reply_to: message.inReplyTo,
          reference_ids: message.references,
          body_preview: bodyPreview,
          has_attachments:
            message.attachments && message.attachments.length > 0,
          is_read: false,
          is_starred: false,
          is_archived: false,
          received_at: message.receivedAt || new Date().toISOString(),
          sent_at:
            message.sentAt || message.receivedAt || new Date().toISOString(),
          size_bytes: message.size || 0,
          headers: message.headers || {},
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("❌ Error inserting email:", insertError);
        throw insertError;
      }

      console.log(`✅ Stored email: ${email.id}`);

      // 6. Update thread stats
      await this.threadBuilder.updateThreadStats(threadId);

      // 7. If BOUNCE category, also process as bounce (Phase 1 compatibility)
      if (classification.category === "BOUNCE") {
        const bounceData = this.bounceDetector.parseBounce(message);

        if (bounceData.failedRecipient) {
          console.log(
            `🔍 Processing bounce for: ${bounceData.failedRecipient}`,
          );
          await this.processBounce(
            mailbox.id,
            mailbox.user_id,
            message,
            bounceData,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error in processMessage:", error);
      throw error;
    }
  }

  /**
   * Extract preview text from email body (first 300 chars)
   */
  extractPreview(body) {
    if (!body) return "";

    // Remove HTML tags if present
    let text = body.replace(/<[^>]+>/g, " ");

    // Remove extra whitespace
    text = text.replace(/\s+/g, " ").trim();

    // Return first 300 chars
    return text.substring(0, 300);
  }

  /**
   * Parse "Name <email@example.com>" format
   */
  parseFromAddress(from) {
    if (!from) return { address: "", name: "" };

    const match = from.match(/^(.+?)\s*<(.+?)>$/);

    if (match) {
      return {
        name: match[1].replace(/['"]/g, "").trim(),
        address: match[2].trim().toLowerCase(),
      };
    }

    return {
      address: from.trim().toLowerCase(),
      name: from.trim().split("@")[0],
    };
  }

  /**
   * Process bounce (Phase 1 compatibility)
   */
  async processBounce(mailboxId, userId, message, bounceData) {
    try {
      // Validate email before processing
      if (!bounceData.failedRecipient) {
        console.warn("⚠️ No valid recipient email found, skipping bounce");
        return;
      }

      // 1. Check if bounce already exists
      const { data: existing } = await this.db
        .from("email_bounces")
        .select("id, failure_count")
        .eq("user_id", userId)
        .eq("mailbox_id", mailboxId)
        .eq("email", bounceData.failedRecipient)
        .maybeSingle();

      let bounceId;

      if (existing) {
        // 2. Update existing bounce using increment_failure function
        const { data: updated, error: updateError } = await this.db.rpc(
          "increment_failure",
          { bounce_id: existing.id },
        );

        if (updateError) {
          console.warn(
            "⚠️ increment_failure function not found, using direct update",
          );

          // Fallback: Update directly if function doesn't exist
          const { error: directUpdateError } = await this.db
            .from("email_bounces")
            .update({
              failure_count: existing.failure_count + 1,
              last_failed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (directUpdateError) {
            console.error("❌ Failed to update bounce:", directUpdateError);
            return;
          }
        }

        bounceId = existing.id;
        console.log(
          `📊 Incremented failure count for ${bounceData.failedRecipient}`,
        );
      } else {
        // 3. Create new bounce record
        const { data: newBounce, error: insertError } = await this.db
          .from("email_bounces")
          .insert({
            user_id: userId,
            mailbox_id: mailboxId,
            email: bounceData.failedRecipient,
            bounce_type: bounceData.bounceType,
            error_code: bounceData.errorCode,
            reason: bounceData.diagnostic,
            failure_count: 1,
            first_failed_at: new Date().toISOString(),
            last_failed_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("❌ Error inserting bounce:", insertError);
          return;
        }

        bounceId = newBounce.id;
        console.log(`🆕 New bounce recorded for ${bounceData.failedRecipient}`);
      }

      // 4. Create bounce event
      await this.db.from("email_bounce_events").insert({
        bounce_id: bounceId,
        user_id: userId,
        message_uid: message.uid,
        error_code: bounceData.errorCode,
        diagnostic: bounceData.diagnostic,
        occurred_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Error processing bounce:", error);
    }
  }
}
