/** Cloud TTS speed — Edge prosody rate (+30% ≈ noticeably faster, natural). */
export const EDGE_TTS_PROSODY_RATE =
  (process.env.EDGE_TTS_RATE || '+30%').trim() || '+30%';
