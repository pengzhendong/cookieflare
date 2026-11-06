<div align="center">

# Cookieflare

**A tiny CookieCloud-compatible sync server on your own Cloudflare account.**

Open source · Self-hosted · Encrypted payloads only

[简体中文](README.zh-CN.md) · [Getting started](#getting-started) · [Security model](#security-model) · [API](#api)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![CookieCloud compatible](https://img.shields.io/badge/CookieCloud-Compatible-5B8DEF)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue)

</div>

Cookieflare is an independent, serverless implementation of the [CookieCloud](https://github.com/easychen/CookieCloud) upload and download API. It runs on Cloudflare Workers and stores each client's encrypted payload in Cloudflare KV—without a NAS, VPS, or always-on computer.

> [!IMPORTANT]
> Cookieflare never receives the CookieCloud encryption password and cannot decrypt cookie contents. The admin password protects only the operations page; it does not protect `/get/:uuid`. Use a strong, unique CookieCloud password and an unguessable UUID.

## Why Cookieflare

| | What you get |
| --- | --- |
| **No server maintenance** | Workers handles requests and KV stores the latest encrypted payload. |
| **Existing client support** | Compatible upload and download routes, including gzip uploads. |
| **Payload-blind storage** | Only `encrypted`, `crypto_type`, and an internal update time are stored. |
| **Independent datasets** | Each CookieCloud UUID maps to a separate logical dataset. |
| **Basic abuse protection** | Uploads are rate-limited by UUID and client IP. |
| **Management console** | `/admin` provides paginated dataset metadata, confirmed deletion, runtime checks, service configuration, and API documentation. |

## How it works

1. CookieCloud encrypts cookies locally with the password configured in the client.
2. The client uploads the encrypted payload and its UUID to Cookieflare.
3. Cookieflare validates and stores the opaque payload under that UUID.
4. Another client downloads the payload and decrypts it locally with the same password.

Uploads for the same UUID replace the previous value. Different UUIDs remain separate.

## Getting started

### Requirements

- Node.js 22 or later
- A Cloudflare account with Workers and KV access
- A Cloudflare-managed domain only when using a custom hostname

### 1. Install and sign in

```bash
git clone --recurse-submodules https://github.com/pengzhendong/cookieflare.git
cd cookieflare
npm ci
npx wrangler login
```

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create COOKIE_STORE
```

Replace the `id` under `kv_namespaces` in `wrangler.jsonc` with the returned namespace ID.

The checked-in configuration also defines two upload rate limiters: 10 requests per minute for each UUID and 30 per minute for each client IP. Their `namespace_id` values must be unique within your Cloudflare account; change them if those IDs are already in use.

### 3. Protect the operations page

```bash
npx wrangler secret put ADMIN_PASSWORD
```

The username defaults to `admin`. Set `ADMIN_USERNAME` (for example with `wrangler secret put ADMIN_USERNAME`) to override it. These credentials protect only the management console and APIs; the CookieCloud API continues to work without them. Changing either credential invalidates existing console sessions.

### 4. Verify and deploy

```bash
npm run verify
npm run deploy
```

Wrangler prints a `workers.dev` address after deployment. Open `/health` to confirm the Worker is responding.

### 5. Connect CookieCloud

| Client setting | Value |
| --- | --- |
| Server | Your Worker base URL, without `/update` or `/get` |
| UUID | An unguessable client-generated UUID |
| Password | A strong, unique CookieCloud encryption password |

Use the same UUID and password on devices that should share one cookie set. Trigger one upload before downloading on another device.

## Optional configuration

### Keep production values out of Git

For a private deployment configuration, copy `wrangler.jsonc` to the ignored `wrangler.production.jsonc`, add the real KV ID and optional custom domain, then run:

```bash
npx wrangler secret put ADMIN_PASSWORD --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

Example custom domain route:

```jsonc
"routes": [
  { "pattern": "cookies.example.com", "custom_domain": true }
]
```

See Cloudflare's [Custom Domains documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Require an upload token

Custom clients may send either of these headers:

```text
X-CookieCloud-Token: <token>
Authorization: Bearer <token>
```

Enable validation with:

```bash
npx wrangler secret put COOKIECLOUD_UPDATE_TOKEN
```

> [!WARNING]
> Standard CookieCloud clients generally cannot add this header. Leave the secret unset for standard clients, or every upload will be rejected. The token protects uploads only; downloads remain CookieCloud-compatible.

### Serve from a path prefix

Set `API_ROOT` to a value such as `/sync` to expose `/sync/update`, `/sync/get/:uuid`, `/sync/admin`, and the other routes under that prefix.

## Security model

- Encryption and decryption happen in CookieCloud clients, not in the Worker.
- KV stores the opaque encrypted payload, its crypto type, and an internal update timestamp.
- Worker error logs contain event names only, not cookie payloads or passwords.
- Anyone who knows the endpoint and UUID can download the ciphertext. A strong client password is the primary confidentiality boundary.
- `ADMIN_PASSWORD` protects the management APIs with revocable 12-hour KV sessions. Login is rate-limited; writes require a same-origin request. `/admin/status` retains its legacy Basic Auth interface.
- `COOKIECLOUD_UPDATE_TOKEN`, when enabled, prevents unauthenticated overwrites but does not protect downloads.
- Cloudflare KV is eventually consistent, so a new upload may take a short time to appear in another location.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/update` | Store an encrypted CookieCloud payload |
| `GET` / `POST` | `/get/:uuid` | Return the encrypted payload for a UUID |
| `GET` | `/health` | Check whether the Worker is responding |
| `GET` | `/admin` | Open the WorkerKit console and session login |
| `GET` | `/admin/reference` | Standalone Scalar shell; the document still requires an admin session |
| `GET` | `/admin/api/openapi.json` | Session-protected OpenAPI 3.1 document |
| `GET` | `/admin/status` | Legacy aggregate status endpoint (Basic Auth) |

Uploads accept JSON, URL-encoded forms, multipart forms, and gzip-compressed request bodies. The current payload limit is 8 MiB.

## Operations and development

Run locally with secrets from `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Run type generation, TypeScript checks, a deployment dry-run, and tests:

```bash
npm run verify
```

Stream production logs with:

```bash
npx wrangler tail
```

If the admin password is forgotten, run `wrangler secret put ADMIN_PASSWORD` again to replace it. The authenticated console lists UUIDs and metadata, but never returns encrypted payloads or plaintext cookies. Deletion removes a snapshot; clients can upload again. Upload tokens do not grant administrator access.

## Credits

Cookieflare follows the client protocol established by [easychen/CookieCloud](https://github.com/easychen/CookieCloud). It is an independent implementation and is not affiliated with the original project.

## License

Released under the [GNU General Public License v3.0](LICENSE).

## WorkerKit integration

The public WorkerKit submodule is pinned at `vendor/worker-kit`. Existing clones should run `git submodule update --init --recursive` before `npm ci`. Install dependencies only at the project root. The console uses Nuxt UI with Vue Router. It reuses WorkerKit’s framework-independent HTTP client, optional Vue resource composable, OpenAPI operation catalog, session cancellation, native KV authentication, and runtime checks. Nuxt UI provides the layout, navigation, forms, table, confirmation dialog, theme, and notifications. CookieCloud upload/download paths, encryption formats, payload limits, and upload rate limits remain compatible. No database migration or extra password secret is required. API tokens are not issued by this console.

The data list reads at most 10 records per page, serially, and never polls storage automatically. UUIDs are access identifiers: do not share management screenshots containing real UUIDs.

The account menu opens the WorkerKit API center with a searchable catalog, method/tag filters, request/response schemas, Scalar same-origin testing, and code examples. Both views share one OpenAPI document and support `API_ROOT`. Scalar is bundled from a pinned local npm package without a CDN or persistent credentials. Write requests change real data. This integration does not issue admin API tokens; existing upload credentials grant no admin access.


### Nuxt UI local preview

```bash
npm run preview:nuxt
```

Open `http://127.0.0.1:8798/admin` and sign in with `admin` / `password`.
This command overrides credentials **only for the local process**, disables the optional upload token locally, and stores local KV data in `.wrangler/nuxt-preview`. Production credentials, bindings, and data are unchanged. Rebuild and restart the preview after frontend changes so Wrangler registers new hashed assets.

The UI and API are served by one Worker. Cookieflare keeps its lightweight native Worker/KV backend; Payload and SonicJS are not needed for encrypted snapshot storage. The pinned WorkerKit submodule supplies shared server/client capabilities without copying the full demo or other frontend candidates into this app. Upgrade the submodule in a separate change, run `npm install` to refresh the local dependency and lockfile, then run verification before deployment.

With Google Chrome installed and the local preview running, `npm run test:console` checks actual Chromium rendering and authenticated HTTP behavior, including pagination, confirmed deletion, retry, mobile navigation, same-origin API documentation, and session revocation. It only permits loopback URLs and cleans up its own synthetic snapshots. To test `API_ROOT=/sync` on another local instance, set `CONSOLE_URL=http://127.0.0.1:8799/sync`. Browser screenshots are written to ignored `test-results/`.


### Compare Vben Admin

The same Worker serves Vben at `http://127.0.0.1:8798/admin/vben`. The header links switch between Vben and Nuxt UI while sharing the real API, HttpOnly session, and KV data. Vben uses its upstream layout, tabs, preferences, and native Ant Design Vue components. Content caching and tab persistence are disabled by default so logout clears private page state.

`npm run preview` builds both frontends and starts one local Worker. Run `npm run test:console` for Nuxt UI or `npm run test:console:vben` for Vben; both check cross-frontend session reuse. Vben business pages live in `frontend-vben/` and reuse framework-independent request/session/catalog modules from `frontend/`.

The Vben build uses WorkerKit’s pinned upstream commit and pnpm workspace lockfile. Generated upstream source/dependencies stay in the submodule’s ignored `.wrangler/ui-build/` directory; shared example sources remain unchanged. pnpm is required, and the first build downloads and verifies upstream source and installs locked dependencies. `npm run build:vben` builds Vben alone; `npm run verify` builds and checks both frontends before deployment. No additional Worker or storage binding is required.

### WorkerKit 0.4 upgrade verification

The submodule is pinned to `d19416e` (0.4.0). Both consoles passed local browser checks and all 20 tests. Restoring the previous `a8778d6` pin, reinstalling and verifying, then returning to 0.4.0 also passed. CookieCloud business code, bindings, secrets and data did not change. This upgrade has not been deployed to Cookieflare production.

To roll back shared source, check out the reviewed commit inside `vendor/worker-kit`, stage the gitlink with `git add vendor/worker-kit` so doctor can verify the selected pin, run `npm install`, then `npm run verify`. Commit only after those checks pass. Database or business-data rollback is separate. Consecutive browser suites honor the real login limiter's retry window during synthetic fixture cleanup.
