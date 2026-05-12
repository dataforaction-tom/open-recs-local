# Running locally

This guide walks you from a fresh clone to a working dashboard in three environments:

- **[Mac mini (native)](#mac-mini-native-ollama--docling-sidecar)** — Ollama on the host, Docling in a container, the rest in `docker compose`. Best for everyday development and demos.
- **[Linux (Docker)](#linux-docker-compose-with-optional-gpu)** — single `docker compose up`, everything in containers. Optional GPU passthrough for Ollama.
- **[Hosted mode](#hosted-mode-multi-user-deployment)** — multi-user instance with Better-auth, real email, an admin user.

Every path shares the same code. The mode flip is one env var.

---

## Prerequisites (all paths)

- **Docker Desktop** (Mac / Windows) or Docker Engine 24+ (Linux).
- **Node 20.x** and **pnpm 10.x** (via `corepack enable && corepack prepare pnpm@10 --activate`).
- ~6 GB of free disk for the Postgres + pgvector image, the Docling sidecar (if used), and Ollama models.

Clone the repo and install:

```bash
git clone https://github.com/dataforaction-tom/open-recs-local.git
cd open-recs-local
pnpm install
cp .env.example .env
```

The default `.env` boots in local mode with **fake providers** — every cross-cutting service has a working stub that returns canned data. That's enough to click through every UI surface but won't extract real recommendations from real PDFs.

---

## Quickest path: fake providers only

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Visit <http://localhost:3000>. You can:

- Upload a PDF on `/sources` — the fake OCR returns canned markdown.
- Watch the pipeline progress on the dashboard.
- Browse recommendations on `/recommendations`.
- Post progress updates and toggle status.
- View analytics on `/analytics`.

Use this path when you're working on UI / repo / job code and don't need real extraction quality.

---

## Mac mini (native Ollama + Docling sidecar)

This is the recommended path for evaluating real extraction quality on a Mac without paying for cloud LLMs.

### 1. Ollama on the host

```bash
brew install ollama
ollama serve              # in one terminal
ollama pull llama3.1:8b   # in another terminal
ollama pull nomic-embed-text
```

Ollama listens on `http://localhost:11434`.

### 2. Docling in a container

Docling does OCR + table extraction for PDFs. Run it via the bundled compose override:

```bash
docker compose -f docker-compose.yml -f docker-compose.docling.yml up -d
```

That brings up Postgres + the Docling sidecar.

### 3. Point the app at both

Edit `.env`:

```bash
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=llama3.1:8b

EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL=nomic-embed-text

OCR_PROVIDER=docling
DOCLING_BASE_URL=http://docling:5001
```

(`host.docker.internal` is Docker Desktop's bridge to the host network; substitute `localhost` if you run the app outside compose.)

### 4. Migrate and run

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Upload a real PDF on `/sources`; Docling extracts text + tables + page images, the LLM splits the document into recommendations, the embedding model populates the vector columns. Watch progress events stream on the dashboard.

---

## Linux (Docker compose, with optional GPU)

Everything in containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.docling.yml up -d
```

For Ollama with NVIDIA GPU, create `docker-compose.ollama.yml`:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
volumes:
  ollama-data:
```

Then bring everything up:

```bash
docker compose -f docker-compose.yml -f docker-compose.docling.yml -f docker-compose.ollama.yml up -d
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull nomic-embed-text
```

`.env` is the same as the Mac path but use the service hostnames:

```bash
LLM_BASE_URL=http://ollama:11434/v1
EMBEDDING_BASE_URL=http://ollama:11434/v1
```

---

## Hosted mode (multi-user deployment)

For a real multi-user instance — Better-auth, ownership requests, admin dashboard.

### Required env

```bash
APP_MODE=hosted

# 32+ random chars. Generate with `openssl rand -hex 32`.
BETTER_AUTH_SECRET=<random 32+ chars>
BETTER_AUTH_URL=https://your.app.example
FILE_TOKEN_SECRET=<random 32+ chars>

# Email for password reset + magic link.
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_…
RESEND_FROM=noreply@your.domain
```

Without `EMAIL_PROVIDER=resend`, reset and magic-link URLs go to stdout (the `console` fake) — useful for an evaluation deploy, not for a real one.

### First admin

The first user to sign up at `/signup` is promoted to `admin` automatically. Subsequent signups are `viewer`. The bootstrap fires once when `user_roles` is empty — protect access until you've created the first admin.

### Smoke-test

```bash
pnpm db:migrate
pnpm db:seed
docker compose up -d
```

Then visit your deployed URL, sign up, upload a private PDF, sign out, sign in as a second user, request access to that PDF, sign back in as admin, approve from `/admin`, sign in as the second user again — they can now see the source.

---

## Verifying after every code change

```bash
pnpm verify
```

Runs typecheck + lint + Vitest + the Next.js production build. Pre-commit hook on the project also runs this slice when relevant.

For anything touching the schema or the job pipeline, the Testcontainers-backed integration tests will start a fresh Postgres per file — first run is slow as the image pulls.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `error during connect … docker_engine` | Docker Desktop isn't started. Launch it and retry. |
| `Cannot find module` after pulling | `pnpm install` (lockfile changed). |
| Reset email never arrives in hosted mode | `EMAIL_PROVIDER=console` (the default). Set `EMAIL_PROVIDER=resend` + the two `RESEND_*` vars. |
| Embedding column type mismatch | The schema's vector dimension (default 768) must match what the embedding model emits. Re-embed if you swap models. |
| Search returns empty | Confirm `pnpm db:seed` ran (the taxonomy rows are required by some queries) and that the upload pipeline reached `status=ready` on the dashboard. |

---

## Extraction quality — local vs. hosted models

The two-pass extraction pipeline shipped in 1.1 asks the LLM to (a) summarise the document and tag it on five axes, and (b) extract every recommendation with full multi-axis tagging + confidence. A small local model like `llama3.1:8b` can complete both passes, but accuracy drops noticeably on long documents and the LLM may coin new tags rather than picking from the listed taxonomy.

The recommended split:

- **Local mode**: `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=llama3.1:8b` (or your installed Ollama model). Free, runs on the Mac mini.
- **Hosted mode**: `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-haiku-4-5`. Cents per document; meaningfully better recall + accuracy on the structured-output paths.

The `CHAT_*` env split shipped in 1.0 lets you run a heavyweight extract model alongside a lightweight streaming chat model — useful if you want Claude for extract and `qwen2.5:0.5b` (local) for chat.

Unknown tags coined by the extract LLM land as `unverified=true` in the taxonomy and surface on `/admin/tags` for promotion / rename / merge / delete. Admin operators should sweep that queue periodically.
