import jwt from "jsonwebtoken";

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is not defined in environment variables!");
    throw new Error("Internal server error: Missing security configuration.");
  }
  return jwt.sign(
    {
      id: userId,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
      issuer: process.env.JWT_ISSUER || "Pixora",
      audience: process.env.JWT_AUDIENCE || "Pixora_Support"
    }
  );
};

export const verifyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is not defined in environment variables!");
    throw new Error("Internal server error: Missing security configuration.");
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || "Pixora",
      audience: process.env.JWT_AUDIENCE || "Pixora_Support"
    });
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

export default generateToken;
