# Deploy to Railway

This backend is configured for [Railway](https://railway.app) using the included `Dockerfile` and `railway.toml`.

## Quick deploy

1. Push this repo to GitHub (if not already).
2. In [Railway](https://railway.app/new), choose **Deploy from GitHub repo** and select `aI-Interview-backend`.
3. Railway detects `railway.toml` and builds with Docker (includes Node, ffmpeg, whisper.cpp, and the STT model).
4. Add a **PostgreSQL** plugin to the project — Railway injects `DATABASE_URL` automatically.
5. Set the required environment variables (see below).
6. Deploy. Tables are created automatically on first boot via `bootstrapDatabase()`.

## Required environment variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Long random string for auth tokens |
| `OPENROUTER_API_KEY` | LLM for interview questions ([openrouter.ai](https://openrouter.ai)) |
| `FRONTEND_URL` | Your deployed frontend URL (e.g. `https://your-app.vercel.app`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login credentials |

Railway sets `PORT` and `DATABASE_URL` automatically — do not override `PORT`.

## Optional environment variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Add Railway Redis plugin for session persistence (defaults to in-memory) |
| `STT_PROVIDER` | `local` (default, whisper.cpp in Docker) or `openai` (uses `OPENAI_API_KEY`) |
| `OPENAI_API_KEY` | Required when `STT_PROVIDER=openai` |
| `MAIL_*` | Email settings for interview invites |

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
| LLM | Ollama or OpenRouter | OpenRouter (recommended) |
| STT | brew install whisper-cpp | Built into Docker image |
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

- **Build slow / fails on whisper.cpp** — First Docker build compiles whisper.cpp (~5–10 min). Subsequent builds cache layers.
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
