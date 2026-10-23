// Admin only: creates a signed license key (for marketplaces without a license API).
const crypto = require("crypto");
const { b64u, mac, same } = require("../lib/session");
const { sendEmail, product } = require("../lib/email");

const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  const admin = process.env.ADMIN_SECRET, secret = process.env.LICENSE_SECRET;
  if (!admin && !secret) return json(500, { error: "Neither ADMIN_SECRET nor LICENSE_SECRET is set on the server." });
  if (!admin) return json(500, { error: "ADMIN_SECRET is not set on the server." });
  if (!secret) return json(500, { error: "LICENSE_SECRET is not set on the server." });
  if (!same(event.headers["x-admin-secret"] || "", admin)) {
    await new Promise((r) => setTimeout(r, 800));
    return json(401, { error: "Wrong admin secret." });
  }
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request." }); }
  const email = String(b.email || "").trim().slice(0, 120);
  if (!email) return json(400, { error: "Enter the buyer's email." });
  const days = Math.max(0, Math.min(3650, Number(b.days) || 0));
  const payload = { e: email, x: days ? Date.now() + days * 864e5 : 0, id: crypto.randomBytes(5).toString("hex") };
  const body = b64u(JSON.stringify(payload));
  const key = "TT-" + body + "." + mac(body, secret, "key");
  const result = { key, id: payload.id, expires: payload.x };

  if (b.send) {
    const prod = product();
    const site = "https://" + (event.headers.host || "");
    const when = payload.x ? "valid until " + new Date(payload.x).toDateString() : "valid with no end date";
    const text = [
      "Thank you for choosing " + prod + " Pro.",
      "",
      "Your license key (" + when + "):",
      key,
      "",
      "To activate:",
      "1. Open " + site + "/pro.html",
      "2. Paste the key and enter this email address: " + email,
      "3. Tap Register this device.",
      "",
      "Keep this key private. If you need help, just reply to this email.",
      "",
      process.env.SENDER_NAME || prod
    ].join("\n");
    const sent = await sendEmail({ to: email, subject: "Your " + prod + " Pro license key", text, replyTo: process.env.OWNER_EMAIL });
    result.emailed = sent.ok;
    if (!sent.ok) result.emailError = sent.error;
  }
  return json(200, result);
};
