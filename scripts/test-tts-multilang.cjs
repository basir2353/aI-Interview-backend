#!/usr/bin/env node
/** Quick smoke test: Edge TTS Urdu + Arabic via backend service logic. */
const { EdgeTTS } = require('edge-tts-universal');

const samples = [
  { lang: 'ur', voice: 'ur-PK-UzmaNeural', text: 'سلام، میں آپ کا انٹرویو لینے والا ہوں۔' },
  { lang: 'ar', voice: 'ar-SA-ZariyahNeural', text: 'مرحباً، أنا محاورك.' },
  { lang: 'en', voice: 'en-US-JennyNeural', text: 'Hello, I am your interviewer.' },
];

(async () => {
  for (const s of samples) {
    const tts = new EdgeTTS(s.text, s.voice);
    const r = await tts.synthesize();
    const bytes = Buffer.from(await r.audio.arrayBuffer()).length;
    console.log(`OK ${s.lang}: ${bytes} bytes`);
  }
  console.log('All TTS samples passed.');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
