// Runs automatically whenever a Netlify form on this site is submitted.
// Sends the requester an automatic reply with the Pro options, and notifies you.
const { sendEmail, esc, product } = require("../lib/email");

const FEATURES = {
  "second opinion": [
    "Write tests: runnable unit tests for your code",
    "Project review: multi-file review with cross-file issues and security",
    "Up to 40,000 characters per request and higher limits",
    "Registered devices, verified on the server"
  ],
  telltale: [
    "Deep AI review of every paragraph in a long document",
    "Manuscript mode for book-length fiction",
    "30,000 characters per AI run and higher limits",
    "Registered devices, verified on the server"
  ]
};

const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;

exports.handler = async (event) => {
  let p;
  try { p = JSON.parse(event.body || "{}").payload || {}; } catch { return { statusCode: 400, body: "Bad request" }; }
  const form = String(p.form_name || "");
  if (!/request$/i.test(form)) return { statusCode: 200, body: "Ignored" }; // only license request forms

  const d = p.data || {};
  const email = String(d.email || "").trim();
  const name = String(d.name || "there").trim().slice(0, 80);
  const plan = String(d.plan || "a Pro license").slice(0, 80);
  const notes = String(d.notes || "").slice(0, 500);
  if (!okEmail(email)) return { statusCode: 200, body: "No valid email" };

  const prod = product();
  const owner = process.env.OWNER_EMAIL;
  const feats = FEATURES[prod.toLowerCase()] || ["Pro features", "Higher limits", "Registered devices, verified on the server"];
  const pricing = process.env.PRICING_TEXT ||
    "Pricing is tailored to how you plan to use " + prod + ". Reply to this email with your use case and how many people will use it, and I will confirm a quote.";
  const pay = process.env.PAYMENT_URL;

  const text = [
    "Hi " + name + ",",
    "",
    "Thanks for your interest in " + prod + " Pro. I received your request for: " + plan + ".",
    "",
    "What Pro includes:",
    ...feats.map((f) => "- " + f),
    "",
    "Pricing: " + pricing,
    "",
    "Next steps:",
    "1. Reply to this email with your use case and team size.",
    "2. I confirm your quote.",
    "3. After payment you receive a license key and a sign-in link.",
    pay ? "\nReady to go? Pay here: " + pay : "",
    "",
    "Thank you,",
    process.env.SENDER_NAME || prod
  ].join("\n");

  const html = "<p>Hi " + esc(name) + ",</p>" +
    "<p>Thanks for your interest in " + esc(prod) + " Pro. I received your request for: <b>" + esc(plan) + "</b>.</p>" +
    "<p><b>What Pro includes</b></p><ul>" + feats.map((f) => "<li>" + esc(f) + "</li>").join("") + "</ul>" +
    "<p><b>Pricing:</b> " + esc(pricing) + "</p>" +
    "<p><b>Next steps</b></p><ol><li>Reply to this email with your use case and team size.</li><li>I confirm your quote.</li><li>After payment you receive a license key and a sign-in link.</li></ol>" +
    (pay ? '<p>Ready to go? <a href="' + esc(pay) + '">Pay here</a>.</p>' : "") +
    "<p>Thank you,<br>" + esc(process.env.SENDER_NAME || prod) + "</p>";

  const reply = await sendEmail({ to: email, toName: name, subject: "Your " + prod + " Pro request", text, html, replyTo: owner });
  if (!reply.ok) console.log("Auto-reply failed:", reply.error);

  if (owner) {
    const n = await sendEmail({
      to: owner,
      subject: "New " + prod + " license request: " + name + " (" + plan + ")",
      text: "Name: " + name + "\nEmail: " + email + "\nLooking for: " + plan + (notes ? "\nNotes: " + notes : "") + "\n\nAuto-reply " + (reply.ok ? "sent." : "FAILED: " + reply.error),
      replyTo: email
    });
    if (!n.ok) console.log("Owner notice failed:", n.error);
  }
  return { statusCode: 200, body: "OK" };
};
