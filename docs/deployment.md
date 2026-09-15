# Deployment

## Requirements

* Node.js 20 or later.
* A Chromium-based browser on the server for PDF export (Google Chrome, Chromium or
  Edge). Set `CHROME_PATH` if it is not in a standard location. Without it, HTML and
  DOCX exports still work and the PDF route answers 503.

## Run locally

```
npm install
npm run seed          # two worked examples and the four demonstration accounts
npm start             # http://localhost:4178
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4178` | HTTP port |
| `NAWI_DB` | `./nawi.db` | SQLite file; WAL mode |
| `CHROME_PATH` | auto-detected | browser used for PDF rendering |
| `ANTHROPIC_API_KEY` | unset | enables the assistant (data-plate reading, drafted remarks, explanations, questions) through Claude, model `claude-opus-5` by default |
| `GEMINI_API_KEY` | unset | alternative provider for the assistant (Google Gemini, `gemini-2.5-flash` by default; free tier available) |
| `AI_MODEL` | provider default | override the model id for either provider |

Without either key the assistant buttons are hidden and the AI routes answer 503; everything
else works unchanged. Start with the key in the environment, for example
`ANTHROPIC_API_KEY=sk-ant-... npm start`.

## Accounts

The first start creates `admin`, `engineer`, `approver` and `viewer` with
`<name>123` passwords. Change them from **Users** (admin) before exposing the service.

## Production

* Run behind a reverse proxy that terminates TLS (nginx, Caddy). The cookie is
  `HttpOnly` and `SameSite=Lax`; add `Secure` at the proxy or set it in `auth.js`
  once TLS is in place.
* Back up `nawi.db`, `nawi.db-wal` and `nawi.db-shm` together, or use
  `sqlite3 nawi.db ".backup backup.db"` for a consistent snapshot. Attachments are
  inside the database, so one file is the whole record.
* Keep the service under a process manager (`systemd`, `pm2`) with `NODE_ENV=production`.

Example `systemd` unit:

```
[Service]
WorkingDirectory=/opt/nawi
Environment=PORT=4178 NAWI_DB=/var/lib/nawi/nawi.db CHROME_PATH=/usr/bin/chromium
ExecStart=/usr/bin/node src/server.js
Restart=always
User=nawi
```

## Updating the standard

Add `rulesets/<new-id>.json` following the structure of `oiml-r76-2006.json`. It is
listed automatically when opening a test; existing reports keep the rule set they were
opened under. Run `npm test` after editing a rule set; the tests are hand-worked cases
from the standard and will fail if a constant is off.
