import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { config } from '../../config';
import { isResendConfigured, verifyResendWebhook } from '../../services/resendMail.service';
import {
  submitContactForm,
  importResendInboundEmail,
} from '../../services/contact.service';

const router = Router();

/** POST /public/contact — website contact form */
router.post(
  '/contact',
  validate([
    body('name').isString().trim().isLength({ min: 1, max: 255 }),
    body('email').isEmail().normalizeEmail(),
    body('company').optional({ values: 'null' }).isString().trim().isLength({ max: 255 }),
    body('subject').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
    body('message').isString().trim().isLength({ min: 10, max: 10000 }),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { name, email, company, subject, message } = req.body as {
        name: string;
        email: string;
        company?: string;
        subject?: string;
        message: string;
      };

      const result = await submitContactForm({ name, email, company, subject, message });

      return res.status(201).json({
        ok: true,
        id: result.submission.id,
        message: 'Thanks — we received your message and will reply soon.',
        emailSent: result.emailSent,
      });
    } catch (e) {
      console.error('[Contact] submit error', e);
      return res.status(500).json({ error: 'Failed to submit contact form. Please try again.' });
    }
  }
);

/** POST /public/resend/webhook — Resend inbound email.received events */
router.post('/resend/webhook', async (req: Request, res: Response) => {
  try {
    if (!isResendConfigured()) {
      return res.status(503).json({ error: 'Resend is not configured' });
    }

    const webhookSecret = config.contact.resendWebhookSecret;
    let event: { type?: string; data?: { email_id?: string } };

    if (webhookSecret) {
      try {
        event = verifyResendWebhook(req.body, req.headers) as typeof event;
      } catch (verifyErr) {
        console.error('[Resend webhook] verification failed', verifyErr);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else {
      event = req.body as typeof event;
    }

    if (event.type !== 'email.received') {
      return res.json({ ok: true, ignored: true });
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      return res.status(400).json({ error: 'Missing email_id' });
    }

    const submission = await importResendInboundEmail(emailId);
    return res.json({ ok: true, id: submission?.id ?? null });
  } catch (e) {
    console.error('[Resend webhook] error', e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export const publicContactRoutes = router;
