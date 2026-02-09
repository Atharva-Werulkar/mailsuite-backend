import { getPaginationParams } from "../utils/pagination.js";

export default async function bounceRoutes(fastify) {
  // GET /bounces - List all bounces with pagination
  fastify.get("/bounces", async (request, reply) => {
    const userId = request.user.id;
    const { limit, offset } = getPaginationParams(request.query);
    const mailboxId = request.query.mailbox_id;
    console.log(
      `📧 Fetching bounces for user: ${request.user.email}, mailbox: ${mailboxId || "all"}`,
    );

    try {
      let query = fastify.supabase
        .from("email_bounces")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("last_failed_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (mailboxId) {
        query = query.eq("mailbox_id", mailboxId);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("❌ Error fetching bounces:", error);
        return reply.status(500).send({ error: error.message });
      }

      // Manually fetch mailbox email addresses if foreign key isn't set up
      if (data && data.length > 0) {
        const mailboxIds = [...new Set(data.map((b) => b.mailbox_id))];
        const { data: mailboxes } = await fastify.supabase
          .from("mailboxes")
          .select("id, email_address")
          .in("id", mailboxIds);

        // Map mailbox emails to bounces
        const mailboxMap = {};
        if (mailboxes) {
          mailboxes.forEach((m) => {
            mailboxMap[m.id] = m.email_address;
          });
        }

        // Add email_address to each bounce
        data.forEach((bounce) => {
          bounce.mailbox_email = mailboxMap[bounce.mailbox_id] || null;
        });
      }

      return reply.send({
        data,
        total: count,
        limit,
        offset,
      });
    } catch (err) {
      console.error("❌ Exception in bounces endpoint:", err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /bounces/unique - Count unique failed emails
  fastify.get("/bounces/unique", async (request, reply) => {
    const userId = request.user.id;
    const mailboxId = request.query.mailbox_id;
    console.log(
      `📊 Fetching unique bounce count for user: ${request.user.email}`,
    );

    try {
      let query = fastify.supabase
        .from("email_bounces")
        .select("email, bounce_type")
        .eq("user_id", userId);

      if (mailboxId) {
        query = query.eq("mailbox_id", mailboxId);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      const uniqueEmails = new Set(data.map((b) => b.email));
      const byType = data.reduce(
        (acc, bounce) => {
          acc[bounce.bounce_type.toLowerCase()] =
            (acc[bounce.bounce_type.toLowerCase()] || 0) + 1;
          return acc;
        },
        { hard: 0, soft: 0, unknown: 0 },
      );

      return reply.send({
        total: uniqueEmails.size,
        ...byType,
      });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /bounces/stats - Bounce statistics
  fastify.get("/bounces/stats", async (request, reply) => {
    const userId = request.user.id;
    console.log(`📈 Fetching bounce stats for user: ${request.user.email}`);

    try {
      // Total failures and unique emails
      const { data: bounces, error: bouncesError } = await fastify.supabase
        .from("email_bounces")
        .select("email, bounce_type, failure_count, last_failed_at")
        .eq("user_id", userId);

      if (bouncesError) {
        return reply.status(500).send({ error: bouncesError.message });
      }

      const totalFailures = bounces.reduce(
        (sum, b) => sum + b.failure_count,
        0,
      );
      const uniqueEmails = new Set(bounces.map((b) => b.email)).size;

      // Bounces by type
      const byType = bounces.reduce(
        (acc, bounce) => {
          const type = bounce.bounce_type.toLowerCase();
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        },
        { hard: 0, soft: 0, unknown: 0 },
      );

      // Recent trend (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentBounces = bounces.filter(
        (b) => new Date(b.last_failed_at) >= sevenDaysAgo,
      );

      return reply.send({
        totalFailures,
        uniqueEmails,
        byType,
        recentCount: recentBounces.length,
        trend: {
          last7Days: recentBounces.length,
        },
      });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
