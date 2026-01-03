import { spawn } from "child_process";
import net from "net";
import fs from "fs/promises";
import { setTimeout as wait } from "timers/promises";
import { randomUUID } from "crypto";

const ARTILLERY_YML = "./donation-load.yml";
const REPORT_JSON = "./artillery/report.json";
const REPORT_HTML = "./artillery/report.html";
const SERVER_START_TIMEOUT_MS = 30_000;
const CHECK_INTERVAL_MS = 200;

function waitForPort(port, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tryConnect() {
      const s = net.createConnection({ port }, () => {
        s.destroy();
        resolve();
      });
      s.on("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, CHECK_INTERVAL_MS);
        }
      });
    })();
  });
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  // use global fetch when available
  const Fetch = globalThis.fetch;
  if (!Fetch) {
    throw new Error("global fetch is not available in this Node runtime");
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await Fetch(url, { ...opts, signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function createreceiver() {
  const id = randomUUID();
  const body = {
    name: `receiver-${id}`,
    email: `receiver-${id}@example.com`,
    password: "Password@123",
  };

  console.log("[load-test] createreceiver: sending POST /api/auth/register");
  const res = await fetchWithTimeout(
    `http://localhost:3000/api/auth/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    10000
  );

  const txt = await res.text();
  console.log("[load-test] createreceiver: status =", res.status);
  // log truncated body for debugging
  console.log("[load-test] createreceiver: body =", txt.slice(0, 1000));

  if (!res.ok) {
    throw new Error(
      `Failed to create receiver: ${res.status} ${res.statusText} ${txt}`
    );
  }

  let json;
  try {
    json = JSON.parse(txt);
  } catch (e) {
    throw new Error("Invalid JSON from register endpoint: " + txt);
  }

  const userId = json?.user?.id;
  if (!userId) throw new Error("No user id returned from register response");
  return userId;
}

function spawnServer() {
  console.log("[load-test] Spawning server: node app.js");
  const server = spawn("node", ["app.js"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  server.on("error", (err) => {
    console.error("[load-test] Failed to start server:", err);
    process.exit(1);
  });

  const cleanup = () => {
    try {
      server.kill("SIGTERM");
    } catch (e) {}
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  return { server, cleanup };
}

async function run() {
  const { server, cleanup } = spawnServer();

  try {
    console.log("[load-test] Waiting for server to listen on port 3000...");
    await waitForPort(process.env.PORT ? Number(process.env.PORT) : 3000);
  } catch (err) {
    console.error("[load-test] Server did not start:", err);
    cleanup();
    process.exit(1);
  }

  let receiverId;
  try {
    console.log("[load-test] Creating receiver user...");
    receiverId = await createreceiver();
    console.log("[load-test] createreceiver returned id:", receiverId);
    process.env.receiver_ID = String(receiverId);
    // pass through secret for top-up
    process.env.TOPUP_SECRET =
      process.env.TOPUP_SECRET || "your_topup_secret_key";
    console.log("[load-test] receiver id =", receiverId);
  } catch (err) {
    console.error("[load-test] Failed to create receiver:", err);
    cleanup();
    process.exit(1);
  }

  console.log("[load-test] Starting Artillery...");
  const art = spawn(
    "npx",
    ["artillery", "run", ARTILLERY_YML, "-o", REPORT_JSON],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
    }
  );

  const artilleryExit = await new Promise((resolve) => {
    art.on("close", (code) => resolve(code ?? 0));
    art.on("error", (err) => {
      console.error("[load-test] Artillery failed:", err);
      resolve(1);
    });
  });

  console.log("[load-test] Artillery finished with exit code", artilleryExit);

  try {
    console.log("[load-test] Generating HTML report...");
    const rep = spawn(
      "npx",
      ["artillery", "report", "--output", REPORT_HTML, REPORT_JSON],
      {
        stdio: ["inherit", "inherit", "inherit"],
        env: process.env,
      }
    );
    await new Promise((resolve) => rep.on("close", resolve));
    console.log("[load-test] HTML report generated at", REPORT_HTML);
  } catch (e) {
    console.warn("[load-test] Failed to generate HTML report:", e);
  }

  // attempt to parse p99
  try {
    const raw = await fs.readFile(REPORT_JSON, "utf8");
    const report = JSON.parse(raw);
    // drill for p99
    function findP99(obj) {
      if (!obj) return null;
      if (typeof obj.p99 === "number") return obj.p99;
      if (typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const v = findP99(obj[k]);
          if (v != null) return v;
        }
      }
      return null;
    }
    const p99 = findP99(report);
    if (p99 != null) {
      console.log(`[load-test] Observed p99 = ${p99} ms`);
      const thresholdMs = 50;
      if (p99 > thresholdMs) {
        console.error(`[load-test] p99 > ${thresholdMs}ms — failing test`);
        cleanup();
        process.exit(2);
      } else {
        console.log(`[load-test] p99 <= ${thresholdMs}ms — OK`);
      }
    } else {
      console.warn("[load-test] p99 not found in report JSON");
    }
  } catch (e) {
    console.warn("[load-test] Could not parse report JSON:", e);
  }

  cleanup();
  await wait(500);
  process.exit(artilleryExit);
}

run().catch((err) => {
  console.error("[load-test] Unexpected error:", err);
  process.exit(1);
});
