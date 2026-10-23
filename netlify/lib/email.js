// Sends email through Brevo's transactional API (free plan: 300 emails a day).
// Needs BREVO_API_KEY and EMAIL_FROM (a sender address verified in Brevo).
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const product = () => process.env.PRODUCT_NAME || "Second Opinion";

async function sendEmail({ to, toName, subject, text, html, replyTo }) {
  const key = process.env.BREVO_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email is not set up (BREVO_API_KEY and EMAIL_FROM are required)." };
  const body = {
    sender: { name: process.env.SENDER_NAME || product(), email: from },
    to: [toName ? { email: to, name: String(toName).slice(0, 80) } : { email: to }],
    subject,
    textContent: text
  };
  if (html) body.htmlContent = html;
  if (replyTo) body.replyTo = { email: replyTo };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const d = await r.text().catch(() => "");
      return { ok: false, error: "Email service error " + r.status + ": " + d.slice(0, 160) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the email service." };
  }
}

module.exports = { sendEmail, esc, product };
