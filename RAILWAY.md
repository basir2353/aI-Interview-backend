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

## Troubleshooting

- **Build slow / fails on whisper.cpp** — First Docker build compiles whisper.cpp (~5–10 min). Subsequent builds cache layers.
- **502 on startup** — Check deploy logs; DB bootstrap runs on boot and needs a valid `DATABASE_URL`.
- **CORS / Socket.io** — Set `FRONTEND_URL` to your exact frontend origin.
- **Transcription timeout** — CPU transcription is slow; consider `STT_PROVIDER=openai` for faster cloud STT.
