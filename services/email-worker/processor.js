import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../../utils/encryption.js";
import { BounceDetector } from "./bounce-detector.js";
import { ImapClient } from "./imap-client.js";

export class EmailProcessor {
  constructor(supabaseUrl, supabaseKey) {
    this.db = createClient(supabaseUrl, supabaseKey);
    this.bounceDetector = new BounceDetector();
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

      // 5. Process each message
      let bouncesFound = 0;
      let maxUid = mailbox.last_synced_uid;

      for (const message of messages) {
        if (message.uid > maxUid) {
          maxUid = message.uid;
        }

        if (this.bounceDetector.isBounceMessage(message)) {
          const bounceData = this.bounceDetector.parseBounce(message);

          if (bounceData.failedRecipient) {
            // Log diagnostic info for debugging
            console.log(
              `🔍 Bounce detected - Email: ${bounceData.failedRecipient}, Code: ${bounceData.errorCode}, Reason: ${bounceData.diagnostic.substring(0, 10000)}...`,
            );

            await this.processBounce(
              mailbox.id,
              mailbox.user_id,
              message,
              bounceData,
            );
            bouncesFound++;
          }
        }
      }

      // 6. Update last_synced_uid
      await this.db
        .from("mailboxes")
        .update({
          last_synced_uid: maxUid,
          status: "ACTIVE",
          last_error: null,
        })
        .eq("id", mailboxId);

      console.log(
        `✅ Processed ${messages.length} messages, found ${bouncesFound} bounces`,
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
        .single();

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
          console.error("Error inserting bounce:", insertError);
          return;
        }

        bounceId = newBounce.id;
        console.log(`🆕 New bounce recorded for ${bounceData.failedRecipient}`);
      }

      // 4. Create bounce event
      await this.db.from("email_bounce_events").insert({
        bounce_id: bounceId,
        user_id: userId,
        raw_message: message.body.slice(0, 5000), // Limit size
        detected_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error processing bounce:", error);
    }
  }
}
