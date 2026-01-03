import nodemailer from "nodemailer";

// Validate email configuration on startup (non-blocking)
const hasEmailConfig = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

if (!hasEmailConfig) {
  console.warn("⚠️  WARNING: EMAIL_USER or EMAIL_PASS not set in .env file");
  console.warn("⚠️  Email functionality will be disabled");
}

// Create reusable transporter object using Gmail SMTP
let transporter = null;

if (hasEmailConfig) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Add timeouts to prevent hanging
    connectionTimeout: 5000,
    greetingTimeout: 3000,
    socketTimeout: 10000,
  });

  // Verify transporter configuration ASYNC (don't block startup)
  transporter.verify().then(
    () => {
      console.log("✅ Gmail email server is ready to send messages");
    },
    (error) => {
      console.error("❌ Gmail transporter configuration error:", error.message);
      console.error("   Email sending will be disabled");
      transporter = null; // Disable email if verification fails
    }
  );
}

// Function to send thank you email (fully non-blocking)
const sendThankYouEmail = async (toEmail, senderName) => {
  // Return immediately if no transporter
  if (!transporter) {
    console.log("⚠️  Email disabled - skipping thank you email");
    return;
  }

  // Use setImmediate to ensure this doesn't block
  setImmediate(async () => {
    try {
      const mailOptions = {
        from: `Fastamoni <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: "Thank You for Your Generous Donation!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Dear ${senderName},</h2>
            <p style="color: #555; line-height: 1.6;">
              We noticed that you have made multiple donations through our platform. 
              Your generosity and continued support is truly appreciated!
            </p>
            <p style="color: #555; line-height: 1.6;">
              Thank you for making a difference.
            </p>
            <br />
            <p style="color: #555;">With gratitude,</p>
            <p style="color: #555;"><strong>The Fastamoni Team</strong></p>
          </div>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(
        `✅ Thank you email sent to ${toEmail} (ID: ${info.messageId})`
      );
    } catch (error) {
      console.error("❌ Error sending thank you email:", error.message);
      // Email failure should never affect the API response
    }
  });
};

// Function to send generic email
const sendGenericEmail = async (toEmail, subject, htmlContent) => {
  if (!transporter) {
    throw new Error("Email service not configured");
  }

  try {
    const mailOptions = {
      from: `Fastamoni <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${toEmail} (ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
    throw error;
  }
};

export { sendThankYouEmail, sendGenericEmail };
