import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, ".env");

dotenv.config({ path: envPath });

// Track server start time for uptime reporting
const SERVER_STARTED_AT = Date.now();

async function startApp() {
  const express = await import("express");
  const cors = await import("cors");
  const bodyParser = await import("body-parser");
  const helmet = await import("helmet");
  const rateLimit = await import("express-rate-limit");
  const fs = await import("fs/promises");

  const authRoutes = await import("./src/routes/authRoutes.js");
  const donationRoutes = await import("./src/routes/donationRoutes.js");
  const walletRoutes = await import("./src/routes/walletRoutes.js");
  const { default: prisma } = await import("./src/config/db.js");

  const app = express.default();

  // Trust proxy when deployed behind a proxy (Render/NGINX)
  app.set("trust proxy", 1);

  // Security headers
  app.use(helmet.default());

  // CORS (configurable via CORS_ORIGIN env, supports comma-separated list)
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : true; // allow all in dev if not set
  app.use(
    cors.default({
      origin: corsOrigin,
      credentials: true,
    })
  );

  // Body size limits
  app.use(bodyParser.default.json({ limit: "200kb" }));

  // Basic rate limiting (disabled in test to not affect load tests)
  if (process.env.NODE_ENV !== "test") {
    const limiter = rateLimit.default({
      windowMs: 15 * 60 * 1000,
      max: 2000, // generous to allow high RPS in staging
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === "/api/health" || req.path === "/api/health",
    });
    app.use(limiter);
  }

  // Serve static assets from /public
  const publicDir = join(__dirname, "public");
  app.use(express.default.static(publicDir, { index: false }));

  // Landing page served from public/index.html with Postman link injection
  app.get("/", async (req, res) => {
    try {
      let html = await fs.readFile(join(publicDir, "index.html"), "utf8");
      const postman = process.env.POSTMAN_LINK || "https://www.postman.com/";
      html = html.replace(/{{POSTMAN_LINK}}/g, postman);
      res.type("html").send(html);
    } catch (e) {
      res.status(200).send("Fastamoni API is running. See /health and README.");
    }
  });

  const healthHandler = (req, res) => {
    const now = Date.now();
    const uptimeSeconds = Math.floor((now - SERVER_STARTED_AT) / 1000);
    res.json({
      status: "OK",
      startedAt: new Date(SERVER_STARTED_AT).toISOString(),
      now: new Date(now).toISOString(),
      uptimeSeconds,
    });
  };
  app.get("/api/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.use("/api/auth", authRoutes.default);
  app.use("/api/donations", donationRoutes.default);
  app.use("/api/wallet", walletRoutes.default);

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down server...");
    server.close(async () => {
      await prisma.$disconnect();
      console.log("Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return app;
}

startApp().catch((err) => {
  console.error("Failed to start app:", err);
  process.exit(1);
});
