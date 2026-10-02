# Deploying an ArtScript app

`art build` writes everything to `dist/`:

- `index.html`, `app.js` (and `app.css`, prerendered pages, `app.js.map` when asked): the app.
- With apis: `server.js`, one self-contained file that serves the app and its api (no `node_modules`), and a `Dockerfile`.

The guides below follow from that layout. Docker and plain Node are exercised by the project's tests; the platform-specific steps haven't been run on each platform yet: check their docs if something differs.

## Apps without apis: any static host

Upload `dist/`. Routes are client-side, so unknown paths must serve the app:

- **Netlify**: a `public/_redirects` file with `/* /index.html 200` (files in `public/` are copied to `dist/`).
- **Vercel**: `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
- **Cloudflare Pages**, **GitHub Pages**: copy `index.html` to `404.html` (or use `--prerender` for the routes without params).

With `--prerender`, routes without params are real HTML files; serve `_app.html` (an empty shell) for the rest when the host allows choosing the fallback.

## A full-stack app as a static demo: `art build --demo`

```
art build --demo
```

writes only static files: the app's api, accounts and server fns are bundled in and run **in the visitor's browser**, with the same rules as the server (validation, access, relations, `private`, `readonly`), and the data is kept in that browser's localStorage. Upload `dist/` to any static host (it includes Netlify's `_redirects` and a `404.html`), with no server and no database to pay for.

It's for demos, prototypes and examples: every visitor has their own data (a "Demo · Reset" button erases it), nothing is shared between people, nothing is secret (the server fns' code is in the bundle) and emails aren't sent. The same source builds the real thing with `art build`.

On Netlify, from a repository: build command `npx art build --demo`, publish directory `dist`, `NODE_VERSION=24`.

## Apps with apis: Node 24

```
art build
cd dist && PORT=3000 node server.js
```

Data lives in `dist/data/` (SQLite `art.db`, uploads in `files/`), or in `ART_DATA_DIR`. Keep that directory on persistent storage and back it up (copy `art.db` while the server is stopped, or `sqlite3 art.db ".backup backup.db"` while it runs). Every schema change makes an automatic `art-backup-*.db` before migrating.

Run it under a supervisor (systemd, pm2) so it restarts:

```
[Service]
WorkingDirectory=/srv/app/dist
Environment=PORT=3000 ART_DATA_DIR=/srv/app/data NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
```

## Docker

```
art build
docker build -t app dist
docker run -p 3000:3000 -v app-data:/data app
```

The image has a health check (`/api/_health`) and keeps data in the `/data` volume.

## Fly.io

From `dist/`, after `fly launch --no-deploy` (it detects the Dockerfile):

```
fly volumes create data --size 1
```

and in `fly.toml`:

```
[mounts]
  source = "data"
  destination = "/data"

[http_service]
  internal_port = 3000
```

then `fly deploy`. Use a single machine: SQLite, rate limits and live streams are per process.

## Railway and Render

Deploy `dist/` with its Dockerfile, add a persistent volume mounted at `/data`, and set `PORT` if the platform requires a specific one. One instance (see above).

## Behind a proxy (HTTPS)

Terminate HTTPS at Caddy, nginx or the platform and forward to `PORT`. Pass `X-Forwarded-Proto: https` and `X-Forwarded-For` so the server sends HSTS, builds correct links in emails and OAuth, and rate-limits by the real address.

```
app.example.com {
  reverse_proxy localhost:3000
}
```

## Environment variables

| Variable | What it does |
|---|---|
| `PORT` | Port to listen on (3000). |
| `ART_DATA_DIR` | Data directory (database, uploads, outbox). |
| `ART_LOG=json` | One JSON log line per request. |
| `ART_SSR=off` | Don't render pages on the server (they're rendered per request by default, with their data). |
| `ART_CSP` | Replaces the Content-Security-Policy, or `off`. |
| `ART_MAX_JSON`, `ART_MAX_UPLOAD` | Body limits in bytes (1 MB, 10 MB). |
| `ART_RATE_LIMIT` | Api requests per address per minute (600; 0 = off). |
| `ART_RESEND_KEY`, `ART_EMAIL_FROM` | Send emails through Resend. |
| `ART_EMAIL_WEBHOOK` | Send emails as a JSON POST to this URL. |
| `ART_S3_BUCKET`, `ART_S3_KEY`, `ART_S3_SECRET`, `ART_S3_REGION`, `ART_S3_ENDPOINT` | Keep uploads in S3 or a compatible store (Cloudflare R2, MinIO, ...) instead of the data directory. |
| `ART_GOOGLE_ID`, `ART_GOOGLE_SECRET`, `ART_GITHUB_ID`, `ART_GITHUB_SECRET` | Sign-in with Google / GitHub. |

## Monitoring

- `GET /api/_health` → `{"ok":true}`.
- `GET /api/_metrics`: Prometheus text (requests by method and status, total time, open live streams).
