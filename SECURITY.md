# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button (Security tab of this repository). Don't open a public issue. You'll get an answer within 7 days; fixes are released as soon as they're ready and credited if you want.

## What ArtScript apps get by default

- **Passwords**: scrypt hashes, never returned by the api; minimum 8 characters.
- **Sessions**: random tokens in `HttpOnly; SameSite=Lax` cookies, 30 days, expired on the server too; `auth.logoutAll()`; a new password ends the user's other sessions.
- **Login**: 10 failed attempts per email and address in 15 minutes, then `429`.
- **Password reset and email verification**: single-use links valid for one hour, stored as SHA-256 hashes; a reset request answers the same whether the account exists or not (5 per email per hour), and a reset ends every session of the account. New accounts are always unverified.
- **Sign-in with Google/GitHub**: the flow carries a random `state` checked against an `HttpOnly` cookie; only provider-verified emails are accepted.
- **CSRF**: writes must be JSON and uploads must carry `x-file-name`, which a cross-site page can't send without a CORS preflight (never answered).
- **Access control**: `login`, `private` (rows scoped to their owner) and `admin` apis; relations can only point to rows the writer can see.
- **Validation**: every write is checked against the model and its field rules on the server.
- **Limits**: JSON bodies up to 1 MB (`ART_MAX_JSON`), uploads up to 10 MB (`ART_MAX_UPLOAD`).
- **Uploads**: name, type and size come from the server's record; anything but images, video, audio, PDF and plain text is served as a download, always with `nosniff` and a sandbox CSP.
- **XSS**: text is set with `textContent`; `javascript:`, `vbscript:` and `data:text/html` URLs from data become `#`.
- **Headers** (`art build` server): CSP (`script-src 'self'`, `ART_CSP` to change it or `off`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and HSTS behind an HTTPS proxy (`X-Forwarded-Proto: https`).
- **Static files**: the data directory, the server code and dotfiles are never served.

## Known limits

- Rate limits and live streams are per process; behind several processes, use a shared limiter at the proxy.
- No CORS: the api is meant to be served from the app's own origin.
