/*
 * WeatherMap backend.
 *
 * Why this exists:
 *   In a client-side app any API key is downloaded to the browser and is
 *   visible to every visitor. This small server keeps the Gemini key on the
 *   machine instead. The browser asks THIS server, and this server asks
 *   Google. The key never leaves the backend.
 *
 * It also serves the frontend, so one command runs the whole project and
 * there are no cross-origin problems.
 *
 * Written with Node's built-in modules only - nothing to install.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* ---- read backend/.env (simple KEY=VALUE lines) ---- */
function loadEnv() {
  const settings = {};
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return settings;

  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return;
    const at = text.indexOf("=");
    if (at === -1) return;
    settings[text.slice(0, at).trim()] =
      text.slice(at + 1).trim().replace(/^["']|["']$/g, "");
  });
  return settings;
}

const env = loadEnv();
const PORT = Number(env.PORT || 3000);
const GEMINI_KEY = env.GEMINI_KEY || "";
const GEMINI_MODELS = (env.GEMINI_MODEL || "gemini-flash-lite-latest")
  .split(",").map(m => m.trim()).filter(Boolean);
const GEMINI_HOST = env.GEMINI_HOST || "generativelanguage.googleapis.com";
const [GEMINI_HOSTNAME, GEMINI_PORT] = GEMINI_HOST.split(":");

/* ---- static file serving ---- */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".map": "application/json"
};

function serveFile(request, response) {
  const urlPath = decodeURIComponent(request.url.split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");

  /* Block path traversal and never serve the backend folder. */
  const full = path.join(ROOT, relative);
  if (!full.startsWith(ROOT) || full.startsWith(path.join(ROOT, "backend"))) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(full, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(full).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(data);
  });
}

/* ---- call Gemini (the key is attached here, on the server) ---- */
function callModel(model, question, facts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{
        text: "You are a short, friendly weather assistant inside a web app. " +
              "Answer in at most two sentences. Use ONLY the weather data below; " +
              "never invent numbers.\n\n" + facts }] },
      contents: [{ parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 200 }
    });

    const request = https.request({
      hostname: GEMINI_HOSTNAME,
      port: GEMINI_PORT ? Number(GEMINI_PORT) : 443,
      path: `/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      method: "POST",
      headers: { "Content-Type": "application/json",
                 "Content-Length": Buffer.byteLength(body) }
    }, upstream => {
      let raw = "";
      upstream.on("data", chunk => { raw += chunk; });
      upstream.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch (error) { return reject(new Error("Gemini sent an unreadable reply.")); }

        if (parsed.error) return reject(new Error(parsed.error.message));

        const answer = parsed.candidates && parsed.candidates[0] &&
                       parsed.candidates[0].content &&
                       parsed.candidates[0].content.parts[0].text;
        if (!answer) return reject(new Error("Gemini returned an empty answer."));
        resolve(answer.trim());
      });
    });

    request.on("error", () => reject(new Error("Could not reach the AI service.")));
    request.setTimeout(20000, () => { request.destroy(); reject(new Error("The AI service timed out.")); });
    request.end(body);
  });
}

/* Try each model in turn; a busy model falls through to the next. */
async function askGemini(question, facts) {
  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      return await callModel(model, question, facts);
    } catch (error) {
      lastError = error;
      console.warn(`[chat] ${model} failed: ${error.message}`);
    }
  }
  throw lastError;
}

/* ---- read a JSON request body, with a size limit ---- */
function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", chunk => {
      raw += chunk;
      if (raw.length > 20000) { request.destroy(); reject(new Error("Request too large.")); }
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch (error) { reject(new Error("Invalid JSON.")); }
    });
  });
}

const sendJson = (response, status, payload) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

/* ---- the server ---- */
const server = http.createServer(async (request, response) => {
  /* Tells the page whether the assistant can use AI. Never sends the key. */
  if (request.url === "/api/health") {
        return sendJson(response, 200, { ai: Boolean(GEMINI_KEY), models: GEMINI_MODELS });
  }

  if (request.url === "/api/chat") {
    if (request.method !== "POST") return sendJson(response, 405, { error: "Use POST." });
    if (!GEMINI_KEY) return sendJson(response, 503, { error: "No AI key configured on the server." });

    try {
      const payload = await readJson(request);
      const question = String(payload.question || "").trim();
      const facts = String(payload.facts || "").trim();

      if (!question) return sendJson(response, 400, { error: "No question was sent." });
      if (question.length > 500) return sendJson(response, 400, { error: "Question is too long." });

      const text = await askGemini(question, facts);
      return sendJson(response, 200, { text });
    } catch (error) {
      console.error("[chat]", error.message);
      return sendJson(response, 502, { error: error.message });
    }
  }

  if (request.method === "GET") return serveFile(request, response);
  sendJson(response, 404, { error: "Unknown endpoint." });
});

server.listen(PORT, () => {
  console.log(`WeatherMap running at http://localhost:${PORT}`);
  console.log(GEMINI_KEY
        ? `AI assistant: ON  (models: ${GEMINI_MODELS.join(", ")})`
    : `AI assistant: OFF (no GEMINI_KEY in backend/.env - the local engine will answer)`);
});
