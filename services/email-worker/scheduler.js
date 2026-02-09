import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cron from "node-cron";
import { EnhancedEmailProcessor } from "./enhanced-processor.js";
import { EmailProcessor } from "./processor.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);

// Enhanced processor includes all Phase 1 functionality + Phase 2 features
const enhancedProcessor = new EnhancedEmailProcessor(supabaseUrl, supabaseKey);

// Legacy Phase 1 processor (optional - only for testing/fallback)
const legacyProcessor = new EmailProcessor(supabaseUrl, supabaseKey);

// Configuration: Set to 'enhanced' (default), 'legacy', or 'both'
const PROCESSOR_MODE = process.env.PROCESSOR_MODE || "enhanced";

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("\n🔄 Starting email sync...", new Date().toISOString());
  console.log(`📋 Processor Mode: ${PROCESSOR_MODE.toUpperCase()}`);

  try {
    // Fetch all active mailboxes
    const { data: mailboxes, error } = await db
      .from("mailboxes")
      .select("id, email_address")
      .eq("status", "ACTIVE");

    if (error) {
      console.error("❌ Error fetching mailboxes:", error.message);
      return;
    }

    if (!mailboxes || mailboxes.length === 0) {
      console.log("ℹ️  No active mailboxes to process");
      return;
    }

    console.log(`📬 Found ${mailboxes.length} active mailbox(es)`);

    // Process each mailbox based on mode
    for (const mailbox of mailboxes) {
      try {
        if (PROCESSOR_MODE === "both") {
          // Run both processors (for migration/testing)
          console.log(
            `🔄 Running BOTH processors for ${mailbox.email_address}`,
          );

          // Phase 2: Enhanced processor (stores all emails + bounces)
          await enhancedProcessor.processMailbox(mailbox.id);

          // Phase 1: Legacy processor (only bounces - will skip duplicates)
          // This is redundant but kept for backward compatibility testing
          console.log(`📦 Running legacy bounce-only processor...`);
          await legacyProcessor.processMailbox(mailbox.id);
        } else if (PROCESSOR_MODE === "legacy") {
          // Phase 1 only (bounce detection only)
          console.log(`📦 Legacy mode: ${mailbox.email_address}`);
          await legacyProcessor.processMailbox(mailbox.id);
        } else {
          // Default: Enhanced processor (recommended)
          // This includes ALL Phase 1 functionality + Phase 2 features
          await enhancedProcessor.processMailbox(mailbox.id);
        }
      } catch (error) {
        console.error(
          `❌ Failed to process ${mailbox.email_address}:`,
          error.message,
        );
        // Continue with next mailbox
      }
    }

    console.log("✅ Email sync completed\n");
  } catch (error) {
    console.error("❌ Email sync failed:", error.message);
  }
});

console.log("🚀 Email worker scheduler started");
console.log(`⚙️  Processor Mode: ${PROCESSOR_MODE.toUpperCase()}`);
console.log("⏰ Running every 5 minutes");
console.log("\n💡 Processor Modes:");
console.log(
  "  - enhanced (default): Phase 2 - Full email processing + bounce detection",
);
console.log("  - legacy: Phase 1 - Bounce detection only");
console.log("  - both: Run both processors (for testing/migration)");
console.log("\n🔧 To change mode, set PROCESSOR_MODE environment variable\n");
