import { generateTokenPair, verifyToken } from "../utils/jwt.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export default async function authRoutes(fastify) {
  // POST /auth/register - Register new user
  fastify.post("/auth/register", async (request, reply) => {
    const { email, password, name } = request.body;
    console.log(`📝 Registration attempt for: ${email}`);

    // Validation
    if (!email || !password) {
      console.log(`⚠️ Registration failed: Missing email or password`);
      return reply.status(400).send({
        error: "Email and password are required",
      });
    }

    if (password.length < 8) {
      console.log(`⚠️ Registration failed: Password too short for ${email}`);
      return reply.status(400).send({
        error: "Password must be at least 8 characters",
      });
    }

    try {
      // Check if user already exists
      const { data: existingUser } = await fastify.supabase
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase())
        .single();

      if (existingUser) {
        console.log(`⚠️ Registration failed: User already exists for ${email.toLowerCase()}`);
        return reply.status(409).send({
          error: "User with this email already exists",
        });
      }

      // Hash password
      const hashedPassword = hashPassword(password);

      // Create user
      const { data: newUser, error: insertError } = await fastify.supabase
        .from("users")
        .insert({
          email: email.toLowerCase(),
          password: hashedPassword,
          name: name || null,
          created_at: new Date().toISOString(),
        })
        .select("id, email, name, created_at")
        .single();

      if (insertError) {
        console.log(`⚠️ Registration failed: Failed to create user for ${email.toLowerCase()}`);
        return reply.status(500).send({ error: "Failed to create user" });
      }

      // Generate tokens
      const tokens = generateTokenPair(newUser.id, newUser.email);
      console.log(`✅ User registered successfully: ${newUser.email}`);

      return reply.status(201).send({
        user: newUser,
        ...tokens,
      });
    } catch (err) {
      console.error("Registration error:", err);
      return reply.status(500).send({ error: "Registration failed" });
    }
  });

  // POST /auth/login - Login user
  fastify.post("/auth/login", async (request, reply) => {
    const { email, password } = request.body;
    console.log(`🔐 Login attempt for: ${email}`);

    // Validation
    if (!email || !password) {
      console.log(`⚠️ Login failed: Missing email or password for ${email}`);
      return reply.status(400).send({
        error: "Email and password are required",
      });
    }

    try {
      // Find user
      const { data: user, error: fetchError } = await fastify.supabase
        .from("users")
        .select("id, email, name, password, created_at")
        .eq("email", email.toLowerCase())
        .single();

      if (fetchError || !user) {
        console.log(`⚠️ Login failed: User not found for ${email.toLowerCase()}`);
        return reply.status(401).send({
          error: "Invalid email or password",
        });
      }

      // Verify password
      const isValidPassword = verifyPassword(password, user.password);

      if (!isValidPassword) {
        console.log(`⚠️ Login failed: Incorrect password for ${email.toLowerCase()}`);
        return reply.status(401).send({
          error: "Invalid email or password",
        });
      }

      // Generate tokens
      const tokens = generateTokenPair(user.id, user.email);
      console.log(`✅ Login successful: ${user.email}`);

      // Remove password from response
      delete user.password;

      return reply.send({
        user,
        ...tokens,
      });
    } catch (err) {
      console.error("Login error:", err);
      return reply.status(500).send({ error: "Login failed" });
    }
  });

  // POST /auth/refresh - Refresh access token
  fastify.post("/auth/refresh", async (request, reply) => {
    const { refreshToken } = request.body;
    console.log(`🔄 Token refresh attempt`);

    if (!refreshToken) {
      console.log(`⚠️ Token refresh failed: Missing refresh token`);
      return reply.status(400).send({
        error: "Refresh token is required",
      });
    }

    try {
      // Verify refresh token
      const decoded = verifyToken(refreshToken);

      if (decoded.type !== "refresh") {
        console.log(`⚠️ Token refresh failed: Invalid token type`);
        return reply.status(401).send({
          error: "Invalid refresh token",
        });
      }

      // Generate new tokens
      const tokens = generateTokenPair(decoded.userId, decoded.email);
      console.log(`✅ Token refreshed for: ${decoded.email}`);

      return reply.send(tokens);
    } catch (err) {
      return reply.status(401).send({
        error: "Invalid or expired refresh token",
      });
    }
  });

  // GET /auth/me - Get current user
  fastify.get("/auth/me", async (request, reply) => {
    const userId = request.user.id;
    console.log(`👤 Get user info for: ${request.user.email}`);

    try {
      const { data: user, error } = await fastify.supabase
        .from("users")
        .select("id, email, name, created_at")
        .eq("id", userId)
        .single();

      if (error || !user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user });
    } catch (err) {
      return reply.status(500).send({ error: "Failed to fetch user" });
    }
  });
}
