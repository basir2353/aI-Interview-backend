/** Cloud TTS speed — Edge prosody rate (0% = natural pace, easier to follow). */
export const EDGE_TTS_PROSODY_RATE =
  (process.env.EDGE_TTS_RATE || '+0%').trim() || '+0%';
