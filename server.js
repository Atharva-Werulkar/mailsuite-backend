import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import Fastify from "fastify";

import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import bounceRoutes from "./routes/bounces.js";
import emailRoutes from "./routes/emails.js";
import mailboxRoutes from "./routes/mailboxes.js";
import threadRoutes from "./routes/threads.js";
import { supabaseAdmin } from "./services/supabaseClient.js";

// Import email worker
import { createClient } from "@supabase/supabase-js";
import cron from "node-cron";
import { EmailProcessor } from "./services/email-worker/processor.js";

dotenv.config();

// Global error handlers to prevent process crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

const app = Fastify({ logger: true });

// CORS
app.register(cors, { origin: true });

// Rate limiting
app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Decorate fastify with supabase client
app.decorate("supabase", supabaseAdmin);

// Public routes (no auth required)
app.get("/health", async (request, reply) => {
  return reply.send({ status: "ok", timestamp: new Date().toISOString() });
});

// 🔐 Auth (applies to ALL routes after this)
app.register(authPlugin);

// Protected routes
app.register(authRoutes, { prefix: "/api/v1" });
app.register(bounceRoutes, { prefix: "/api/v1" });
app.register(mailboxRoutes, { prefix: "/api/v1" });
app.register(threadRoutes, { prefix: "/api/v1" });
app.register(emailRoutes, { prefix: "/api/v1" });

const PORT = process.env.PORT || 3000;

// Start API server
app.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 API running on port ${PORT}`);

  // Start email worker after server starts
  startEmailWorker();
});

// Email Worker
function startEmailWorker() {
  const processor = new EmailProcessor(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  console.log("📧 Email worker scheduler started");
  console.log("⏰ Running every 5 minutes");

  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log("\n🔄 Starting email sync...", new Date().toISOString());

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

      // Process each mailbox
      for (const mailbox of mailboxes) {
        try {
          await processor.processMailbox(mailbox.id);
        } catch (error) {
          console.error(
            `❌ Failed to process ${mailbox.email_address}:`,
            error.message,
          );
        }
      }

      console.log("✅ Email sync completed\n");
    } catch (error) {
      console.error("❌ Email sync failed:", error.message);
    }
  });
}
