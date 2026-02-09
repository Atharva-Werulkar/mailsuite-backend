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

dotenv.config();

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

// 🔐 Auth (applies to ALL routes after this)
app.register(authPlugin);

// Routes
app.register(authRoutes, { prefix: "/api/v1" });
app.register(bounceRoutes, { prefix: "/api/v1" });
app.register(mailboxRoutes, { prefix: "/api/v1" });
app.register(emailRoutes, { prefix: "/api/v1" });
app.register(threadRoutes, { prefix: "/api/v1" });

//health
app.get("/health", async (request, reply) => {
  console.log("🏥 Health check endpoint called");
  return reply.send({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

app.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
