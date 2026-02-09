/**
 * Email Threading Logic
 * Groups emails into conversations using In-Reply-To, References, and subject matching
 */

export class ThreadBuilder {
  constructor(db) {
    this.db = db;
  }

  /**
   * Find or create a thread for an email
   * @param {string} mailboxId - Mailbox UUID
   * @param {string} userId - User UUID
   * @param {Object} email - Email object
   * @returns {Promise<string>} Thread ID
   */
  async findOrCreateThread(mailboxId, userId, email) {
    try {
      // 1. Check if In-Reply-To references existing message
      if (email.inReplyTo) {
        const { data: parent } = await this.db
          .from("emails")
          .select("thread_id")
          .eq("mailbox_id", mailboxId)
          .eq("message_id", email.inReplyTo)
          .maybeSingle();

        if (parent?.thread_id) {
          console.log(`🧵 Found thread via In-Reply-To: ${parent.thread_id}`);
          return parent.thread_id;
        }
      }

      // 2. Check References header
      if (
        email.references &&
        Array.isArray(email.references) &&
        email.references.length > 0
      ) {
        const { data: referenced } = await this.db
          .from("emails")
          .select("thread_id")
          .eq("mailbox_id", mailboxId)
          .in("message_id", email.references)
          .limit(1)
          .maybeSingle();

        if (referenced?.thread_id) {
          console.log(
            `🧵 Found thread via References: ${referenced.thread_id}`,
          );
          return referenced.thread_id;
        }
      }

      // 3. Subject matching (fuzzy - remove Re:, Fwd:)
      const normalizedSubject = this.normalizeSubject(email.subject);

      if (normalizedSubject && normalizedSubject.length > 5) {
        // Look for threads with similar subject in last 7 days
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: similarThread } = await this.db
          .from("email_threads")
          .select("id")
          .eq("mailbox_id", mailboxId)
          .eq("normalized_subject", normalizedSubject)
          .gte("last_message_at", sevenDaysAgo)
          .limit(1)
          .maybeSingle();

        if (similarThread) {
          console.log(`🧵 Found thread via subject match: ${similarThread.id}`);
          return similarThread.id;
        }
      }

      // 4. Create new thread
      console.log(`🧵 Creating new thread for: ${email.subject}`);
      const { data: thread, error } = await this.db
        .from("email_threads")
        .insert({
          user_id: userId,
          mailbox_id: mailboxId,
          subject: email.subject || "(No Subject)",
          normalized_subject: normalizedSubject,
          participants: this.extractParticipants(email),
          first_message_at: email.receivedAt || new Date().toISOString(),
          last_message_at: email.receivedAt || new Date().toISOString(),
          message_count: 1,
          is_unread: true,
        })
        .select("id")
        .single();

      if (error) {
        console.error("❌ Error creating thread:", error);
        throw error;
      }

      console.log(`✅ Created new thread: ${thread.id}`);
      return thread.id;
    } catch (error) {
      console.error("❌ Error in findOrCreateThread:", error);
      throw error;
    }
  }

  /**
   * Normalize subject for matching
   * Removes Re:, Fwd:, [External], etc.
   * @param {string} subject
   * @returns {string}
   */
  normalizeSubject(subject) {
    if (!subject) return "";

    return subject
      .replace(/^(re|fwd|fw):\s*/gi, "")
      .replace(/\[external\]/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Extract unique participants from email
   * @param {Object} email
   * @returns {Array<string>}
   */
  extractParticipants(email) {
    const participants = new Set();

    // Add from address
    if (email.from) {
      participants.add(this.extractEmailAddress(email.from));
    }

    // Add to addresses
    if (Array.isArray(email.to)) {
      email.to.forEach((addr) => {
        participants.add(this.extractEmailAddress(addr));
      });
    }

    // Add cc addresses
    if (Array.isArray(email.cc)) {
      email.cc.forEach((addr) => {
        participants.add(this.extractEmailAddress(addr));
      });
    }

    return Array.from(participants).filter(Boolean);
  }

  /**
   * Extract email address from "Name <email@example.com>" format
   * @param {string} fullAddress
   * @returns {string}
   */
  extractEmailAddress(fullAddress) {
    if (!fullAddress) return "";

    const match = fullAddress.match(/<(.+?)>/);
    if (match) {
      return match[1].toLowerCase();
    }

    return fullAddress.trim().toLowerCase();
  }

  /**
   * Update thread statistics after adding a message
   * @param {string} threadId
   * @returns {Promise<void>}
   */
  async updateThreadStats(threadId) {
    try {
      // Get all messages in thread ordered by received_at
      const { data: messages, error: fetchError } = await this.db
        .from("emails")
        .select("received_at, is_read, from_address")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: false });

      if (fetchError) {
        console.error("❌ Error fetching thread messages:", fetchError);
        return;
      }

      if (!messages || messages.length === 0) {
        return;
      }

      // Calculate stats
      const messageCount = messages.length;
      const lastMessageAt = messages[0].received_at;
      const isUnread = messages.some((msg) => !msg.is_read);

      // Get unique participants
      const participants = [
        ...new Set(
          messages.map((msg) => this.extractEmailAddress(msg.from_address)),
        ),
      ].filter(Boolean);

      // Update thread
      const { error: updateError } = await this.db
        .from("email_threads")
        .update({
          message_count: messageCount,
          last_message_at: lastMessageAt,
          is_unread: isUnread,
          participants: participants,
        })
        .eq("id", threadId);

      if (updateError) {
        console.error("❌ Error updating thread stats:", updateError);
      } else {
        console.log(`✅ Updated thread ${threadId}: ${messageCount} messages`);
      }
    } catch (error) {
      console.error("❌ Error in updateThreadStats:", error);
    }
  }

  /**
   * Mark thread as read/unread
   * @param {string} threadId
   * @param {boolean} isRead
   * @returns {Promise<void>}
   */
  async markThreadAsRead(threadId, isRead) {
    try {
      const { error } = await this.db
        .from("email_threads")
        .update({ is_unread: !isRead })
        .eq("id", threadId);

      if (error) {
        console.error("❌ Error marking thread:", error);
      }
    } catch (error) {
      console.error("❌ Error in markThreadAsRead:", error);
    }
  }

  /**
   * Archive/unarchive thread
   * @param {string} threadId
   * @param {boolean} isArchived
   * @returns {Promise<void>}
   */
  async archiveThread(threadId, isArchived) {
    try {
      const { error } = await this.db
        .from("email_threads")
        .update({ is_archived: isArchived })
        .eq("id", threadId);

      if (error) {
        console.error("❌ Error archiving thread:", error);
      }
    } catch (error) {
      console.error("❌ Error in archiveThread:", error);
    }
  }
}
