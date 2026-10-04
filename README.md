# Usaid Khan — Portfolio

Personal portfolio site: a static frontend (`public/`) plus a small backend
(contact form and the robot assistant) that runs as Netlify Functions in
production, or as an Express server for local development without the
Netlify CLI.

## Structure

```
public/                    Static site — Netlify's publish directory
  index.html
  favicon.svg, usaid.webp, USAID_Resume.pdf
  assets/
    css/style.css          Entry point — @imports the files below in order
    css/tokens.css         Design tokens (light default, dark override)
    css/*.css              base, background, components, layout, sections,
                           animations, responsive
    js/
      main.js               Nav, cursor, typing effect, 3D tilt, Konami egg
      theme.js              Dark / light toggle + persistence
      reveal.js             Scroll-reveal observer
      hero-field.js         Hero interactive particle field
      contact-form.js       Contact form validation + submission
      turnstile-init.js     Cloudflare Turnstile widget bootstrap
      robot.js              Hero Three.js robot widget (lazy-loaded)
      chat.js               Assistant panel opened from the robot
      rag-engine.js         Retrieval engine (shared with the backend)
    data/knowledge.json     Generated corpus — do not edit by hand

knowledge/                 Source documents for the assistant (one chunk each)
scripts/build-knowledge.js Compiles knowledge/*.md -> knowledge.json
tests/                     node:test suite (retrieval, handler, prompt)

netlify/functions/contact.js   Production contact-form endpoint
netlify/functions/chat.js      Production assistant endpoint (/api/chat)
server/                        Standalone Express server (local dev only)
  server.js
  package.json / .env.example
shared/contact-handler.js      Validation + Turnstile + email logic shared
                                by both of the above — this is the one
                                place contact-form behaviour is defined.
shared/chat-handler.js         Assistant logic: validate, rate-limit,
                                retrieve, generate (or quote passages)
shared/chat-prompt.js          System prompt + message construction
shared/chat-llm.js             Claude API call for the generation step
shared/rate-limit.js           In-memory sliding-window limiter

netlify.toml                   Build/publish config + /api/* redirect
.env.example                   Template for `netlify dev` (root)
```

## Running locally

**Option A — Netlify CLI (recommended, matches production):**

```bash
npm install -g netlify-cli   # if you don't have it
cp .env.example .env         # fill in real values
netlify dev
```

Serves `public/` and proxies `/api/*` to `netlify/functions/contact.js`,
exactly like production.

**Option B — plain static server + Express backend:**

```bash
# Terminal 1 — serve the static site any way you like, e.g.
npx serve public
# or open public/index.html with VS Code's Live Server

# Terminal 2 — run the contact-form backend
cd server
cp .env.example .env   # fill in real values
npm install
npm start
```

`public/assets/js/contact-form.js` auto-detects common static-server ports
(5500, 5501, 3000, 8080) and points the form at `http://localhost:5000` in
that case; everywhere else (Netlify Dev, production) it uses a relative
`/api/contact` path.

## The robot assistant

Clicking the hero robot (or the floating button once it scrolls away)
opens a small Q&A panel that answers questions about Usaid from the
portfolio and resume. It is a retrieval-augmented generation (RAG)
pipeline with no external services beyond an optional LLM call:

```
question ──► tokenize + expand synonyms
         ──► BM25 ranking over knowledge.json (title/tags weighted)
         ──► confident match? ── no ──► "I can only answer about Usaid"
                    │ yes
                    ▼
         ANTHROPIC_API_KEY set? ── no ──► quote the best passage(s)
                    │ yes
                    ▼
         Claude writes an answer grounded in the top chunks
         (falls back to quoting if the call fails or times out)
```

Design choices worth knowing:

- **Retrieval gates generation.** A question with no support in the
  corpus never reaches the model, so the endpoint can't be used as a
  general-purpose chatbot and answers stay grounded.
- **One engine, two runtimes.** `public/assets/js/rag-engine.js` is
  required by the Netlify function *and* lazy-loaded in the browser. If
  `/api/chat` is unreachable (static hosting, offline) the panel answers
  locally from the same corpus instead of showing an error.
- **Lexical, not embeddings.** ~40 short chunks rank well with BM25 plus
  a small synonym table; it is deterministic, testable and ships in a few
  KB rather than a model download.
- **Abuse limits.** 8 questions/minute and 60/hour per IP, a 500-char
  question cap, and a daily ceiling on generated answers. These are
  in-memory per function instance (best effort), so also set a spend
  limit on the API key.

### Updating what it knows

Edit or add a file in `knowledge/` (format in `knowledge/README.md`), then:

```bash
npm run build:knowledge   # regenerate public/assets/data/knowledge.json
npm test                  # retrieval regressions + corpus integrity
```

`npm test` fails if `knowledge.json` is stale or if one of the pinned
recruiter-style questions stops retrieving the right chunk.

## Environment variables

The contact form needs these four variables on both backends:

| Variable                | Purpose                                             |
|--------------------------|------------------------------------------------------|
| `SMTP_USER`              | Gmail address used to send mail                      |
| `SMTP_PASS`              | Gmail **App Password** (not your login password)     |
| `MAIL_TO`                | Where contact-form messages are delivered            |
| `TURNSTILE_SECRET_KEY`   | Cloudflare Turnstile secret (server-side)             |

The assistant adds three optional ones:

| Variable            | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Enables written answers. Unset = passage-quoting mode.         |
| `CHAT_MODEL`        | Model override (default `claude-opus-5-5`)                     |
| `CHAT_DAILY_LIMIT`  | Max generated answers per instance per day (default 300)       |

**Production note:** Netlify does **not** read a committed `.env` file for
deployed Functions — that file is only used by `netlify dev` locally. Set
these same variable names under **Site settings → Environment variables**
in the Netlify dashboard, or the contact form will fail with a 500 in
production even though it works locally.

Never commit `.env` files — `.gitignore` already excludes them; copy the
matching `.env.example` instead.

## Deployment

Netlify build settings (already in `netlify.toml`):
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Node version: pinned to 20 (`netlify/functions/contact.js` needs the
  built-in `fetch`, which requires Node >= 18)
