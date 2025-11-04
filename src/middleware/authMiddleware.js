import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "232in2enin3nncijnininci2nini2ncininin");

      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return res.status(401).json({ success: false, message: "Not authorized, invalid token." });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token." });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    next();
  };
};
