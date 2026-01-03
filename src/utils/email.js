import nodemailer from "nodemailer";

// Provider selection: SMTP (default), GMAIL_OAUTH (OAuth2), or RESEND (HTTP API)
const PROVIDER = (process.env.EMAIL_PROVIDER || "SMTP").toUpperCase();

// Reusable SMTP transporter (if configured)
let transporter = null;

async function configureSmtp() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";

  const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
  });

  try {
    await tx.verify();
    console.log(`✅ SMTP ready (${host}:${port}, secure=${secure})`);
    return tx;
  } catch (err) {
    console.error("❌ SMTP verify failed:", err?.message || err);
    return null;
  }
}

async function configureGmailOauth() {
  const user = process.env.EMAIL_USER;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!user || !clientId || !clientSecret || !refreshToken) return null;

  const tx = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user,
      clientId,
      clientSecret,
      refreshToken,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
  });

  try {
    await tx.verify();
    console.log("✅ Gmail OAuth2 transporter ready");
    return tx;
  } catch (err) {
    console.error("❌ Gmail OAuth2 verify failed:", err?.message || err);
    return null;
  }
}

// Initialize provider
(async () => {
  if (PROVIDER === "SMTP") {
    transporter = await configureSmtp();
    if (!transporter) {
      console.warn("⚠️  Email disabled (SMTP not available)");
    }
  } else if (PROVIDER === "GMAIL_OAUTH") {
    transporter = await configureGmailOauth();
    if (!transporter) {
      console.warn("⚠️  Email disabled (Gmail OAuth not available)");
    }
  } else if (PROVIDER === "RESEND") {
    if (!process.env.RESEND_API_KEY) {
      console.warn("⚠️  RESEND_API_KEY not set; email disabled");
    } else {
      console.log("✅ Resend HTTP email provider configured");
    }
  }
})();

// Internal send via Resend HTTP API (no extra deps; Node 18+ fetch)
async function sendViaResend({ from, to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const payload = { from, to, subject, html };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return json;
}

const fromAddress = () => {
  const name = process.env.EMAIL_FROM_NAME || "Fastamoni";
  const addr = process.env.EMAIL_USER || "no-reply@example.com";
  return `${name} <${addr}>`;
};

// Function to send thank you email (non-blocking)
const sendThankYouEmail = async (toEmail, senderName) => {
  setImmediate(async () => {
    try {
      const mail = {
        from: fromAddress(),
        to: toEmail,
        subject: "Thank You for Your Generous Donation!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Dear ${senderName},</h2>
            <p style="color: #555; line-height: 1.6;">We noticed that you have made multiple donations through our platform. Your generosity and continued support is truly appreciated!</p>
            <p style="color: #555; line-height: 1.6;">Thank you for making a difference.</p>
            <br />
            <p style="color: #555;">With gratitude,</p>
            <p style="color: #555;"><strong>The Fastamoni Team</strong></p>
          </div>
        `,
      };

      if (PROVIDER === "RESEND" && process.env.RESEND_API_KEY) {
        const info = await sendViaResend(mail);
        console.log(
          `✅ Thank you email sent to ${toEmail} (ID: ${info?.id || "ok"})`
        );
        return;
      }
      if (!transporter) {
        console.log("⚠️  Email disabled - skipping thank you email");
        return;
      }
      const info = await transporter.sendMail(mail);
      console.log(
        `✅ Thank you email sent to ${toEmail} (ID: ${info.messageId})`
      );
    } catch (error) {
      console.error(
        "❌ Error sending thank you email:",
        error.message || error
      );
    }
  });
};

// Function to send generic email
const sendGenericEmail = async (toEmail, subject, htmlContent) => {
  const mail = { from: fromAddress(), to: toEmail, subject, html: htmlContent };
  if (PROVIDER === "RESEND" && process.env.RESEND_API_KEY) {
    return await sendViaResend(mail);
  }
  if (!transporter) {
    throw new Error("Email service not configured");
  }
  try {
    const info = await transporter.sendMail(mail);
    console.log(`✅ Email sent to ${toEmail} (ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error.message || error);
    throw error;
  }
};

export { sendThankYouEmail, sendGenericEmail };
