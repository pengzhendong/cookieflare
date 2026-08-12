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
| **Small operations page** | `/admin` shows aggregate service status without exposing cookie data. |

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
git clone https://github.com/pengzhendong/cookieflare.git
cd cookieflare
npm ci
npx wrangler login
```

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create COOKIE_STORE
```

Replace the all-zero `id` under `kv_namespaces` in `wrangler.jsonc` with the returned namespace ID.

The checked-in configuration also defines two upload rate limiters: 10 requests per minute for each UUID and 30 per minute for each client IP. Their `namespace_id` values must be unique within your Cloudflare account; change them if those IDs are already in use.

### 3. Protect the operations page

```bash
npx wrangler secret put ADMIN_PASSWORD
```

The username is always `admin`. This secret is required only for `/admin`; the CookieCloud API continues to work without it.

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
- `ADMIN_PASSWORD` protects only the read-only operations page and its status endpoint.
- `COOKIECLOUD_UPDATE_TOKEN`, when enabled, prevents unauthenticated overwrites but does not protect downloads.
- Cloudflare KV is eventually consistent, so a new upload may take a short time to appear in another location.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/update` | Store an encrypted CookieCloud payload |
| `GET` / `POST` | `/get/:uuid` | Return the encrypted payload for a UUID |
| `GET` | `/health` | Check whether the Worker is responding |
| `GET` | `/admin` | Open the Basic Auth-protected operations page |
| `GET` | `/admin/status` | Return aggregate status used by the operations page |

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

If the admin password is forgotten, run `wrangler secret put ADMIN_PASSWORD` again to replace it. The operations page never lists UUID values or encrypted payloads.

## Credits

Cookieflare follows the client protocol established by [easychen/CookieCloud](https://github.com/easychen/CookieCloud). It is an independent implementation and is not affiliated with the original project.

## License

Released under the [GNU General Public License v3.0](LICENSE).
