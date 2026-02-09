import jwt from "jsonwebtoken";

export function generateAccessToken(userId, email) {
  return jwt.sign(
    {
      userId,
      email,
      type: "access",
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

export function generateRefreshToken(userId, email) {
  return jwt.sign(
    {
      userId,
      email,
      type: "refresh",
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

export function generateTokenPair(userId, email) {
  return {
    accessToken: generateAccessToken(userId, email),
    refreshToken: generateRefreshToken(userId, email),
  };
}
