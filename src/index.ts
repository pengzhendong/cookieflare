const MAX_COMPRESSED_BODY_BYTES = 8 * 1024 * 1024;
const MAX_DECOMPRESSED_BODY_BYTES = 8 * 1024 * 1024;
const MAX_ENCRYPTED_CHARS = 8 * 1024 * 1024;
const COOKIE_STORE_PREFIX = "cookiecloud:v1:";
const ADMIN_PATH = "/admin";
const ADMIN_USERNAME = "admin";

export type WorkerEnv = Omit<
  Env,
  "API_ROOT" | "ADMIN_PASSWORD"
> & {
  /** Optional path prefix for deployments behind a subpath. */
  API_ROOT?: string;
  /** Secret: the UUID configured in the CookieCloud client. */
  COOKIECLOUD_UUID?: string;
  /** Optional secret for protecting uploads from accidental overwrites. */
  COOKIECLOUD_UPDATE_TOKEN?: string;
  /** Secret used by the Basic Auth-protected admin page. */
  ADMIN_PASSWORD?: string;
};

type UpdatePayload = Record<string, unknown>;

interface StoredRecord {
  encrypted: string;
  crypto_type: string;
  updated_at?: string;
}

type LogFields = Record<string, boolean | number | string>;

type AdminAuthResult =
  | { authenticated: true }
  | { response: Response };

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function logError(event: string, fields: LogFields = {}): void {
  console.error(JSON.stringify({ event, ...fields }));
}

