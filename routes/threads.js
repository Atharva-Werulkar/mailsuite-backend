/**
 * Email thread/conversation API endpoints
 * Phase 2: Inbox Intelligence
 */

import { getPaginationParams } from "../utils/pagination.js";

export default async function threadRoutes(fastify) {
  /**
   * GET /threads - List threads/conversations
   * Query params:
   * - mailbox_id: Filter by mailbox
   * - is_unread: boolean
   * - is_archived: boolean
   * - limit, offset: Pagination
   */
  fastify.get("/threads", async (request, reply) => {
    const userId = request.user.id;
    const { limit, offset } = getPaginationParams(request.query);
    const { mailbox_id, is_unread, is_archived } = request.query;

    console.log(`🧵 Fetching threads for user: ${request.user.email}`);

    try {
      let query = fastify.supabase
        .from("email_threads")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (mailbox_id) {
        query = query.eq("mailbox_id", mailbox_id);
      }

      if (is_unread !== undefined) {
        query = query.eq("is_unread", is_unread === "true");
      }

      if (is_archived !== undefined) {
        query = query.eq("is_archived", is_archived === "true");
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("❌ Error fetching threads:", error);
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
      console.error("❌ Error in GET /threads:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * GET /threads/:id - Get thread with all messages
   */
  fastify.get("/threads/:id", async (request, reply) => {
    const userId = request.user.id;
    const threadId = request.params.id;

    console.log(
      `🧵 Fetching thread ${threadId} for user: ${request.user.email}`,
    );

    try {
      // Get thread details
      const { data: thread, error: threadError } = await fastify.supabase
        .from("email_threads")
        .select("*")
        .eq("id", threadId)
        .eq("user_id", userId)
        .single();

      if (threadError) {
        if (threadError.code === "PGRST116") {
          return reply.status(404).send({ error: "Thread not found" });
        }
        console.error("❌ Error fetching thread:", threadError);
        return reply.status(500).send({ error: threadError.message });
      }

      // Get all messages in thread
      const { data: messages, error: messagesError } = await fastify.supabase
        .from("emails")
        .select("*")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });

      if (messagesError) {
        console.error("❌ Error fetching messages:", messagesError);
        return reply.status(500).send({ error: messagesError.message });
      }

      return reply.send({
        ...thread,
        messages,
      });
    } catch (error) {
      console.error("❌ Error in GET /threads/:id:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * PUT /threads/:id/archive - Archive/unarchive thread
   */
  fastify.put("/threads/:id/archive", async (request, reply) => {
    const userId = request.user.id;
    const threadId = request.params.id;
    const { is_archived } = request.body;

    if (typeof is_archived !== "boolean") {
      return reply.status(400).send({ error: "is_archived must be a boolean" });
    }

    console.log(
      `📦 Marking thread ${threadId} as ${is_archived ? "archived" : "unarchived"}`,
    );

    try {
      // Update thread
      const { data, error } = await fastify.supabase
        .from("email_threads")
        .update({ is_archived })
        .eq("id", threadId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("❌ Error updating thread:", error);
        return reply.status(500).send({ error: error.message });
      }

      // Also archive all emails in thread
      await fastify.supabase
        .from("emails")
        .update({ is_archived })
        .eq("thread_id", threadId)
        .eq("user_id", userId);

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in PUT /threads/:id/archive:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * PUT /threads/:id/read - Mark thread as read/unread
   */
  fastify.put("/threads/:id/read", async (request, reply) => {
    const userId = request.user.id;
    const threadId = request.params.id;
    const { is_read } = request.body;

    if (typeof is_read !== "boolean") {
      return reply.status(400).send({ error: "is_read must be a boolean" });
    }

    console.log(
      `🧵 Marking thread ${threadId} as ${is_read ? "read" : "unread"}`,
    );

    try {
      // Mark all emails in thread as read/unread
      await fastify.supabase
        .from("emails")
        .update({ is_read })
        .eq("thread_id", threadId)
        .eq("user_id", userId);

      // Update thread
      const { data, error } = await fastify.supabase
        .from("email_threads")
        .update({ is_unread: !is_read })
        .eq("id", threadId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("❌ Error updating thread:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send(data);
    } catch (error) {
      console.error("❌ Error in PUT /threads/:id/read:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * DELETE /threads/:id - Delete thread and all messages
   */
  fastify.delete("/threads/:id", async (request, reply) => {
    const userId = request.user.id;
    const threadId = request.params.id;

    console.log(`🗑️  Deleting thread ${threadId}`);

    try {
      // Delete all emails in thread (cascade will handle this, but explicit is clearer)
      await fastify.supabase
        .from("emails")
        .delete()
        .eq("thread_id", threadId)
        .eq("user_id", userId);

      // Delete thread
      const { error } = await fastify.supabase
        .from("email_threads")
        .delete()
        .eq("id", threadId)
        .eq("user_id", userId);

      if (error) {
        console.error("❌ Error deleting thread:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ success: true });
    } catch (error) {
      console.error("❌ Error in DELETE /threads/:id:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  /**
   * GET /threads/stats - Get thread statistics
   */
  fastify.get("/threads/stats", async (request, reply) => {
    const userId = request.user.id;
    const { mailbox_id } = request.query;

    console.log(`📊 Fetching thread stats for user: ${request.user.email}`);

    try {
      let query = fastify.supabase
        .from("email_threads")
        .select("is_unread, is_archived")
        .eq("user_id", userId);

      if (mailbox_id) {
        query = query.eq("mailbox_id", mailbox_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("❌ Error fetching thread stats:", error);
        return reply.status(500).send({ error: error.message });
      }

      const stats = {
        total: data.length,
        unread: data.filter((t) => t.is_unread).length,
        archived: data.filter((t) => t.is_archived).length,
        active: data.filter((t) => !t.is_archived).length,
      };

      return reply.send(stats);
    } catch (error) {
      console.error("❌ Error in GET /threads/stats:", error);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
