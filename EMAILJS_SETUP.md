# EmailJS setup (replaces Resend)

Dashboard template: https://dashboard.emailjs.com/admin/templates/0k8sira  
Gmail service ID: `service_w3c9jx9` (connected as `abasit5612345@gmail.com`)

## 1. Template settings (required)

Open your template and set:

| Field | Value |
|-------|--------|
| **To Email** | `{{to_email}}` |
| **From Name** | `{{from_name}}` or `Intervion` |
| **Reply To** | `{{reply_to}}` |
| **Subject** | `{{subject}}` |
| **Content** | HTML mode → paste `{{{message_html}}}` (triple braces so HTML is not escaped) |

Optional plain-text fallback in the template body:

```html
{{{message_html}}}
```

Save the template. Template ID should stay `0k8sira`.

## 2. Account keys

From [Account](https://dashboard.emailjs.com/admin/account):

- **Public Key** → `EMAILJS_PUBLIC_KEY`
- **Private Key** (Account → Security; enable if using strict mode) → `EMAILJS_PRIVATE_KEY`

## 3. Railway / `.env` variables

```env
MAIL_PROVIDER=emailjs
EMAILJS_SERVICE_ID=service_w3c9jx9
EMAILJS_TEMPLATE_ID=0k8sira
EMAILJS_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
EMAILJS_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
EMAILJS_FROM_NAME=Intervion
MAIL_REPLY_TO=abasit5612345@gmail.com
CONTACT_NOTIFY_EMAIL=abasit5612345@gmail.com
```

Remove (or leave unused):

- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_WEBHOOK_SECRET`

## 4. Verify

After redeploy:

`GET /health/mail` → `{ "status": "ok", "provider": "emailjs", ... }`

Trigger a password-reset or schedule an interview and check Gmail sent folder for `abasit5612345@gmail.com`.

## Limits

EmailJS Gmail personal service: **500 emails / day**, **1 request / second**.
