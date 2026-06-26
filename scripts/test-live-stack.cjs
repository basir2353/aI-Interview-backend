/**
 * Live production smoke tests. Run: node backend/scripts/test-live-stack.cjs
 */
const BACKEND = 'https://ai-interview-backend-production-e046.up.railway.app';
const FRONTEND = 'https://a-i-interview-frontend.vercel.app';
const SPEACHES = 'https://faster-whisper-production-f15d.up.railway.app';
const OLLAMA = 'https://ollama-production-f380.up.railway.app';

async function check(name, url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body = text.slice(0, 200);
    try {
      body = JSON.stringify(JSON.parse(text)).slice(0, 200);
    } catch {
      /* plain text */
    }
    const ok = res.ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${name}: HTTP ${res.status} ${body}`);
    return { ok, status: res.status, body: text };
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('=== Live stack diagnostics ===\n');

  await check('Backend /health', `${BACKEND}/health`);
  await check('Backend /health/db', `${BACKEND}/health/db`);
  await check('Speaches /health', `${SPEACHES}/health`);
  await check('Ollama /api/tags', `${OLLAMA}/api/tags`);
  await check('Frontend proxy /jobs', `${FRONTEND}/api/proxy/public/jobs`);

  const fs = require('fs');
  const path = require('path');
  const wav = path.join(__dirname, '..', '..', 'test-audio.wav');
  if (fs.existsSync(wav)) {
    const form = new FormData();
    form.append('audio', new Blob([fs.readFileSync(wav)]), 'test.wav');
    await check('Backend /transcribe', `${BACKEND}/api/v1/transcribe`, { method: 'POST', body: form });
    const form2 = new FormData();
    form2.append('audio', new Blob([fs.readFileSync(wav)]), 'test.wav');
    await check('Vercel /api/transcribe', `${FRONTEND}/api/transcribe`, { method: 'POST', body: form2 });
  } else {
    console.log('SKIP transcribe tests (no test-audio.wav)');
  }

  console.log('\n=== Likely fixes ===');
  console.log('1. Transcribe 500: set SPEACHES_API_KEY on backend = API_KEY from Faster Whisper service');
  console.log('   OR set STT_PROVIDER=local on Railway backend');
  console.log('2. Answer submit 500: ensure LLM_PROVIDER=openrouter + valid OPENROUTER_API_KEY');
  console.log('3. Redeploy backend after env changes (and push latest code for STT fallback)');
}

main();
