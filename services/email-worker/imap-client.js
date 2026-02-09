import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export class ImapClient {
  constructor(config) {
    this.config = {
      host: config.host,
      port: config.port || 993,
      secure: config.secure !== false,
      auth: {
        user: config.username,
        pass: config.password,
      },
      logger: false,
      // Add timeout configurations
      socketTimeout: 30000, // 30 seconds
      greetingTimeout: 15000, // 15 seconds
      connectionTimeout: 20000, // 20 seconds
    };
    this.client = null;
  }

  async connect() {
    try {
      console.log(
        `🔌 Connecting to IMAP server: ${this.config.host}:${this.config.port} as ${this.config.auth.user}`,
      );
      this.client = new ImapFlow(this.config);

      // Add error event listener to prevent unhandled errors
      this.client.on("error", (err) => {
        console.error("❌ IMAP client error:", err.message);
      });

      // Add close event listener
      this.client.on("close", () => {
        console.log("🔌 IMAP connection closed");
      });

      await this.client.connect();
      console.log("✅ IMAP connected");
      return true;
    } catch (error) {
      console.error("❌ IMAP connection failed:", error.message);
      throw new Error(`IMAP connection failed: ${error.message}`);
    }
  }

  async fetchNewMessages(lastUid = 0, options = {}) {
    if (!this.client) {
      throw new Error("IMAP client not connected");
    }

    const {
      batchSize = parseInt(process.env.EMAIL_BATCH_SIZE) || 100,
      sinceDays = parseInt(process.env.EMAIL_FETCH_DAYS) || 30,
    } = options;

    try {
      await this.client.mailboxOpen("INBOX");
      console.log("📬 Mailbox INBOX opened");

      // Calculate date for SINCE filter (only fetch emails from last N days)
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - sinceDays);

      // Format date for IMAP SINCE (DD-MMM-YYYY format, e.g., "06-Jan-2026")
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const sinceDateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;

      console.log(
        `🔍 Fetching emails since ${sinceDateStr} (last ${sinceDays} days), max ${batchSize} messages`,
      );

      // Build search criteria with date filter
      let searchCriteria;
      if (lastUid > 0) {
        // Fetch UIDs greater than lastUid AND since the date
        searchCriteria = {
          uid: `${lastUid + 1}:*`,
          since: sinceDateStr,
        };
      } else {
        // First sync - only fetch from last N days
        searchCriteria = {
          since: sinceDateStr,
        };
      }

      const messages = [];
      let fetchCount = 0;

      for await (let message of this.client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        // Enforce batch size limit
        if (fetchCount >= batchSize) {
          console.log(
            `⚠️ Reached batch limit of ${batchSize} messages, stopping fetch`,
          );
          break;
        }

        try {
          const parsed = await simpleParser(message.source);

          messages.push({
            uid: message.uid,
            messageId: parsed.messageId || message.envelope.messageId,
            subject: parsed.subject || "",
            from: parsed.from?.text || "",
            to: parsed.to?.text || "",
            body: parsed.text || parsed.html || "",
            headers: parsed.headers,
            receivedDate: parsed.date || new Date(),
          });

          fetchCount++;

          console.log(
            `📩 Fetched message ${fetchCount}/${batchSize} - UID: ${message.uid}, Subject: ${parsed.subject}`,
          );
        } catch (parseError) {
          console.error(
            `Failed to parse message ${message.uid}:`,
            parseError.message,
          );
        }
      }

      console.log(
        `📧 Fetched ${messages.length} new messages (limited to last ${sinceDays} days)`,
      );
      return messages;
    } catch (error) {
      console.error("Error fetching messages:", error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        // Remove error listeners before logout
        this.client.removeAllListeners("error");
        this.client.removeAllListeners("close");

        await this.client.logout();
        console.log("✅ IMAP disconnected");
      } catch (error) {
        console.error("Error disconnecting IMAP:", error.message);
      } finally {
        this.client = null;
      }
    }
  }
}
