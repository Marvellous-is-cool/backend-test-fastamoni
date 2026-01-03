import bcrypt from "bcrypt";

// 4 rounds for development/load testing (10-15ms per hash)
// 10-12 rounds for production (~100-300ms per hash)
const SALT_ROUNDS = process.env.NODE_ENV === "production" ? 10 : 4;

async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

export { hashPassword, verifyPassword };
