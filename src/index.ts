const MAX_COMPRESSED_BODY_BYTES = 25 * 1024 * 1024;
const MAX_DECOMPRESSED_BODY_BYTES = 25 * 1024 * 1024;
const MAX_ENCRYPTED_CHARS = 24 * 1024 * 1024;
const COOKIE_STORE_PREFIX = "cookiecloud:v1:";

export type WorkerEnv = Env & {
  /** Secret: the UUID configured in the CookieCloud client. */
  COOKIECLOUD_UUID?: string;
  /** Optional secret for protecting uploads from accidental overwrites. */
  COOKIECLOUD_UPDATE_TOKEN?: string;
};

type UpdatePayload = Record<string, unknown>;

interface StoredRecord {
  encrypted: string;
  crypto_type: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (
      a: ArrayBuffer | ArrayBufferView,
      b: ArrayBuffer | ArrayBufferView,
    ) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual.call(crypto.subtle, leftBytes, rightBytes);
  }

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

function isAuthorizedUuid(uuid: string, env: WorkerEnv): boolean {
  const expectedUuid = configuredUuid(env);
  return expectedUuid !== null && constantTimeEqual(uuid, expectedUuid);
}

function isAuthorizedUpdate(request: Request, uuid: string, env: WorkerEnv): boolean {
  if (!isAuthorizedUuid(uuid, env)) return false;

  const expectedToken = env.COOKIECLOUD_UPDATE_TOKEN?.trim();
  if (!expectedToken) return true;

  const suppliedToken = extractBearerToken(request);
  return suppliedToken !== null && constantTimeEqual(suppliedToken, expectedToken);
}

function readString(payload: UpdatePayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
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
  if (!configuredUuid(env)) return textResponse("Internal Serverless Error", 500);

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
  if (!isAuthorizedUpdate(request, uuid, env)) {
    return textResponse("Not Found", 404);
  }

  const requestedCryptoType = readString(payload, "crypto_type")?.trim();
  const cryptoType = requestedCryptoType || "legacy";
  if (cryptoType.length > 64) return textResponse("Bad Request", 400);

  const record: StoredRecord = {
    encrypted,
    crypto_type: cryptoType,
  };

  try {
    await env.COOKIE_STORE.put(keyForUuid(uuid), JSON.stringify(record));
  } catch {
    return textResponse("Internal Serverless Error", 500);
  }
  return jsonResponse({ action: "done" });
}

async function handleGet(uuid: string, env: WorkerEnv): Promise<Response> {
  if (!configuredUuid(env) || !isAuthorizedUuid(uuid, env)) {
    return textResponse("Not Found", 404);
  }

  let value: string | null;
  try {
    value = await env.COOKIE_STORE.get(keyForUuid(uuid), "text");
  } catch {
    return textResponse("Internal Serverless Error", 500);
  }
  if (value === null) return textResponse("Not Found", 404);

  try {
    const record = JSON.parse(value) as Partial<StoredRecord>;
    if (typeof record.encrypted !== "string" || !record.encrypted) {
      return textResponse("Internal Serverless Error", 500);
    }
    return jsonResponse({
      encrypted: record.encrypted,
      crypto_type:
        typeof record.crypto_type === "string" ? record.crypto_type : "legacy",
    });
  } catch {
    return textResponse("Internal Serverless Error", 500);
  }
}

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const apiRoot = normalizeApiRoot(env.API_ROOT);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders() });

    if (request.method === "GET" && url.pathname === apiPath(apiRoot, "/health")) {
      return jsonResponse({ status: "OK", storage: "cloudflare-kv" });
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
