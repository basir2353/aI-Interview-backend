/**
 * Quick live smoke test: transcribe + recruiter feature probe.
 * Usage: node scripts/test-live-multilang.cjs [baseUrl]
 */
const BASE = process.argv[2] || 'https://ai-interview-backend-production-e046.up.railway.app';

function buildMinimalWav(durationSec = 1, sampleRate = 16000) {
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // silence PCM
  return buffer;
}

async function main() {
  console.log('Base URL:', BASE);

  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  console.log('Health:', health);

  const db = await fetch(`${BASE}/health/db`).then((r) => r.json());
  console.log('DB:', db.status, 'jobs:', db.jobs);

  // Transcribe: language field accepted (422/500 ok if no speech; 400 if field ignored wrong)
  const wav = buildMinimalWav();
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
  form.append('language', 'ur');

  const tr = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: form });
  const trBody = await tr.json().catch(() => ({}));
  console.log('Transcribe (language=ur):', tr.status, JSON.stringify(trBody).slice(0, 200));

  const trEn = new FormData();
  trEn.append('audio', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
  trEn.append('language', 'en-US');
  const trEnRes = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: trEn });
  const trEnBody = await trEnRes.json().catch(() => ({}));
  console.log('Transcribe (language=en-US):', trEnRes.status, JSON.stringify(trEnBody).slice(0, 200));

  // Probe new recruiter PATCH field (401 = route exists + validates auth; 400 with unknown field = old deploy)
  const patchProbe = await fetch(`${BASE}/api/v1/recruiter/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' },
    body: JSON.stringify({ defaultInterviewLanguage: 'ur' }),
  });
  const patchText = await patchProbe.text();
  console.log('Recruiter PATCH defaultInterviewLanguage probe:', patchProbe.status, patchText.slice(0, 120));

  const scheduleProbe = await fetch(`${BASE}/api/v1/recruiter/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' },
    body: JSON.stringify({
      candidateEmail: 'test@example.com',
      role: 'technical',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      interviewLanguage: 'ur',
    }),
  });
  const scheduleText = await scheduleProbe.text();
  console.log('Recruiter schedule interviewLanguage probe:', scheduleProbe.status, scheduleText.slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
