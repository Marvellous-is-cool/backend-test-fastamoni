import { PrismaClient } from "@prisma/client";

let prisma;

function getPrismaClient() {
  if (!prisma) {
    const url = process.env.DATABASE_URL;
    console.log("[db] DATABASE_URL present:", !!url);

    if (!url) {
      throw new Error("DATABASE_URL is not set in environment variables");
    }

    try {
      const config = {
        datasources: {
          db: {
            url: url,
          },
        },
        // Only log errors and warnings in production
        log:
          process.env.NODE_ENV === "production"
            ? ["error", "warn"]
            : ["error", "warn", "info"],
      };

      if (process.env.NODE_ENV === "production") {
        prisma = new PrismaClient(config);
      } else {
        // Avoid creating multiple clients in dev (hot reload issue)
        if (!global._prisma) {
          global._prisma = new PrismaClient(config);
        }
        prisma = global._prisma;
      }

      // Test connection async (don't block)
      prisma
        .$connect()
        .then(() => {
          console.log("[db] Database connected successfully");
        })
        .catch((err) => {
          console.error("[db] Failed to connect to database:", err.message);
        });
    } catch (e) {
      console.error("[db] PrismaClient construction failed");
      console.error("[db] NODE_ENV:", process.env.NODE_ENV);
      console.error("[db] DATABASE_URL present:", !!process.env.DATABASE_URL);
      throw e;
    }
  }
  return prisma;
}

export default getPrismaClient();
