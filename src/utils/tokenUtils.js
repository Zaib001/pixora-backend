import jwt from "jsonwebtoken";

const generateToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET || "232in2enin3nncijnininci2nini2ncininin",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
      issuer: process.env.JWT_ISSUER || "Pixora",
      audience: process.env.JWT_AUDIENCE || "Pixora_Support"
    }
  );
};

export const verifyToken = (token) => {
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
