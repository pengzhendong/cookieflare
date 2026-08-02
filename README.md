# Cookieflare

[English](README.md) · [简体中文](README.zh-CN.md)

Cookieflare is a small, serverless [CookieCloud](https://github.com/easychen/CookieCloud)-compatible server for [Cloudflare Workers](https://workers.cloudflare.com/) and KV.

It stores only CookieCloud's encrypted payload. Cookieflare never decrypts cookie data and never needs your CookieCloud password. It is an independent implementation, not an official CookieCloud project.

## Features

- Runs without a NAS, VPS, or always-on computer
- Compatible with CookieCloud's upload and download endpoints
- Supports the official gzip upload format
- Optional upload token to prevent accidental overwrites
- Uses Cloudflare KV for lightweight, low-frequency synchronization

## Quick start

Install dependencies and create a KV namespace:

```bash
npm install
npx wrangler kv namespace create COOKIE_STORE
```

Replace the placeholder namespace ID in `wrangler.jsonc`, then set the UUID used by your CookieCloud client:

```bash
npx wrangler secret put COOKIECLOUD_UUID
```

Optionally protect uploads with a second secret:

```bash
npx wrangler secret put COOKIECLOUD_UPDATE_TOKEN
```

Deploy:

```bash
npm run deploy
```

## CookieCloud client settings

Use the deployed Worker URL as the endpoint:

| Setting | Value |
| --- | --- |
| Endpoint | `https://cookieflare.<account>.workers.dev` |
| UUID | The same value as `COOKIECLOUD_UUID` |
| Password | Your normal CookieCloud client password |

The password remains client-side. If `COOKIECLOUD_UPDATE_TOKEN` is configured, add this custom upload header in the extension:

```text
X-CookieCloud-Token: <your token>
```

The token is required for uploads only; downloads do not need it.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /update` | Store an encrypted CookieCloud payload |
| `GET /get/:uuid` | Retrieve the encrypted payload |
| `POST /get/:uuid` | CookieCloud-compatible download method |
| `GET /health` | Health check |

The download endpoints always return encrypted data, even when a password is supplied. This keeps decryption on the client side.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill in a test UUID, and start the local Worker:

```bash
npm run dev
```

Run the full validation suite with:

```bash
npm run verify
```

This runs type generation, TypeScript checks, a deployment dry-run, and the test suite without creating remote Cloudflare resources.

## License

Cookieflare is released under the [GNU General Public License v3.0](LICENSE).
