import { encrypt } from "../utils/encryption.js";

export default async function mailboxRoutes(fastify) {
  // POST /mailboxes - Add new mailbox
  fastify.post("/mailboxes", async (request, reply) => {
    const userId = request.user.id;
    const {
      email_address,
      provider,
      imap_host,
      imap_port,
      imap_username,
      imap_password,
    } = request.body;
    console.log(
      `📬 Adding new mailbox for user: ${request.user.email}, mailbox: ${email_address}`,
    );

    // Validation
    if (!email_address || !imap_host || !imap_username || !imap_password) {
      return reply.status(400).send({
        error:
          "Missing required fields: email_address, imap_host, imap_username, imap_password",
      });
    }

    try {
      // Encrypt IMAP password
      const encryptedPassword = encrypt(imap_password);

      // Insert into mailboxes table
      const { data, error } = await fastify.supabase
        .from("mailboxes")
        .insert({
          user_id: userId,
          provider: provider || "gmail",
          email_address,
          imap_host,
          imap_port: imap_port || 993,
          imap_username,
          imap_password_encrypted: encryptedPassword,
          status: "ACTIVE",
          last_synced_uid: 0,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      // Don't return the encrypted password
      delete data.imap_password_encrypted;
      console.log(`✅ Mailbox added successfully: ${email_address}`);

      return reply.status(201).send({ data });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /mailboxes - List user's mailboxes
  fastify.get("/mailboxes", async (request, reply) => {
    const userId = request.user.id;
    console.log(`📬 Fetching mailboxes for user: ${request.user.email}`);

    try {
      const { data, error } = await fastify.supabase
        .from("mailboxes")
        .select(
          "id, user_id, provider, email_address, imap_host, imap_port, imap_username, status, last_error, last_synced_uid, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Error fetching mailboxes:", error);
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ data });
    } catch (err) {
      console.error("❌ Exception fetching mailboxes:", err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // PUT /mailboxes/:id - Update mailbox
  fastify.put("/mailboxes/:id", async (request, reply) => {
    const userId = request.user.id;
    const mailboxId = request.params.id;
    const updates = request.body;
    console.log(
      `✏️ Updating mailbox: ${mailboxId} for user: ${request.user.email}`,
    );

    try {
      // If password is being updated, encrypt it
      if (updates.imap_password) {
        updates.imap_password_encrypted = encrypt(updates.imap_password);
        delete updates.imap_password;
      }

      const { data, error } = await fastify.supabase
        .from("mailboxes")
        .update(updates)
        .eq("id", mailboxId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      if (!data) {
        return reply.status(404).send({ error: "Mailbox not found" });
      }

      // Don't return the encrypted password
      delete data.imap_password_encrypted;

      return reply.send({ data });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /mailboxes/:id - Delete mailbox
  fastify.delete("/mailboxes/:id", async (request, reply) => {
    const userId = request.user.id;
    const mailboxId = request.params.id;
    console.log(
      `🗑️ Deleting mailbox: ${mailboxId} for user: ${request.user.email}`,
    );

    try {
      const { error } = await fastify.supabase
        .from("mailboxes")
        .delete()
        .eq("id", mailboxId)
        .eq("user_id", userId);

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.status(204).send();
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /mailboxes/test - Test IMAP connection
  fastify.post("/mailboxes/test", async (request, reply) => {
    const { imap_host, imap_port, imap_username, imap_password } = request.body;
    console.log(`🔌 Testing IMAP connection for: ${imap_username}`);

    if (!imap_host || !imap_username || !imap_password) {
      return reply.status(400).send({
        error:
          "Missing required fields: imap_host, imap_username, imap_password",
      });
    }

    let client = null;
    try {
      const { ImapClient } =
        await import("../services/email-worker/imap-client.js");

      client = new ImapClient({
        host: imap_host,
        port: imap_port || 993,
        username: imap_username,
        password: imap_password,
      });

      await client.connect();
      console.log(`✅ IMAP connection successful for: ${imap_username}`);

      return reply.send({ success: true, message: "Connection successful" });
    } catch (err) {
      console.error(
        `❌ IMAP connection failed for ${imap_username}:`,
        err.message,
      );
      return reply.status(400).send({
        success: false,
        error: `Connection failed: ${err.message}`,
      });
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch (disconnectErr) {
          console.error("❌ Error during disconnect:", disconnectErr.message);
        }
      }
    }
  });
}
