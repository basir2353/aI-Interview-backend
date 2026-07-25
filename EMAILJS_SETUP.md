## 0. CRITICAL — enable server-side API (Railway)

EmailJS blocks backend/Railway by default. Without this, schedule works but **mail fails with 403** and console shows:

`API access from non-browser environments is currently disabled`

1. Open https://dashboard.emailjs.com/admin/account/security  
2. Enable **Allow EmailJS API for non-browser applications** (or similar wording)  
3. Save  

Then redeploy is not required — just schedule again.

---

## Fix: “The template ID not found” (400)

Use the Template ID from template **Settings**, not the URL slug.

**Your ID:** `template_d1jf0sp`

```env
EMAILJS_TEMPLATE_ID=template_d1jf0sp
```

Set this on Railway Variables and restart the backend.

---

## Fix: “Gmail_API: Invalid grant” (412)

Gmail connection expired. In EmailJS → **Email Services** → your Gmail service → **Reconnect** / Connect again as `abasit5612345@gmail.com`, allow send permission, then test again.

---

## 1. Template fields (Settings)

| Field | Value |
|-------|--------|
| **To Email** | `{{to_email}}` |
| **From Name** | `{{from_name}}` |
| **Reply To** | `{{reply_to}}` |
| **Subject** | `{{subject}}` |
| **Content** | Switch to **HTML** → paste the template below |

## 2. Complete Intervion Content (paste into Content)

Replace the old “Grow Quickly” HTML with this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 35px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.3px;">Intervion</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.9);">Smart, bias-aware AI interviews</p>
            </td>
          </tr>

          <!-- Subject line -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0;font-size:18px;font-weight:bold;color:#111827;line-height:1.4;">
                {{subject}}
              </p>
            </td>
          </tr>

          <!-- Main body from backend (full HTML email content) -->
          <tr>
            <td style="padding:8px 24px 24px;">
              {{{message_html}}}
            </td>
          </tr>

          <!-- Plain-text fallback (shown if HTML is empty) -->
          <tr>
            <td style="padding:0 32px 8px;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">{{message}}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.6;">
                Best regards,<br />
                <strong style="color:#111827;">{{from_name}}</strong><br />
                Intervion Team
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                This email was sent by Intervion. If you did not expect it, you can ignore this message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

> **Important:** use `{{{message_html}}}` with **three** braces so interview invites / reset codes keep their HTML formatting.

### If emails look “double wrapped” (two headers)

Use this minimal Content instead (backend already sends a full branded email):

```html
{{{message_html}}}
```

## 3. Account keys

From [Account](https://dashboard.emailjs.com/admin/account):

- **Public Key** → `EMAILJS_PUBLIC_KEY`
- **Private Key** (Account → Security) → `EMAILJS_PRIVATE_KEY`

## 4. Railway / `.env`

```env
MAIL_PROVIDER=emailjs
EMAILJS_SERVICE_ID=service_w3c9jx9
EMAILJS_TEMPLATE_ID=template_d1jf0sp
EMAILJS_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
EMAILJS_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
EMAILJS_FROM_NAME=Intervion
MAIL_REPLY_TO=abasit5612345@gmail.com
CONTACT_NOTIFY_EMAIL=abasit5612345@gmail.com
```

Delete Resend vars: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`.

## 5. Variables our backend sends

| Variable | Meaning |
|----------|---------|
| `to_email` | Recipient |
| `subject` | Email subject |
| `message_html` | Full Intervion HTML body |
| `message` | Plain-text fallback |
| `reply_to` | Reply-to address |
| `from_name` | `Intervion` |

## 6. Verify

`GET /health/mail` → `provider: "emailjs"`  
Then trigger password reset or schedule an interview.

## Limits

Gmail personal via EmailJS: **500 emails / day**, **1 request / second**.
