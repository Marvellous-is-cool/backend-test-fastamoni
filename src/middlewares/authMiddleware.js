import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test_secret_key";

// authentication middleware
const authMiddleware = (req, res, next) => {
  try {
    // get token from auth headers
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid authorization token" });
    }

    const token = authHeader.slice(7); // remove "Bearer " prefix

    // verify token
    const decode = jwt.verify(token, JWT_SECRET);

    // attach user info to request object
    req.user = decode;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};

export default authMiddleware;
