# Cookieflare

[English](README.md) · [简体中文](README.zh-CN.md)

Cookieflare is a small, serverless [CookieCloud](https://github.com/easychen/CookieCloud)-compatible server for [Cloudflare Workers](https://workers.cloudflare.com/) and KV.

It stores only CookieCloud's encrypted payload. Cookieflare never decrypts cookie data and never needs your CookieCloud password. It is an independent implementation, not an official CookieCloud project.

## Features

- No NAS, VPS, or always-on computer required
- Compatible with CookieCloud upload and download endpoints
- Supports CookieCloud's gzip upload format
- Isolates multiple clients by their own CookieCloud UUIDs
- Rate-limits uploads per UUID with Cloudflare's native Rate Limiting API
- Optional upload token for custom clients
- Password-protected read-only operations page
- Small, low-frequency storage model backed by Cloudflare KV

## Deploy

### Requirements

- Node.js 22 or later
- A Cloudflare account with Workers and KV access
- A domain managed by Cloudflare only if you want a custom hostname

### 1. Install and authenticate

```bash
npm ci
npx wrangler login
```

### 2. Create a KV namespace

```bash
npx wrangler kv namespace create COOKIE_STORE
```

Copy the returned namespace ID into `wrangler.jsonc`, replacing the all-zero placeholder. The checked-in configuration intentionally contains no account-specific KV ID or domain.

### 3. Set the admin password

Cookieflare does not require a server-side UUID. Each CookieCloud client sends its own randomly generated UUID, and the Worker stores each UUID in a separate namespace.

```bash
npx wrangler secret put ADMIN_PASSWORD
```

The admin username is fixed as `admin`. `ADMIN_PASSWORD` protects only `/admin` and is separate from the CookieCloud UUID and client password. If you keep account-specific settings in `wrangler.production.jsonc`, append `--config wrangler.production.jsonc` to the command.

`COOKIECLOUD_UPDATE_TOKEN` is optional and is intended for custom clients that can send `X-CookieCloud-Token` or a Bearer token. Leave it unset when using a standard CookieCloud client that cannot add custom upload headers.

The default configuration limits `POST /update` to 10 requests per minute for each UUID. The limit is applied by the `RATE_LIMITER` binding and does not affect downloads. `namespace_id` must be unique within your Cloudflare account; change it in both Wrangler configurations if your account already uses `2026080201`. See Cloudflare's [Workers Rate Limiting documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### 4. Deploy

```bash
npm run verify
npm run deploy
```

For a custom domain and account-specific bindings, keep those values in the ignored `wrangler.production.jsonc` and deploy it explicitly:

```bash
npx wrangler deploy --config wrangler.production.jsonc
```

Without a route, Wrangler provides a `workers.dev` URL in its deployment output. To use your own hostname, add a custom domain route such as:

```jsonc
"routes": [
  { "pattern": "api.example.com", "custom_domain": true }
]
```

Then deploy again. See Cloudflare's [Custom Domains documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) for the requirements.

Keep any personal production configuration, domain names, and account-specific IDs outside Git. For example, this repository ignores `wrangler.production.jsonc`.

## CookieCloud client settings

Use the deployed hostname as the server endpoint:

| Setting | Value |
| --- | --- |
| Endpoint | `https://<your-worker-subdomain>.workers.dev` or your custom domain |
| UUID | The client's own random UUID; different clients may use different values |
| Password | Your normal CookieCloud client password |

Use the base endpoint; the client will call `/update` and `/get/:uuid` itself. The password remains client-side. After changing the endpoint, trigger one upload before attempting a download.

## Storage and privacy

Cookieflare stores the encrypted CookieCloud payload and its `crypto_type` in KV. It does not decrypt, inspect, or log cookie contents or passwords.

KV is eventually consistent, so a newly uploaded value can take some time to become visible in another location. Each UUID is an independent storage namespace; repeated uploads for the same UUID replace its previous value.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /update` | Store an encrypted CookieCloud payload |
| `GET /get/:uuid` | Retrieve the encrypted payload |
| `POST /get/:uuid` | CookieCloud-compatible download method |
| `GET /health` | Health check |
| `GET /admin` | Read-only operations page protected by Basic Auth |
| `GET /admin/status` | Read-only aggregate sync metadata for the operations page |

The download endpoints always return encrypted data, even when a password is supplied. Decryption stays on the client.

## Password-protected admin page

Cookieflare includes a small read-only page at `/admin`. It shows the number of stored UUID namespaces and whether any encrypted payload exists. It never returns or decrypts Cookie data.

Open `https://<your-domain>/admin` in a browser. The browser will show a username and password prompt; use the fixed username `admin` and the `ADMIN_PASSWORD` secret. Only the `/admin` page and `/admin/status` endpoint require this password, so the CookieCloud API remains compatible with standard clients.

To set or replace the production password, run:

```bash
npx wrangler secret put ADMIN_PASSWORD --config wrangler.production.jsonc
```

Wrangler prompts for the new value without displaying the existing password. Run the same command again if the password is forgotten. If `ADMIN_PASSWORD` is not configured, the admin routes intentionally return `503` rather than being exposed without protection.

## Operations

Use the Cloudflare dashboard to inspect Worker metrics, errors, and Observability logs, or stream live events with:

```bash
npx wrangler tail
```

KV values are encrypted blobs and should not be exposed through a public admin page.

## Local development

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Run the full validation suite with:

```bash
npm run verify
```

This generates Worker types, runs TypeScript checks, performs a deployment dry-run, and runs the test suite without deploying a Worker.

## License

Cookieflare is released under the [GNU General Public License v3.0](LICENSE).
