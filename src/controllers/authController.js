import jwt from "jsonwebtoken";
import prisma from "../config/db.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";

const JWT_SECRET = process.env.JWT_SECRET || "test_secret_key";
const JWT_EXPIRES = "24h";

// Register a new user
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if user exists (only select id for faster query)
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists, please sign in instead",
      });
    }

    // Hash password (will be fast with 4 rounds in dev)
    const hashedPassword = await hashPassword(password);

    // Create user and wallet atomically
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        wallet: {
          create: {
            balance: 0,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });

    res.status(201).json({
      message: "User registered successfully",
      user,
      token,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    res.status(500).json({
      message: "Internal: Error Occurred during registration",
    });
  }
};

// Login a user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Email not found." });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Password is incorrect." });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });

    res.status(200).json({
      message: `User ${user.name} logged in successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({
      message: "Internal: Error Occurred during login",
    });
  }
};

export { register, login };
