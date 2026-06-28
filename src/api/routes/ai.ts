import { Router, Request, Response } from 'express';
import { getTTSService } from '../../ai/tts';
import { edgeTtsVoiceForLanguage, edgeTtsVoiceLabelForLanguage } from '../../constants/ttsVoices';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import multer from 'multer';

const router = Router();
const upload = multer();

/** POST /ai/tts - Cloud TTS (Edge neural voices — Urdu, Arabic, English, …) */
router.post(
    '/tts',
    validate([
        body('text').isString().notEmpty().isLength({ max: 4000 }).withMessage('Text is required'),
        body('language').optional().isString(),
        body('persona').optional().isString(),
        body('voice').optional().isString(),
    ]),
    async (req: Request, res: Response) => {
        try {
            const { text, language, voice, persona } = req.body as {
                text: string;
                language?: string;
                voice?: string;
                persona?: string;
            };
            const tts = getTTSService();
            const audioBuffer = await tts.synthesize(text, {
                language: language || 'en-US',
                persona,
                voice: voice || undefined,
            });

            res.set({
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.length,
                'Cache-Control': 'no-store',
            });
            res.send(audioBuffer);
        } catch (e: unknown) {
            console.error('TTS Route Error:', e);
            const err = e as { code?: string; message?: string };
            if (err.code === 'insufficient_quota') {
                return res.status(429).json({ error: 'TTS quota exceeded' });
            }
            res.status(500).json({ error: err.message || 'Failed to generate speech' });
        }
    }
);

/** GET /ai/tts/voices/:language — voice id + label (optional ?persona=zara|ethan) */
router.get('/tts/voices/:language', (req: Request, res: Response) => {
    const language = req.params.language || 'en-US';
    const persona = typeof req.query.persona === 'string' ? req.query.persona : 'ethan';
    res.json({
        language,
        persona,
        voice: edgeTtsVoiceForLanguage(language, persona),
        label: edgeTtsVoiceLabelForLanguage(language, persona),
    });
});

/** POST /ai/stt - Transcribe speech from audio file */
router.post(
    '/stt',
    upload.single('audio'),
    async (req: Request, res: Response) => {
        try {
            const file = (req as Request & { file?: Express.Multer.File }).file;
            if (!file) {
                return res.status(400).json({ error: 'Audio file is required' });
            }

            const { getSTTService } = await import('../../ai/stt');
            const stt = getSTTService();
            const text = await stt.transcribe(file.buffer);

            res.json({ text });
        } catch (e: unknown) {
            console.error('STT Route Error:', e);
            const message = String((e as Error)?.message ?? '');
            const backendUnavailable =
                /whisper/i.test(message) ||
                /transcription failed/i.test(message) ||
                /enoent/i.test(message);
            if (backendUnavailable) {
                return res.json({
                    text: '',
                    warning: 'Local STT backend unavailable; using fallback',
                });
            }
            res.status(500).json({ error: 'Failed to transcribe audio' });
        }
    }
);

export const aiRoutes = router;
