/**
 * Email browsing and filtering API endpoints
 * Phase 2: Inbox Intelligence
 */

import { getPaginationParams } from "../utils/pagination.js";

export default async function emailRoutes(fastify) {
  /**
   * GET /emails - List emails with filters
   * Query params:
   * - category: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER
   * - mailbox_id: Filter by mailbox
   * - thread_id: Filter by thread
   * - is_read: boolean
   * - is_starred: boolean
   * - is_archived: boolean
   * - search: Search in subject and from_address
   * - limit, offset: Pagination
   */
  fastify.get("/emails", async (request, reply) => {
    const userId = request.user.id;
    const { limit, offset } = getPaginationParams(request.query);
    const {
      category,
      mailbox_id,
      thread_id,
      is_read,
      is_starred,
      is_archived,
      search,
    } = request.query;

    console.log(`📧 Fetching emails for user: ${request.user.email}`);

    try {
      let query = fastify.supabase
        .from("emails")
        .select("*, email_threads(subject, normalized_subject)", {
          count: "exact",
        })
        .eq("user_id", userId)
        .order("received_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (category) {
        query = query.eq("category", category);
      }

      if (mailbox_id) {
        query = query.eq("mailbox_id", mailbox_id);
      }

      if (thread_id) {
        query = query.eq("thread_id", thread_id);
      }

      if (is_read !== undefined) {
        query = query.eq("is_read", is_read === "true");
      }

      if (is_starred !== undefined) {
        query = query.eq("is_starred", is_starred === "true");
      }

      if (is_archived !== undefined) {
        query = query.eq("is_archived", is_archived === "true");
      }

      if (search) {
        query = query.or(
          `subject.ilike.%${search}%,from_address.ilike.%${search}%`,
        );
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("❌ Error fetching emails:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({
        data,
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + limit < count,
        },
      });
    } catch (error) {
      console.error("❌ Error in GET /emails:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * GET /emails/categories - Get email counts by category
   */
  fastify.get("/emails/categories", async (request, reply) => {
    const userId = request.user.id;
    const { mailbox_id } = request.query;

    console.log(`📊 Fetching category counts for user: ${request.user.email}`);

    try {
      let query = fastify.supabase
        .from("emails")
        .select("category")
        .eq("user_id", userId);

      if (mailbox_id) {
        query = query.eq("mailbox_id", mailbox_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("❌ Error fetching categories:", error);
        return reply.status(500).send({ error: error.message });
      }

      // Count by category
      const counts = data.reduce((acc, email) => {
        acc[email.category] = (acc[email.category] || 0) + 1;
        return acc;
      }, {});

      // Also get unread counts
      const { data: unreadData } = await fastify.supabase
        .from("emails")
        .select("category")
        .eq("user_id", userId)
        .eq("is_read", false);

      const unreadCounts = unreadData.reduce((acc, email) => {
        acc[email.category] = (acc[email.category] || 0) + 1;
        return acc;
      }, {});

      return reply.send({
        total: counts,
        unread: unreadCounts,
      });
    } catch (error) {
      console.error("❌ Error in GET /emails/categories:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * GET /emails/:id - Get single email details
   */
  fastify.get("/emails/:id", async (request, reply) => {
    const userId = request.user.id;
    const emailId = request.params.id;

    console.log(`📧 Fetching email ${emailId} for user: ${request.user.email}`);

    try {
      const { data, error } = await fastify.supabase
        .from("emails")
        .select("*, email_threads(*)")
        .eq("id", emailId)
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return reply.status(404).send({ error: "Email not found" });
        }
        console.error("❌ Error fetching email:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in GET /emails/:id:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * PUT /emails/:id/read - Mark email as read/unread
   */
  fastify.put("/emails/:id/read", async (request, reply) => {
    const userId = request.user.id;
    const emailId = request.params.id;
    const { is_read } = request.body;

    if (typeof is_read !== "boolean") {
      return reply.status(400).send({ error: "is_read must be a boolean" });
    }

    console.log(
      `📧 Marking email ${emailId} as ${is_read ? "read" : "unread"}`,
    );

    try {
      const { data, error } = await fastify.supabase
        .from("emails")
        .update({ is_read })
        .eq("id", emailId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("❌ Error updating email:", error);
        return reply.status(500).send({ error: error.message });
      }

      // Update thread unread status
      if (data.thread_id) {
        const { ThreadBuilder } =
          await import("../services/email-worker/thread-builder.js");
        const threadBuilder = new ThreadBuilder(fastify.supabase);
        await threadBuilder.updateThreadStats(data.thread_id);
      }

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in PUT /emails/:id/read:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * PUT /emails/:id/star - Toggle email starred status
   */
  fastify.put("/emails/:id/star", async (request, reply) => {
    const userId = request.user.id;
    const emailId = request.params.id;
    const { is_starred } = request.body;

    if (typeof is_starred !== "boolean") {
      return reply.status(400).send({ error: "is_starred must be a boolean" });
    }

    console.log(
      `⭐ Marking email ${emailId} as ${is_starred ? "starred" : "unstarred"}`,
    );

    try {
      const { data, error } = await fastify.supabase
        .from("emails")
        .update({ is_starred })
        .eq("id", emailId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("❌ Error updating email:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in PUT /emails/:id/star:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * PUT /emails/:id/archive - Archive/unarchive email
   */
  fastify.put("/emails/:id/archive", async (request, reply) => {
    const userId = request.user.id;
    const emailId = request.params.id;
    const { is_archived } = request.body;

    if (typeof is_archived !== "boolean") {
      return reply.status(400).send({ error: "is_archived must be a boolean" });
    }

    console.log(
      `📦 Marking email ${emailId} as ${is_archived ? "archived" : "unarchived"}`,
    );

    try {
      const { data, error } = await fastify.supabase
        .from("emails")
        .update({ is_archived })
        .eq("id", emailId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("❌ Error updating email:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in PUT /emails/:id/archive:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * DELETE /emails/:id - Delete email
   */
  fastify.delete("/emails/:id", async (request, reply) => {
    const userId = request.user.id;
    const emailId = request.params.id;

    console.log(`🗑️  Deleting email ${emailId}`);

    try {
      // Get thread_id before deletion
      const { data: email } = await fastify.supabase
        .from("emails")
        .select("thread_id")
        .eq("id", emailId)
        .eq("user_id", userId)
        .single();

      // Delete email
      const { error } = await fastify.supabase
        .from("emails")
        .delete()
        .eq("id", emailId)
        .eq("user_id", userId);

      if (error) {
        console.error("❌ Error deleting email:", error);
        return reply.status(500).send({ error: error.message });
      }

      // Update thread stats
      if (email?.thread_id) {
        const { ThreadBuilder } =
          await import("../services/email-worker/thread-builder.js");
        const threadBuilder = new ThreadBuilder(fastify.supabase);
        await threadBuilder.updateThreadStats(email.thread_id);
      }

      return reply.send({ success: true });
    } catch (error) {
      console.error("❌ Error in DELETE /emails/:id:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
