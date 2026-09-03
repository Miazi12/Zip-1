// ============================================================
// SUPER JARVIS V11 — SECURE LLM BACKEND PROXY  (Node.js + Express)
// ------------------------------------------------------------
// The LLM API key lives ONLY here, as a server-side environment
// variable (LLM_API_KEY). It is NEVER sent to the browser/client
// and is never stored in HTML, frontend JS, localStorage or Git.
//
// Endpoints:
//   GET  /health    -> simple health check
//   POST /api/llm   -> calls the real LLM provider securely
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ---- Server-side secrets (browser never sees these) ----
const LLM_API_KEY   = process.env.LLM_API_KEY;                      // YOUR LLM key (server env only)
const LLM_BASE_URL  = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const DEFAULT_MODEL = process.env.LLM_MODEL     || 'gpt-4o-mini';
const PROXY_TOKEN   = process.env.LLM_PROXY_TOKEN || '';           // optional simple auth token
const PORT          = process.env.PORT || 3000;

// ---- CORS protection ----
// Set CORS_ORIGIN to your Super Jarvis dashboard URL in production.
// Example: CORS_ORIGIN=https://your-dashboard.onrender.com
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(function (s) { return s.trim(); });
app.use(cors({ origin: allowedOrigins.indexOf('*') > -1 ? true : allowedOrigins }));

// ---- Request size limit (prevents huge payloads) ----
app.use(express.json({ limit: '100kb' }));

// ---- Rate limiting (prevents abuse) ----
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/llm', limiter);

// ---- Simple auth (optional: set LLM_PROXY_TOKEN to enable) ----
app.use('/api/llm', function (req, res, next) {
  if (!PROXY_TOKEN) return next();                     // no token configured => open (still rate-limited)
  if (req.get('x-api-token') !== PROXY_TOKEN) return res.status(401).json({ ok: false, error: 'unauthorized' });
  next();
});

// ---- GET /health ----
app.get('/health', function (req, res) {
  res.json({ status: 'ok', provider: 'secure-proxy', providerConfigured: !!LLM_API_KEY, model: DEFAULT_MODEL, time: new Date().toISOString() });
});

// ---- POST /api/llm ----
app.post('/api/llm', async function (req, res) {
  try {
    // Honest: if the key is missing on the server, do NOT fake a success.
    if (!LLM_API_KEY) {
      return res.status(503).json({ ok: false, status: 'PROVIDER_NOT_CONFIGURED', error: 'LLM_API_KEY is not set on the server (BACKEND_REQUIRED)' });
    }
    var body = req.body || {};
    var request = body.request;
    if (typeof request !== 'string' || !request.trim()) {
      return res.status(400).json({ ok: false, status: 'INVALID_INPUT', error: 'request text is required' });
    }
    var model = body.model || DEFAULT_MODEL;
    var maxTokens = body.maxTokens || 1500;

    var upstream = await fetchWithTimeout(LLM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LLM_API_KEY },
      body: JSON.stringify({ model: model, messages: [{ role: 'user', content: request }], max_tokens: maxTokens })
    }, 30000);

    if (!upstream.ok) {
      // Provider reached but failed => BACKEND_REQUIRED (not fake success).
      return res.status(502).json({ ok: false, status: 'BACKEND_REQUIRED', error: 'upstream LLM provider failed', providerStatus: upstream.status });
    }
    var data = await upstream.json();
    var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      return res.status(502).json({ ok: false, status: 'UNKNOWN', error: 'provider returned no content' });
    }
    res.json({
      ok: true,
      status: 'completed',
      provider: 'secure-proxy',
      model: model,
      content: content,
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens || 0, outputTokens: data.usage.completion_tokens || 0 } : null
    });
  } catch (e) {
    // Safe error handling: never leak internals or the key.
    res.status(500).json({ ok: false, status: 'ERROR', error: 'internal proxy error' });
  }
});

// ---- Timeout helper (abort a stuck upstream call) ----
function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(function () { clearTimeout(t); });
}

app.listen(PORT, function () { console.log('Super Jarvis LLM proxy listening on :' + PORT); });