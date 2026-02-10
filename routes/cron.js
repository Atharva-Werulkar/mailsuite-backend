/**
 * Cron endpoint for Vercel Cron Jobs
 * This endpoint is called by Vercel's cron scheduler every 5 minutes
 */

import { createClient } from "@supabase/supabase-js";
import { EnhancedEmailProcessor } from "../services/email-worker/enhanced-processor.js";
import { EmailProcessor } from "../services/email-worker/processor.js";

export default async function cronRoutes(fastify) {
  // Email sync cron job endpoint
  fastify.post("/cron/sync-emails", async (request, reply) => {
    console.log("\n🔄 Cron job triggered:", new Date().toISOString());

    // Verify request is from Vercel Cron (optional but recommended)
    const authHeader = request.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error("❌ Unauthorized cron request");
      return reply.status(401).send({ error: "Unauthorized" });
    }

    try {
      const db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );

      // Determine which processor to use
      const PROCESSOR_MODE = process.env.PROCESSOR_MODE || "enhanced";

      let processor;
      if (PROCESSOR_MODE === "legacy") {
        processor = new EmailProcessor(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
      } else {
        processor = new EnhancedEmailProcessor(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
      }

      console.log(`📋 Processor Mode: ${PROCESSOR_MODE.toUpperCase()}`);

      // Fetch all active mailboxes
      const { data: mailboxes, error } = await db
        .from("mailboxes")
        .select("id, email_address")
        .eq("status", "ACTIVE");

      if (error) {
        console.error("❌ Error fetching mailboxes:", error.message);
        return reply.status(500).send({ error: error.message });
      }

      if (!mailboxes || mailboxes.length === 0) {
        console.log("ℹ️  No active mailboxes to process");
        return reply.send({ status: "success", message: "No mailboxes" });
      }

      console.log(`📬 Found ${mailboxes.length} active mailbox(es)`);

      let processedCount = 0;
      let errorCount = 0;

      // Process each mailbox
      for (const mailbox of mailboxes) {
        try {
          await processor.processMailbox(mailbox.id);
          processedCount++;
        } catch (error) {
          console.error(
            `❌ Failed to process ${mailbox.email_address}:`,
            error.message,
          );
          errorCount++;
        }
      }

      console.log("✅ Email sync completed\n");

      return reply.send({
        status: "success",
        mailboxes: mailboxes.length,
        processed: processedCount,
        errors: errorCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Email sync failed:", error.message);
      return reply.status(500).send({
        status: "error",
        error: error.message,
      });
    }
  });
}
