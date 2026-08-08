# Usaid Khan — Portfolio

Personal portfolio site: a static frontend (`public/`) plus a contact-form
backend that runs as a Netlify Function in production, or a small Express
server for local development without the Netlify CLI.

## Structure

```
public/                    Static site — Netlify's publish directory
  index.html
  favicon.svg, usaid.webp, USAID_RESUME.pdf
  assets/
    css/style.css          All site styles (design tokens in :root)
    js/
      main.js               Nav, cursor, scroll-reveal, typing effect, Konami egg
      particles.js           Hero canvas particle background
      contact-form.js        Contact form validation + submission
      robot.js                Hero Three.js robot widget (lazy-loaded)

netlify/functions/contact.js   Production contact-form endpoint
server/                        Standalone Express server (local dev only)
  server.js
  package.json / .env.example
shared/contact-handler.js      Validation + Turnstile + email logic shared
                                by both of the above — this is the one
                                place contact-form behaviour is defined.

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

## Environment variables

Both backends need the same four variables:

| Variable                | Purpose                                             |
|--------------------------|------------------------------------------------------|
| `SMTP_USER`              | Gmail address used to send mail                      |
| `SMTP_PASS`              | Gmail **App Password** (not your login password)     |
| `MAIL_TO`                | Where contact-form messages are delivered            |
| `TURNSTILE_SECRET_KEY`   | Cloudflare Turnstile secret (server-side)             |

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
