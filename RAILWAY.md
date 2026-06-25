# Deploy to Railway

This backend is configured for [Railway](https://railway.app) using the included `Dockerfile` and `railway.toml`.

## Quick deploy

1. Push this repo to GitHub (if not already).
2. In [Railway](https://railway.app/new), choose **Deploy from GitHub repo** and select `aI-Interview-backend`.
3. Railway detects `railway.toml` and builds with Docker (includes Node, ffmpeg, whisper.cpp, and the STT model).
4. Add a **PostgreSQL** plugin to the project — Railway injects `DATABASE_URL` automatically.
5. Set the required environment variables (see below).
6. Deploy. Tables are created automatically on first boot via `bootstrapDatabase()`.

## LLM: Ollama on Railway (interview answers)

### Which template to pick

| Template | Use when |
|----------|----------|
| **Ollama [Updated Jun '26]** (recommended) | You only need an API for your backend — best success rate in Railway templates |
| **Ollama** | Same idea, older template |
| **Ollama API** | Alternative API-focused deploy |
| **Ollama with Open WebUI** | You also want a browser UI to chat/test models (extra RAM) |

Pick **Ollama [Updated Jun '26]** unless you specifically want the Web UI.

### Step-by-step

1. In your **same Railway project** (where backend + Postgres live), click **+ New** → **Template** → **Ollama [Updated Jun '26]** → Deploy.
2. Wait until the Ollama service is **Running**.
3. Open the **Ollama** service → **Shell** and pull a model (start small on CPU):

   ```bash
   ollama pull llama3.2:3b
   ```

4. On your **backend** service → **Variables**, add:

   ```env
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://${{Ollama.RAILWAY_PRIVATE_DOMAIN}}:11434
   OLLAMA_MODEL=llama3.2:3b
   ```

   Replace `Ollama` with your Ollama service name if you renamed it. Use **Add reference** for the private domain variable.

5. **Redeploy the backend** (Variables → Deploy or push a commit).

6. Check backend logs for: `Ollama health check passed`.

### OpenRouter vs Ollama

- With `OPENROUTER_API_KEY` set, the app used to always pick OpenRouter.
- Set **`LLM_PROVIDER=ollama`** to force Ollama even if OpenRouter key exists.
- Set **`LLM_PROVIDER=openrouter`** to force OpenRouter.

### Notes

- Ollama on Railway **CPU** is slow for large models — use `llama3.2:3b` or `phi3:mini`.
- For faster answers, keep **OpenRouter** (`LLM_PROVIDER=openrouter`) instead of self-hosted Ollama.
- Backend talks to Ollama over **Private Networking** — do not expose Ollama publicly unless you add auth.

## Required environment variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Long random string for auth tokens |
| `OPENROUTER_API_KEY` | LLM when `LLM_PROVIDER=openrouter` ([openrouter.ai](https://openrouter.ai)) |
| `LLM_PROVIDER` | `ollama` or `openrouter` (optional; see Ollama section above) |
| `OLLAMA_BASE_URL` | Ollama API URL when using `LLM_PROVIDER=ollama` |
| `OLLAMA_MODEL` | Model name, e.g. `llama3.2:3b` |
| `FRONTEND_URL` | Your deployed frontend URL (e.g. `https://your-app.vercel.app`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login credentials |

Railway sets `PORT` and `DATABASE_URL` automatically — do not override `PORT`.

## Optional environment variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Add Railway Redis plugin for session persistence (defaults to in-memory) |
| `STT_PROVIDER` | `local` (whisper.cpp in Docker), `speaches` (Railway Speaches), or `openai` |
| `SPEACHES_BASE_URL` | Speaches Railway URL, e.g. `https://speaches-xxx.up.railway.app` |
| `SPEACHES_API_KEY` | Same as `API_KEY` you set on the Speaches service |
| `SPEACHES_MODEL` | Default `Systran/faster-distil-whisper-small.en` |
| `OPENAI_API_KEY` | OpenAI Whisper when `STT_PROVIDER=openai` |
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
| LLM | Ollama or OpenRouter | Ollama template or OpenRouter |
| STT | brew install whisper-cpp | Built into Docker image, or Speaches on Railway |

## Speaches STT (recommended for production)

Deploy **Speaches** from Railway templates (search “Speaches” — pick the one with OpenAI-compatible API, ~100% health).

1. Deploy Speaches in the same Railway project.
2. Set a strong `API_KEY` on the Speaches service.
3. Open the Speaches URL → test transcription in the Gradio UI.
4. On your **backend** service, set:

```env
STT_PROVIDER=speaches
SPEACHES_BASE_URL=https://your-speaches.up.railway.app
SPEACHES_API_KEY=<same API_KEY as Speaches service>
SPEACHES_MODEL=Systran/faster-distil-whisper-small.en
```

5. Redeploy the backend. No frontend changes — audio still goes to `/api/transcribe` on your backend.

**Why Speaches?** Faster than whisper.cpp on CPU, models cache on a volume, OpenAI-compatible API, and you can remove heavy STT from the backend image over time.

**Note:** Your transcript already works with built-in whisper.cpp. The “Failed to submit answer” error is from the **LLM** (Ollama/OpenRouter), not STT — fix `LLM_PROVIDER=openrouter` first.
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
