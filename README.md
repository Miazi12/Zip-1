# Super Jarvis V11 — Secure LLM Proxy (ব্যাকএন্ড)

এই ছোট ব্যাকএন্ড প্রজেক্টটার কাজ: আপনার Super Jarvis V11-কে একটা **আসল LLM** (যেমন OpenAI) দিয়ে
**নিরাপদে** কথা বলানো। API key এখানে **সার্ভারে** থাকে, ব্রাউজারে বা কোডে **কখনো** থাকে না।

> ⚠️ **নিয়ম:** LIVE বলবো না যতক্ষণ না deploy-করা backend দিয়ে একটা আসল LLM request সফল হয়।
> key-র কোনো copy কখনো HTML/JavaScript/Git/localStorage-তে দিও না।

---

## এই ফোল্ডারে কোন কোন ফাইল বানানো হয়েছে

| ফাইল | কাজ |
|---|---|
| `server.js` | আসল সার্ভার। `/health` ও `/api/llm` endpoজগুলো চালায় |
| `package.json` | Node.js-এর নির্ভরতা (express, cors, rate-limit) |
| `.env.example` | কোন পরিবেশ ভেরিয়েবল (secrets) দিতে হবে তার নমুনা |
| `render.yaml` | Render-এ deploy-এর auto-config |
| `.gitignore` | `.env` ও `node_modules`-কে GitHub-এ যেতে বাধা দেয় |

---

## ১. আপনার LLM key কোথায় বসবে (সবচেয়ে গুরুত্বপূর্ণ)

**Key শুধু সার্ভারের একটা secret-এ** — Render-এর dashboard-এ, কখনো কোডে নয়।

1. `secure-llm-proxy` ফোল্ডারটা আপনার GitHub-এ push করুন (key ছাড়া)।
2. Render-এ deploy করুন (নিচের ধাপ দেখুন)।
3. Render dashboard → আপনার service → **Environment** → Add variable:
   - **Key:** `LLM_API_KEY`
   - **Value:** আপনার আসল LLM key (যেমন `sk-...`)
4. Save. (এটা auto secret-ভাবে লুকানো থাকে।)

## ২ ধাপ — Render-এ deploy করা (ছবিসহ বোঝা)

1. Render.com-এ বিনামূল্যে অ্যাকাউন্ট খুলুন।
2. **New → Web Service**।
3. আপনার GitHub repository বাছাই করুন (যেখানে proxy ফাইল আছে)।
4. Render নিজেই `npm install` ও `npm start` চালাবে (সেটা `package.json` ও `render.yaml`-এ দেওয়া আছে)।
5. **Environment Variables** অংশে `LLM_API_KEY` সেট করুন (উপরে ধাপ ১)।
6. **Create Web Service** চাপুন। কয়েক মিনিটে online হয়ে যাবে।

---

## ৩ ধাপ — আপনার backend-এর HTTPS URL কীভাবে পাবেন

Deploy শেষ হলে Render আপনাকে একটা URL দেয়, যেমন:
```
https://super-jarvis-llm-proxy.onrender.com
```
**এইটা আপনার backend URL।** লিখে রাখুন — Super Jarvis-এ এটাই বসাবেন।

> চেক করতে browser-এ যান: `https://super-jarvis-llm-proxy.onrender.com/health`
> দেখবেন: `{"status":"ok","providerConfigured":true,...}` (মানে key ঠিকঠাক বসেছে)।

---

## ৪) আপনার V11 AIProvider কীভাবে এই URL ব্যবহার করবে

আপনার Super Jarvis dashboard-এর JavaScript-এ (client side) কেবল **URL** আর **model** দেবেন — key নয়:

```js
const PROXY_URL = 'https://super-jarvis-llm-proxy.onrender.com'; // আপনার URL
window.SV11.AIProvider.registerProvider('secure-openai', {
  type: 'openai', configured: true, enabled: true,
  supportsStructured: true, supportsToolCalling: true,
  models: ['gpt-4o-mini', 'gpt-4o'],
  source: 'secure-proxy',
  fetch: function (req) {
    return fetch(PROXY_URL + '/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },   // key এখানে নেই
      body: JSON.stringify({ request: req.request, model: req.model })
    }).then(function (r) { return r.json(); });
  }
});
const c = window.SV11.AIProvider.connect('secure-openai', { model: 'gpt-4o-mini' });
// c.status হবে 'connected' (runtimePath true) — তারপর:
// window.SV11.AIProvider.healthFor('secure-openai').status  -> 'CONNECTED'
// window.SV11.AgentLoop.run('...', { mode: 'auto' })  -> LLM_STRUCTURED (LIVE)
```

Super Jarvis-এর আসল **Brain / ModelRouter / AgentLoop / SJ.execute() / Verifier / State / Memory / History**
একই থাকবে — কোনো second system তৈরি হয়নি। Proxy শুধু key-টা নিরাপদে ধরে LLM-কে ডাকে।

---

## সততার নিয়ম

- `LLM_API_KEY` সার্ভারে না বসালে `/api/llm` → **`PROVIDER_NOT_CONFIGURED`** (BACKEND_REQUIRED) দেবে — **কখনো fake success না।**
- LLM upstream fail করলে → **`BACKEND_REQUIRED`**।
- প্রথমবার আসল LLM request সফল না হওয়া পর্যন্ত এটাকে **LIVE বলো না।**
- Key কখনোই সার্ভারের বাইরে যায় না।

---

## এখন কী করবেন (non-technical তালিকা)

1. GitHub-এ এই ফোল্ডার push করুন।
2. Render-এ deploy করুন + `LLM_API_KEY` দিন।
3. `/health` URL খুলে চেক করুন `providerConfigured:true`।
4. উপরের `fetch` কোডটা Super Jarvis-এ বসান (শুধু URL আর model)।
5. তারপর `AgentLoop` চালান — ব্যস, LIVE LLM reasoning।

তৈরি শেষ — আপনার Super Jarvis V11-এর নিরাপদ LLM backend রেডি। 🎉