const adminSecurityHeaders: HeadersInit = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cookieflare · Admin</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f4f5f7;
        color: #202124;
      }
      @media (prefers-color-scheme: dark) {
        :root { background: #17181b; color: #f2f3f5; }
        .card { background: #222428; border-color: #35383e; }
        .muted { color: #aeb4bd; }
        .value { color: #f2f3f5; }
        button { background: #f2f3f5; color: #17181b; }
      }
      body { margin: 0; min-height: 100vh; }
      main { box-sizing: border-box; max-width: 920px; margin: 0 auto; padding: 56px 22px 48px; }
      .eyebrow { color: #68707d; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 10px 0 8px; font-size: clamp(32px, 6vw, 52px); letter-spacing: -.04em; }
      .intro { max-width: 640px; margin: 0; color: #68707d; line-height: 1.65; }
      @media (prefers-color-scheme: dark) { .eyebrow, .intro { color: #aeb4bd; } }
      .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 34px 0 16px; }
      .toolbar h2 { margin: 0; font-size: 18px; }
      button { border: 0; border-radius: 999px; padding: 10px 16px; background: #202124; color: #fff; cursor: pointer; font: inherit; font-weight: 700; }
      button:disabled { cursor: wait; opacity: .65; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
      .card { min-height: 104px; box-sizing: border-box; padding: 20px; border: 1px solid #dde1e7; border-radius: 18px; background: #fff; }
      .label { color: #68707d; font-size: 13px; }
      .value { display: block; margin-top: 10px; color: #202124; font-size: 21px; font-weight: 750; overflow-wrap: anywhere; }
      .muted { color: #68707d; font-size: 13px; }
      .note { margin-top: 18px; padding: 16px 18px; border-left: 3px solid #6d5efc; border-radius: 8px; background: rgba(109, 94, 252, .09); line-height: 1.6; }
      footer { margin-top: 36px; color: #68707d; font-size: 12px; line-height: 1.6; }
      @media (prefers-color-scheme: dark) { footer { color: #aeb4bd; } }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Private operations dashboard · 私有运维面板</div>
      <h1>Cookieflare</h1>
      <p class="intro">A read-only view of the CookieCloud sync service. Encrypted cookie contents are never displayed here.<br>这里只显示 CookieCloud 同步服务的只读状态，不会展示 Cookie 内容。</p>
      <div class="toolbar">
        <h2>Service status · 服务状态</h2>
        <button id="refresh" type="button">Refresh · 刷新</button>
      </div>
      <section class="grid" aria-live="polite">
        <article class="card"><span class="label">Service · 服务</span><strong class="value" id="service-status">Loading…</strong></article>
        <article class="card"><span class="label">Storage · 存储</span><strong class="value" id="storage-status">Loading…</strong></article>
        <article class="card"><span class="label">Payload · 数据</span><strong class="value" id="payload-status">Loading…</strong></article>
        <article class="card"><span class="label">Cipher · 加密类型</span><strong class="value" id="crypto-type">—</strong></article>
        <article class="card"><span class="label">Payload size · 数据大小</span><strong class="value" id="payload-size">—</strong></article>
        <article class="card"><span class="label">Last upload · 最近上传</span><strong class="value" id="last-upload">—</strong></article>
      </section>
      <div class="note" id="message">Loading status… · 正在加载状态…</div>
      <footer>Authenticated as · 当前身份：<span id="identity">admin</span><br>Cookieflare stores only the encrypted CookieCloud payload in Cloudflare KV.</footer>
    </main>
    <script>
      const refreshButton = document.getElementById('refresh');
      const statusUrl = new URL(window.location.href);
      statusUrl.pathname = statusUrl.pathname.replace(/\/$/, '') + '/status';

      function setText(id, value) {
        document.getElementById(id).textContent = value;
      }

      function formatBytes(bytes) {
        if (typeof bytes !== 'number') return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      function formatDate(value) {
        if (!value) return 'Not available · 暂无';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
      }

      async function loadStatus() {
        refreshButton.disabled = true;
        setText('message', 'Loading status… · 正在加载状态…');
        try {
          const response = await fetch(statusUrl, { credentials: 'same-origin', cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Request failed');
          setText('service-status', data.status === 'ok' ? 'Operational · 正常' : 'Degraded · 异常');
          setText('storage-status', data.storage || '—');
          setText('payload-status', data.payload && data.payload.present ? 'Available · 已同步' : 'Empty · 尚未上传');
          setText('crypto-type', data.payload && data.payload.crypto_type || '—');
          setText('payload-size', data.payload && data.payload.present ? formatBytes(data.payload.bytes) : '—');
          setText('last-upload', data.payload && data.payload.present ? formatDate(data.payload.last_updated_at) : 'Not available · 暂无');
          setText('identity', data.authenticated_as || 'admin');
          setText('message', data.payload && data.payload.present ? 'The latest encrypted payload is available. · 最新加密数据已存在。' : 'No encrypted payload has been uploaded yet. · 还没有上传加密数据。');
        } catch (error) {
          setText('service-status', 'Unavailable · 不可用');
          setText('message', error instanceof Error ? error.message : 'Unable to load status');
        } finally {
          refreshButton.disabled = false;
        }
      }

      refreshButton.addEventListener('click', loadStatus);
      loadStatus();
    </script>
  </body>
</html>`;

const baseHeaders = (): HeadersInit => ({
  "Access-Control-Allow-Headers":
    "Content-Type, Content-Encoding, Authorization, X-CookieCloud-Token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      ...baseHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function adminTextResponse(
  body: string,
  status: number,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      ...adminSecurityHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function adminJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...adminSecurityHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function adminHtmlResponse(): Response {
  return new Response(ADMIN_HTML, {
    status: 200,
    headers: {
      ...adminSecurityHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function normalizeApiRoot(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function apiPath(apiRoot: string, suffix: string): string {
  return `${apiRoot}${suffix}`;
}

function keyForUuid(uuid: string): string {
  return `${COOKIE_STORE_PREFIX}${encodeURIComponent(uuid)}`;
}

function configuredUuid(env: WorkerEnv): string | null {
  const uuid = env.COOKIECLOUD_UUID?.trim();
  return uuid ? uuid : null;
}

interface BasicCredentials {
  username: string;
  password: string;
}

function parseBasicCredentials(request: Request): BasicCredentials | null {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("basic ")) return null;

  try {
    const decoded = atob(authorization.slice("basic ".length).trim());
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const credentials = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes);
    const separator = credentials.indexOf(":");
    if (separator < 0) return null;
    return {
      username: credentials.slice(0, separator),
      password: credentials.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function adminAuthChallenge(): Response {
  return adminTextResponse("Unauthorized", 401, {
    "WWW-Authenticate": 'Basic realm="Cookieflare Admin", charset="UTF-8"',
  });
}

async function authorizeAdmin(
  request: Request,
  env: WorkerEnv,
): Promise<AdminAuthResult> {
  const expectedPassword = env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    logError("admin_password_missing");
    return {
      response: adminTextResponse("Admin password is not configured", 503),
    };
  }

  const suppliedCredentials = parseBasicCredentials(request);
  if (
    !suppliedCredentials ||
    suppliedCredentials.username !== ADMIN_USERNAME ||
    !(await constantTimeEqual(suppliedCredentials.password, expectedPassword))
  ) {
    return { response: adminAuthChallenge() };
  }
  return { authenticated: true };
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (
      a: ArrayBuffer | ArrayBufferView,
      b: ArrayBuffer | ArrayBufferView,
    ) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual.call(crypto.subtle, leftHash, rightHash);
  }

  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function extractBearerToken(request: Request): string | null {
  const directToken = request.headers.get("X-CookieCloud-Token")?.trim();
  if (directToken) return directToken;

  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice("bearer ".length).trim();
  return token || null;
}

async function isAuthorizedUuid(uuid: string, env: WorkerEnv): Promise<boolean> {
  const expectedUuid = configuredUuid(env);
  return expectedUuid !== null && (await constantTimeEqual(uuid, expectedUuid));
}

async function isAuthorizedUpdate(
  request: Request,
  uuid: string,
  env: WorkerEnv,
): Promise<boolean> {
  if (!(await isAuthorizedUuid(uuid, env))) return false;

  const expectedToken = env.COOKIECLOUD_UPDATE_TOKEN?.trim();
  if (!expectedToken) return true;

  const suppliedToken = extractBearerToken(request);
  return suppliedToken !== null && (await constantTimeEqual(suppliedToken, expectedToken));
}

function readString(payload: UpdatePayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function parseStoredRecord(value: string): StoredRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Partial<StoredRecord>;
    if (typeof record.encrypted !== "string" || !record.encrypted) {
      return null;
    }
    return {
      encrypted: record.encrypted,
      crypto_type:
        typeof record.crypto_type === "string" ? record.crypto_type : "legacy",
      updated_at:
        typeof record.updated_at === "string" ? record.updated_at : undefined,
    };
  } catch {
    return null;
  }
}

async function readStreamWithinLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("request body too large");
        throw new HttpError(413, "Payload Too Large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readRequestBytes(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_COMPRESSED_BODY_BYTES) {
      throw new HttpError(413, "Payload Too Large");
    }
  }

  if (!request.body) return new Uint8Array();
  const compressedBytes = await readStreamWithinLimit(
    request.body,
    MAX_COMPRESSED_BODY_BYTES,
  );
  const encoding = request.headers.get("Content-Encoding")?.trim().toLowerCase();
  if (!encoding || encoding === "identity") return compressedBytes;
  if (encoding !== "gzip") throw new HttpError(415, "Unsupported Content-Encoding");

  try {
    const decompressedStream = new Response(compressedBytes).body?.pipeThrough(
      new DecompressionStream("gzip"),
    );
    if (!decompressedStream) throw new Error("Unable to create decompression stream");
    return await readStreamWithinLimit(
      decompressedStream,
      MAX_DECOMPRESSED_BODY_BYTES,
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Bad Request");
  }
}

async function parseUpdatePayload(request: Request): Promise<UpdatePayload> {
  const bytes = await readRequestBytes(request);
  const rawContentType = request.headers.get("Content-Type") ?? "";
  const contentType = rawContentType.toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await new Response(bytes, {
        headers: { "Content-Type": rawContentType },
      }).formData();
      return Object.fromEntries(
        [...formData.entries()].filter(([, value]) => typeof value === "string"),
      );
    } catch {
      throw new HttpError(400, "Bad Request");
    }
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new HttpError(400, "Bad Request");
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON body must be an object");
    }
    return parsed as UpdatePayload;
  } catch {
    throw new HttpError(400, "Bad Request");
  }
}

function uuidFromGetPath(pathname: string, apiRoot: string): string | null {
  const prefix = apiPath(apiRoot, "/get/");
  if (!pathname.startsWith(prefix)) return null;

  const encodedUuid = pathname.slice(prefix.length).replace(/\/+$/, "");
  if (!encodedUuid || encodedUuid.includes("/")) return null;

  try {
    const uuid = decodeURIComponent(encodedUuid);
    return uuid && !uuid.includes("/") && !uuid.includes("\\") ? uuid : null;
  } catch {
    return null;
  }
}

async function handleUpdate(request: Request, env: WorkerEnv): Promise<Response> {
  if (!configuredUuid(env)) {
    logError("missing_configuration", { key: "COOKIECLOUD_UUID" });
    return textResponse("Internal Serverless Error", 500);
  }

  let payload: UpdatePayload;
  try {
    payload = await parseUpdatePayload(request);
  } catch (error) {
    if (error instanceof HttpError) return textResponse(error.message, error.status);
    return textResponse("Bad Request", 400);
  }

  const uuid = readString(payload, "uuid")?.trim() ?? "";
  const encrypted = readString(payload, "encrypted") ?? "";
  if (!uuid || !encrypted) return textResponse("Bad Request", 400);
  if (encrypted.length > MAX_ENCRYPTED_CHARS) {
    return textResponse("Payload Too Large", 413);
  }
  if (!(await isAuthorizedUpdate(request, uuid, env))) {
    return textResponse("Not Found", 404);
  }

  const requestedCryptoType = readString(payload, "crypto_type")?.trim();
  const cryptoType = requestedCryptoType || "legacy";
  if (cryptoType.length > 64) return textResponse("Bad Request", 400);

  const record: StoredRecord = {
    encrypted,
    crypto_type: cryptoType,
    updated_at: new Date().toISOString(),
  };

  try {
    await env.COOKIE_STORE.put(keyForUuid(uuid), JSON.stringify(record));
  } catch {
    logError("kv_put_failed");
    return textResponse("Internal Serverless Error", 500);
  }
  return jsonResponse({ action: "done" });
}

async function handleGet(uuid: string, env: WorkerEnv): Promise<Response> {
  if (!configuredUuid(env) || !(await isAuthorizedUuid(uuid, env))) {
    return textResponse("Not Found", 404);
  }

  let value: string | null;
  try {
    value = await env.COOKIE_STORE.get(keyForUuid(uuid), "text");
  } catch {
    logError("kv_get_failed");
    return textResponse("Internal Serverless Error", 500);
  }
  if (value === null) return textResponse("Not Found", 404);

  const record = parseStoredRecord(value);
  if (!record) {
    logError("invalid_stored_record");
    return textResponse("Internal Serverless Error", 500);
  }
  return jsonResponse({
    encrypted: record.encrypted,
    crypto_type: record.crypto_type,
  });
}

async function handleAdminPage(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const authorization = await authorizeAdmin(request, env);
  if ("response" in authorization) return authorization.response;
  return adminHtmlResponse();
}

async function handleAdminStatus(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const authorization = await authorizeAdmin(request, env);
  if ("response" in authorization) return authorization.response;

  const uuid = configuredUuid(env);
  if (!uuid) {
    logError("missing_configuration", { key: "COOKIECLOUD_UUID" });
    return adminJsonResponse(
      { status: "degraded", message: "CookieCloud UUID is not configured" },
      500,
    );
  }

  let value: string | null;
  try {
    value = await env.COOKIE_STORE.get(keyForUuid(uuid), "text");
  } catch {
    logError("admin_kv_get_failed");
    return adminJsonResponse(
      { status: "degraded", message: "Unable to read storage" },
      500,
    );
  }

  if (value === null) {
    return adminJsonResponse({
      status: "ok",
      storage: "cloudflare-kv",
      uuid_configured: true,
      payload: {
        present: false,
        bytes: null,
        crypto_type: null,
        last_updated_at: null,
      },
      authenticated_as: ADMIN_USERNAME,
    });
  }

  const record = parseStoredRecord(value);
  if (!record) {
    logError("invalid_stored_record");
    return adminJsonResponse(
      { status: "degraded", message: "Stored record is invalid" },
      500,
    );
  }

  return adminJsonResponse({
    status: "ok",
    storage: "cloudflare-kv",
    uuid_configured: true,
    payload: {
      present: true,
      bytes: new TextEncoder().encode(record.encrypted).byteLength,
      crypto_type: record.crypto_type,
      last_updated_at: record.updated_at ?? null,
    },
    authenticated_as: ADMIN_USERNAME,
  });
}

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const apiRoot = normalizeApiRoot(env.API_ROOT);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders() });

    if (request.method === "GET" && url.pathname === apiPath(apiRoot, "/health")) {
      return jsonResponse({ status: "OK", storage: "cloudflare-kv" });
    }

    if (request.method === "GET" && url.pathname === apiPath(apiRoot, ADMIN_PATH)) {
      return handleAdminPage(request, env);
    }

    if (
      request.method === "GET" &&
      url.pathname === apiPath(apiRoot, `${ADMIN_PATH}/status`)
    ) {
      return handleAdminStatus(request, env);
    }

    if (url.pathname === apiPath(apiRoot, "/") && request.method === "GET") {
      return textResponse("CookieCloud API", 200);
    }

    if (url.pathname === apiPath(apiRoot, "/update") && request.method === "POST") {
      return handleUpdate(request, env);
    }

    if (request.method === "GET" || request.method === "POST") {
      const uuid = uuidFromGetPath(url.pathname, apiRoot);
      if (uuid !== null) return handleGet(uuid, env);
    }

    return textResponse("Not Found", 404);
  },
};

export default worker;
