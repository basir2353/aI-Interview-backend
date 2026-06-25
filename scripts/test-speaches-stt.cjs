/**
 * Test Speaches / Faster Whisper STT on Railway.
 * Usage (from backend/):
 *   set SPEACHES_API_KEY=your-key && node scripts/test-speaches-stt.cjs
 * Or put vars in .env and run: node scripts/test-speaches-stt.cjs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const baseUrl = (
  process.env.SPEACHES_BASE_URL ||
  'https://faster-whisper-production-f15d.up.railway.app'
).replace(/\/$/, '');
const apiKey = process.env.SPEACHES_API_KEY || process.env.STT_API_KEY;
const model =
  process.env.SPEACHES_MODEL ||
  process.env.STT_MODEL ||
  'Systran/faster-distil-whisper-small.en';

const wavPath = path.join(__dirname, '..', '..', 'test-audio.wav');

async function main() {
  console.log('Health:', baseUrl + '/health');
  const health = await fetch(baseUrl + '/health');
  console.log('  →', health.status, await health.text());

  if (!apiKey) {
    console.error('\nMissing SPEACHES_API_KEY.');
    console.error('Railway → Faster Whisper service → Variables → copy API_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(wavPath)) {
    console.error('Missing test-audio.wav at repo root. Run from project root first.');
    process.exit(1);
  }

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(wavPath)]), 'test.wav');
  form.append('model', model);

  console.log('\nTranscribe:', baseUrl + '/v1/audio/transcriptions');
  console.log('Model:', model);

  const res = await fetch(baseUrl + '/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const text = await res.text();
  console.log('  →', res.status, text.slice(0, 500));
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
