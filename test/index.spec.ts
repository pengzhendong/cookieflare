import { describe, expect, it } from "vitest";

import worker, { type WorkerEnv } from "../src/index";

class MemoryKV {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async list(options: { prefix?: string } = {}): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor: string;
  }> {
    const prefix = options.prefix ?? "";
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    };
  }
}

function makeEnv(updateToken?: string, apiRoot = ""): WorkerEnv {
  return {
    API_ROOT: apiRoot,
    COOKIE_STORE: new MemoryKV() as unknown as KVNamespace,
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

    const otherUpdate = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "another-client-uuid",
          encrypted: "another-client-payload",
        }),
      }),
      env,
    );
    expect(otherUpdate.status).toBe(200);

    const otherDownload = await invoke(
      new Request("https://example.test/get/another-client-uuid"),
      env,
    );
    expect(otherDownload.status).toBe(200);
    expect(await otherDownload.json()).toEqual({
      encrypted: "another-client-payload",
      crypto_type: "legacy",
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

  it("protects updates with the optional token", async () => {
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
      new Request("https://example.test/get/not-yet-uploaded-uuid"),
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

  it("rate limits uploads by UUID when the binding is configured", async () => {
    const env = makeEnv();
    const keys: string[] = [];
    let allowed = true;
    env.RATE_LIMITER = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: allowed };
      },
    };

    const first = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "rate-limited-uuid",
          encrypted: "first-payload",
        }),
      }),
      env,
    );
    expect(first.status).toBe(200);
    expect(keys).toEqual(["update:rate-limited-uuid"]);

    allowed = false;
    const second = await invoke(
      new Request("https://example.test/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "rate-limited-uuid",
          encrypted: "second-payload",
        }),
      }),
      env,
    );
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");

    const download = await invoke(
      new Request("https://example.test/get/rate-limited-uuid"),
      env,
    );
    expect(await download.json()).toMatchObject({ encrypted: "first-payload" });
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

  it("supports preflight without touching KV", async () => {
    const response = await invoke(
      new Request("https://example.test/update", { method: "OPTIONS" }),
      makeEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("fails closed when the admin password is missing", async () => {
    const response = await invoke(
      new Request("https://example.test/admin"),
      makeEnv(),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("not configured");
  });

  it("protects the read-only admin page with Basic Auth", async () => {
    const env = makeEnv();
    env.ADMIN_PASSWORD = "correct-admin-password";

    const unauthorized = await invoke(
      new Request("https://example.test/admin"),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Basic");

    const wrongPassword = await invoke(
      new Request("https://example.test/admin", {
        headers: {
          Authorization: `Basic ${Buffer.from("admin:wrong-password", "utf8").toString("base64")}`,
        },
      }),
      env,
    );
    expect(wrongPassword.status).toBe(401);

    const authHeader = `Basic ${Buffer.from("admin:correct-admin-password", "utf8").toString("base64")}`;
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
        headers: { Authorization: authHeader },
      }),
      env,
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(await page.text()).toContain("Private operations dashboard");

    const status = await invoke(
      new Request("https://example.test/admin/status", {
        headers: { Authorization: authHeader },
      }),
      env,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: "ok",
      storage: "cloudflare-kv",
      api_mode: "multi-user",
      authenticated_as: "admin",
      stored_uuids: {
        count: 1,
        list_complete: true,
      },
    });
  });
});
