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
}

function makeEnv(updateToken?: string): WorkerEnv {
  return {
    API_ROOT: "",
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
          "X-CookieCloud-Token": "upload-token",
        },
        body: JSON.stringify({
          uuid: "test-cookiecloud-uuid",
          encrypted: "stored-after-token-check",
        }),
      }),
      env,
    );
    expect(authorized.status).toBe(200);
  });

  it("supports preflight without touching KV", async () => {
    const response = await invoke(
      new Request("https://example.test/update", { method: "OPTIONS" }),
      makeEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
