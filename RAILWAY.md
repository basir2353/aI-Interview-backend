# Deploy to Railway

This backend is configured for [Railway](https://railway.app) using the included `Dockerfile` and `railway.toml`.

## Quick deploy

1. Push this repo to GitHub (if not already).
2. In [Railway](https://railway.app/new), choose **Deploy from GitHub repo** and select `aI-Interview-backend`.
3. Railway detects `railway.toml` and builds with Docker (Node, ffmpeg, whisper.cpp CLI — **no large model download during build**).
4. Add a **PostgreSQL** plugin to the project — Railway injects `DATABASE_URL` automatically.
5. Set the required environment variables (see below).
6. Deploy. Tables are created automatically on first boot via `bootstrapDatabase()`.

## LLM: OpenRouter (recommended for Railway)

Ollama is **not required**. Use OpenRouter for interview questions and evaluation.

1. Get an API key at [openrouter.ai](https://openrouter.ai).
2. On your **backend** service → **Variables**, set:

   ```env
   LLM_PROVIDER=openrouter
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=openai/gpt-4o-mini
   ```

3. Remove any leftover `OLLAMA_BASE_URL` / `OLLAMA_MODEL` if you deleted the Ollama service.
4. **Redeploy the backend**, then check logs for: `OpenRouter ready (model: ...)`.
5. Smoke test: `GET /api/v1/llm/health` should return `{ "status": "ok", "service": "openrouter", ... }`.

### Optional: local Ollama (dev only)

Set `LLM_PROVIDER=ollama` with `OLLAMA_BASE_URL` and `OLLAMA_MODEL` when running Ollama locally. Not needed on Railway.

## Required environment variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Long random string for auth tokens |
| `LLM_PROVIDER` | `openrouter` (production) or `ollama` (local) |
| `OPENROUTER_API_KEY` | Required when `LLM_PROVIDER=openrouter` ([openrouter.ai](https://openrouter.ai)) |
| `OPENROUTER_MODEL` | e.g. `openai/gpt-4o-mini` |
| `FRONTEND_URL` | Your deployed frontend URL (e.g. `https://www.intervionai.online`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login credentials |

Railway sets `PORT` and `DATABASE_URL` automatically — do not override `PORT`.

## Optional environment variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Add Railway Redis plugin for session persistence (defaults to in-memory) |
| `STT_PROVIDER` | `local` (whisper.cpp in Docker, multilingual), `speaches` (Railway Speaches), or `openai` |
| `WHISPER_MODEL_PATH` | Default `/app/models/ggml-base.bin` (multilingual; set in Dockerfile) |
| `WHISPER_LANGUAGE` | `auto` (detect) or fixed: `en`, `ur`, `ar`, `fr`, `de`, `hi`, `es` |
| `SPEACHES_BASE_URL` | Speaches Railway URL, e.g. `https://speaches-xxx.up.railway.app` |
| `SPEACHES_API_KEY` | Same as `API_KEY` you set on the Speaches service |
| `SPEACHES_MODEL` | Default `Systran/faster-distil-whisper-small.en` |
| `OPENAI_API_KEY` | OpenAI Whisper when `STT_PROVIDER=openai` |
| `MAIL_*` | **SMTP email** for interview invites + password reset (see below) |

## Live email on Railway (Resend — recommended)

The app sends **email via Resend API** (preferred) or SMTP fallback.

### Resend setup

1. Create an account at [resend.com](https://resend.com) and get an API key.
2. For testing, use `onboarding@resend.dev` as the sender (Resend sandbox).
3. Add to **Railway → backend → Variables**:

```env
MAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=Intervion <onboarding@resend.dev>
MAIL_REPLY_TO=your-email@gmail.com
FRONTEND_URL=https://a-i-interview-frontend.vercel.app
```

4. Redeploy. Logs should show: `[Mail] Provider: resend, from: Intervion <onboarding@resend.dev>`

5. Test: `GET /health/mail` → `{ "status": "ok", "provider": "resend" }`

**Production:** Verify your own domain in Resend, then set e.g. `RESEND_FROM=Intervion <noreply@yourdomain.com>`.

### Emails sent automatically

| Event | Template |
|-------|----------|
| Interview scheduled | Branded invite with join link + role, date, recruiter |
| Password reset | 6-digit code + optional reset link |

Templates live in `backend/src/services/emailTemplates.ts` (Intervion branding).

### SMTP fallback (Gmail, SendGrid, etc.)

If you prefer SMTP instead of Resend:

```env
MAIL_PROVIDER=smtp
MAIL_SERVICE=gmail
MAIL_USER=...
MAIL_PASS=...app-password...
MAIL_FROM=...
```

## Live SMTP email on Railway (Gmail)

The app sends **email via SMTP** (not SMS). When configured, emails go out for:

- Interview schedule invites (join link to candidate)
- Recruiter / candidate password reset codes

### 1. Gmail App Password

1. Enable 2-Step Verification on your Google account.
2. Create an **App Password**: [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Copy the 16-character password **without spaces** (or paste with spaces — the backend strips them).

### 2. Railway Variables (backend service)

In **Railway → your backend service → Variables**, add:

```env
MAIL_SERVICE=gmail
MAIL_USER=your-sender@gmail.com
MAIL_PASS=your-16-char-app-password
MAIL_FROM=your-sender@gmail.com
MAIL_REPLY_TO=your-sender@gmail.com
FRONTEND_URL=https://a-i-interview-frontend.vercel.app
```

Also ensure `DATABASE_URL` is linked from PostgreSQL.

### 3. Redeploy

Redeploy the backend after saving variables. Check deploy logs for:

```text
[Mail] Sender configured: your-sender@gmail.com
[Mail] SMTP connection verified — interview invites and password resets will send.
```

If verify fails, check `MAIL_PASS` (must be App Password, not account password).

### 4. Test

- **Health:** `GET https://<your-backend>.up.railway.app/health/mail` → `{ "status": "ok" }`
- **Interview:** Schedule an interview from recruiter dashboard → candidate receives join link
- **Reset:** Use Forgot password on recruiter/candidate login

### Generic SMTP (SendGrid, Mailgun, Amazon SES)

```env
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=...
MAIL_PASS=...
MAIL_FROM=noreply@yourdomain.com
```

Do **not** set `MAIL_SERVICE` when using `MAIL_HOST`.

## After deploy

- Health check: `GET https://<your-service>.up.railway.app/health`
- API base: `https://<your-service>.up.railway.app/api/v1`
- Update your frontend `BACKEND_URL` (or equivalent) to the Railway service URL.

## Connect frontend

In your Next.js frontend `.env`:

```env
BACKEND_URL=https://your-backend.up.railway.app
```

Redeploy the frontend so `/api/transcribe` proxies to Railway.

## Local vs Railway

| Feature | Local | Railway (Docker) |
|---------|-------|------------------|
| PostgreSQL | Local Postgres | Railway Postgres plugin |
| LLM | Ollama or OpenRouter | Ollama template or OpenRouter |
| STT | brew install whisper-cpp + `ggml-base.bin` | **Speaches** (recommended) or `STT_PROVIDER=local` with runtime model download |

## Speaches STT (required for reliable Railway deploy)

HuggingFace model downloads (**~150MB+**) often fail during Railway Docker build (`curl: (18) transfer closed`). The Dockerfile **does not** download models at build time. Use **Speaches** (or OpenAI) for production STT.

Deploy **Speaches** / **Faster Whisper** from Railway templates (OpenAI-compatible API).

1. Deploy Speaches in the same Railway project.
2. Set a strong `API_KEY` on the Speaches service.
3. Open the Speaches URL → test transcription in the UI.
4. On your **backend** service, set:

```env
STT_PROVIDER=speaches
SPEACHES_BASE_URL=https://your-speaches.up.railway.app
SPEACHES_API_KEY=<same API_KEY as Speaches service>
SPEACHES_MODEL=Systran/faster-whisper-small
```

5. Redeploy the backend. No frontend changes — audio still goes to `/api/transcribe` on your backend.

**Why Speaches?** Avoids flaky HuggingFace downloads in Docker, faster on CPU, models cache on a volume, OpenAI-compatible API.

**Local whisper fallback:** Set `STT_PROVIDER=local` — the container entrypoint tries to download `ggml-base.bin` at **startup** (not build). If that also fails, switch to Speaches.

| Redis | Optional local | Optional Railway Redis plugin |

## Re-seed the database

**Inside the Railway container shell** (Service → backend → Shell):

```bash
npm run db:seed
# or
node prisma/seed.cjs
```

`DATABASE_URL` is already set in the container — do **not** use `railway run` inside the shell.

**From your local machine** (Railway CLI installed locally):

```bash
railway link
railway run npm run db:seed
```

The backend also seeds candidate + competencies automatically on startup via `bootstrapDatabase()`.

## Troubleshooting

- **Build fails downloading ggml-*.bin** — HuggingFace downloads are skipped at build time. Set `STT_PROVIDER=speaches` + `SPEACHES_BASE_URL` + `SPEACHES_API_KEY` on the backend (see Speaches section above). Remove `STT_PROVIDER=local` from Railway if set.
- **502 on startup** — Check deploy logs; DB bootstrap runs on boot and needs a valid `DATABASE_URL`.
- **Signup / jobs return 500** — Database is not connected. Check `GET /health/db`:
  - If `databaseUrlConfigured` is `false`, link Postgres to the backend: **Railway → backend service → Variables → Add reference → `DATABASE_URL`** from the PostgreSQL plugin.
  - Redeploy the backend after linking. Tables are created automatically on boot.
- **"Application failed to respond" (502)** — Usually a **port mismatch**:
  - Railway routes traffic to **port 8080** (see Networking → Public domain).
  - **Delete `PORT` from Railway variables** if it is set to `4000`. Railway injects `PORT=8080` automatically — do not override it.
  - Redeploy after removing `PORT`. Then `GET /health` should return `{"status":"ok"}`.
- **CORS / Socket.io** — Set `FRONTEND_URL` to your exact frontend origin (production: `https://a-i-interview-frontend.vercel.app`). For Vercel preview URLs, add `CORS_ORIGINS=https://your-preview.vercel.app`.
- **Transcription timeout** — CPU transcription is slow; consider `STT_PROVIDER=openai` for faster cloud STT.
- **Emails not sending** — Open `GET /health/mail` on your backend URL. If `not_configured`, add `MAIL_*` vars in Railway. If `error`, use a Gmail **App Password** (not your login password). Redeploy after changing variables.
