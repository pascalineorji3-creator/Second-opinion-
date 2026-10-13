// Second Opinion: serverless AI call. The API key stays here, never in the page.
const PROMPTS = {
  debug: "You are a senior engineer debugging code. Respond in markdown with these headings exactly: ## Root cause, ## Fix, ## Why it works, ## How to verify, ## Prevent it. Under Fix give corrected code in a fenced block (the smallest change that works). Never invent APIs or functions. If information is missing, say exactly what to check. Be concise.",
  explain: "You are a patient senior engineer. Explain this code for someone learning. Use markdown headings: ## What it does, ## Step by step, ## Gotchas, ## Complexity or cost. Plain language, short sentences, small examples.",
  review: "You are a strict code reviewer. Use markdown headings: ## Bugs, ## Security, ## Performance, ## Readability, ## Improved version. Rank issues by severity, say why each matters, and put the improved code in a fenced block. If a section has nothing, write 'None found'.",
  grade: "You audit fixes suggested by AI tools. Judge whether the fix below can be trusted for the problem described. Check: does it address the root cause, is it the smallest sufficient change, does it use only real APIs (flag invented functions), does it explain why, can it be verified, and any hidden risk. Return ONLY JSON: {\"score\":0-100,\"verdict\":\"one sentence\",\"checks\":[\"pass or fail: reason\"],\"strengths\":[],\"risks\":[],\"next\":\"one concrete next step\"}. Be strict and specific."
};

const hits = new Map(); // best-effort per-visitor limit

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const send = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  if (event.httpMethod !== "POST") return send(405, { error: "Use POST." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return send(500, { error: "The server is missing its GEMINI_API_KEY setting." });

  const ip = ((event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "anon") + "").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 6) return send(429, { error: "Too many requests. Wait a minute and try again." });
  recent.push(now);
  hits.set(ip, recent);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return send(400, { error: "Bad request." }); }

  const mode = body.mode;
  if (!PROMPTS[mode]) return send(400, { error: "Unknown mode." });
  const code = String(body.code || "").slice(0, 12000);
  const ctx = String(body.ctx || "").slice(0, 6000);
  const lang = String(body.lang || "Auto-detect").slice(0, 40);
  if (!code.trim()) return send(400, { error: "Paste some code first." });

  const text = mode === "grade"
    ? `${PROMPTS.grade}\n\nLanguage: ${lang}\n\nPROBLEM:\n${ctx}\n\nAI FIX:\n${code}`
    : `${PROMPTS[mode]}\n\nLanguage: ${lang}\n\nCODE:\n${code}\n\nCONTEXT:\n${ctx || "(none)"}`;

  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const generationConfig = { temperature: 0.2, maxOutputTokens: 2048 };
  if (mode === "grade") generationConfig.responseMimeType = "application/json";

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig })
    });
  } catch {
    return send(502, { error: "Could not reach the AI service. Try again." });
  }

  if (res.status === 429) return send(429, { error: "The free AI quota is used up for now. Try again later." });
  if (res.status === 404) return send(502, { error: "The AI model name is not available. Set GEMINI_MODEL in Netlify to a current model." });
  if (res.status === 400 || res.status === 403) return send(502, { error: "The AI service rejected the request. Check the API key and model name." });
  if (!res.ok) {
  const detail = await res.text().catch(() => "");
  return send(502, { error: `AI service error ${res.status}: ${detail.slice(0, 200)}` });
  }

  const data = await res.json().catch(() => ({}));
  const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!out) return send(502, { error: "The AI returned no answer. Try rewording or shortening your input." });

  if (mode === "grade") {
    try { return send(200, { json: JSON.parse(out.replace(/^```(?:json)?|```$/g, "").trim()) }); }
    catch { return send(502, { error: "The AI answer could not be read. Try again." }); }
  }
  return send(200, { text: out });
};
