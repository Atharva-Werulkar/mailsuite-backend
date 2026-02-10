import fp from "fastify-plugin";
import { verifyToken } from "../utils/jwt.js";

async function authPlugin(fastify) {
  fastify.decorateRequest("user", null);

  fastify.addHook("onRequest", async (request, reply) => {
    // Public routes that don't require authentication
    const publicRoutes = [
      "/health",
      "/api/v1/mailboxes/test",
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/auth/refresh",
    ];

    // Check if current route is public
    if (publicRoutes.some((route) => request.url.startsWith(route))) {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({ error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const decoded = verifyToken(token);

      // Verify it's an access token
      if (decoded.type !== "access") {
        return reply.status(401).send({ error: "Invalid token type" });
      }

      request.user = {
        id: decoded.userId,
        email: decoded.email,
      };
    } catch (err) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  });
}

export default fp(authPlugin);
