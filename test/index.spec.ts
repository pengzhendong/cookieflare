import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { type WorkerEnv } from "../src/index";

class MemoryKV {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function makeEnv(updateToken?: string, apiRoot = ""): WorkerEnv {
  return {
    API_ROOT: apiRoot,
    COOKIE_STORE: new MemoryKV() as unknown as KVNamespace,
    COOKIECLOUD_UUID: "test-cookiecloud-uuid",
    COOKIECLOUD_UPDATE_TOKEN: updateToken,
  };
}

function invoke(request: Request, env: WorkerEnv): Promise<Response> {
  type Fetch = NonNullable<typeof worker.fetch>;
  type FetchRequest = Parameters<Fetch>[0];
  type FetchEnv = Parameters<Fetch>[1];
  return Promise.resolve(
    worker.fetch!(
      request as unknown as FetchRequest,
      env as unknown as FetchEnv,
      {} as ExecutionContext,
    ),
  );
}

async function compressedJson(body: object): Promise<ArrayBuffer> {
  const source = new Blob([JSON.stringify(body)]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).arrayBuffer();
}

describe("CookieCloud Worker", () => {
  it("returns a health response and CORS headers", async () => {
    const response = await invoke(
      new Request("https://example.test/health"),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "OK",
      storage: "cloudflare-kv",
    });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts the gzip JSON payload sent by CookieCloud", async () => {
    const env = makeEnv();
    const encrypted = "opaque-cookiecloud-ciphertext";
    const body = await compressedJson({
      uuid: "test-cookiecloud-uuid",
      encrypted,
      crypto_type: "aes-128-cbc-fixed",
    });

    const update = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: {
          "Content-Encoding": "gzip",
          "Content-Type": "application/json",
        },
        body,
      }),
      env,
    );

    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ action: "done" });

    const download = await invoke(
      new Request("https://example.test/get/test-cookiecloud-uuid"),
      env,
    );
    expect(download.status).toBe(200);
    expect(await download.json()).toEqual({
      encrypted,
      crypto_type: "aes-128-cbc-fixed",
    });
  });

  it("accepts form uploads and supports POST downloads", async () => {
    const env = makeEnv();
    const update = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          uuid: "test-cookiecloud-uuid",
          encrypted: "form-encrypted-value",
        }),
      }),
      env,
    );

    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ action: "done" });

    const download = await invoke(
      new Request("https://example.test/get/test-cookiecloud-uuid", {
        method: "POST",
        body: "ignored-password-body",
      }),
      env,
    );
    expect(download.status).toBe(200);
    expect(await download.json()).toEqual({
      encrypted: "form-encrypted-value",
      crypto_type: "legacy",
    });
  });

  it("supports an API root prefix", async () => {
    const response = await invoke(
      new Request("https://example.test/sync/health"),
      makeEnv(undefined, "sync"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "OK",
      storage: "cloudflare-kv",
    });
  });

  it("rejects unknown UUIDs and protects updates with the optional token", async () => {
    const env = makeEnv("upload-token");
    const missingToken = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "test-cookiecloud-uuid",
          encrypted: "should-not-be-stored",
        }),
      }),
      env,
    );
    expect(missingToken.status).toBe(404);

    const wrongUuid = await invoke(
      new Request("https://example.test/get/not-the-configured-uuid"),
      env,
    );
    expect(wrongUuid.status).toBe(404);

    const authorized = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer upload-token",
        },
        body: JSON.stringify({
          uuid: "test-cookiecloud-uuid",
          encrypted: "stored-after-token-check",
        }),
      }),
      env,
    );
    expect(authorized.status).toBe(200);

    const headerAuthorized = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CookieCloud-Token": "upload-token",
        },
        body: JSON.stringify({
          uuid: "test-cookiecloud-uuid",
          encrypted: "stored-after-header-check",
        }),
      }),
      env,
    );
    expect(headerAuthorized.status).toBe(200);
  });

  it("rejects unsupported and malformed encodings", async () => {
    const unsupported = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: {
          "Content-Encoding": "br",
          "Content-Type": "application/json",
        },
        body: "compressed-body",
      }),
      makeEnv(),
    );
    expect(unsupported.status).toBe(415);

    const malformed = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: {
          "Content-Encoding": "gzip",
          "Content-Type": "application/json",
        },
        body: "not-gzip",
      }),
      makeEnv(),
    );
    expect(malformed.status).toBe(400);
  });

  it("returns a server error when the UUID secret is missing", async () => {
    const env = makeEnv();
    env.COOKIECLOUD_UUID = undefined;
    const response = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "test-cookiecloud-uuid",
          encrypted: "payload",
        }),
      }),
      env,
    );

    expect(response.status).toBe(500);
  });

  it("supports preflight without touching KV", async () => {
    const response = await invoke(
      new Request("https://example.test/update", { method: "OPTIONS" }),
      makeEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("protects the read-only admin page with Cloudflare Access", async () => {
    const env = makeEnv();
    const teamDomain = "https://cookieflare-access.example.test";
    const audience = "cookieflare-admin-audience";
    env.ADMIN_ACCESS_TEAM_DOMAIN = teamDomain;
    env.ADMIN_ACCESS_AUD = audience;

    const unauthorized = await invoke(
      new Request("https://example.test/admin"),
      env,
    );
    expect(unauthorized.status).toBe(401);

    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key";
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url === `${teamDomain}/cdn-cgi/access/certs`) {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      },
    );

    try {
      const token = await new SignJWT({ email: "admin@example.test" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
        .setIssuer(teamDomain)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      const update = await invoke(
        new Request("https://example.test/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uuid: "test-cookiecloud-uuid",
            encrypted: "admin-visible-metadata-only",
            crypto_type: "aes-128-cbc-fixed",
          }),
        }),
        env,
      );
      expect(update.status).toBe(200);

      const page = await invoke(
        new Request("https://example.test/admin", {
          headers: { "Cf-Access-Jwt-Assertion": token },
        }),
        env,
      );
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(await page.text()).toContain("Private operations dashboard");

      const status = await invoke(
        new Request("https://example.test/admin/status", {
          headers: { "Cf-Access-Jwt-Assertion": token },
        }),
        env,
      );
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        status: "ok",
        storage: "cloudflare-kv",
        authenticated_as: "admin@example.test",
        payload: {
          present: true,
          bytes: new TextEncoder().encode("admin-visible-metadata-only").byteLength,
          crypto_type: "aes-128-cbc-fixed",
        },
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
