import { describe, expect, it } from 'vitest';
import worker, { type WorkerEnv } from '../src/index';
const origin = 'https://cookies.test';
function fixture(root = '') {
  const values = new Map<string, string>();
  const store = { get: async (key: string, type?: string) => { const value = values.get(key) ?? null; return type === 'json' && value ? JSON.parse(value) : value; }, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); }, list: async ({ prefix = '', limit = 1000, cursor = '0' }: any) => { const keys = [...values.keys()].filter((key) => key.startsWith(prefix)).sort(), offset = Number(cursor); return { keys: keys.slice(offset, offset + limit).map((name) => ({ name })), list_complete: offset + limit >= keys.length, cursor: String(offset + limit) }; } } as unknown as KVNamespace;
  const env: WorkerEnv = { COOKIE_STORE: store, API_ROOT: root, ADMIN_PASSWORD: 'existing-admin-password', ADMIN_LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const fetch = (path: string, init?: RequestInit) => Promise.resolve(worker.fetch!(new Request(origin + root + path, init) as unknown as Parameters<NonNullable<typeof worker.fetch>>[0], env, {} as ExecutionContext));
  return { env, values, fetch };
}
async function login(fetch: ReturnType<typeof fixture>['fetch'], username = 'admin') { const response = await fetch('/admin/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'existing-admin-password' }) }); expect(response.status).toBe(200); return response.headers.get('set-cookie')!.split(';')[0]!; }
describe('Cookieflare management API', () => {
  it('protects every management read and deletion, and never treats an upload token as an admin session', async () => {
    const { fetch, env } = fixture(); env.COOKIECLOUD_UPDATE_TOKEN = 'upload-only';
    for (const path of ['/datasets', '/configuration', '/runtime', '/runtime/metrics', '/openapi.json']) expect((await fetch('/admin/api' + path, { headers: { Authorization: 'Bearer upload-only' } })).status).toBe(401);
    expect((await fetch('/admin/api/datasets/sample', { method: 'DELETE', headers: { Origin: origin }, body: '{}' })).status).toBe(401);
  });
  it('checks origin, throttles login and refuses oversized credentials before parsing', async () => {
    const { fetch, env } = fixture();
    expect((await fetch('/admin/api/auth/login', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await fetch('/admin/api/auth/login', { method: 'POST', headers: { Origin: origin }, body: 'x'.repeat(5000) })).status).toBe(400);
    env.ADMIN_LOGIN_RATE_LIMITER = { limit: async () => ({ success: false }) };
    const response = await fetch('/admin/api/auth/login', { method: 'POST', headers: { Origin: origin }, body: '{}' }); expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('60');
  });
  it('lists only bounded metadata pages, excluding ciphertext, upload secrets and admin session keys', async () => {
    const { fetch, values, env } = fixture(); env.COOKIECLOUD_UPDATE_TOKEN = 'never-return-this-secret';
    for (let i = 0; i < 12; i++) values.set(`cookiecloud:v1:dataset-${i}`, JSON.stringify({ encrypted: 'never-return-this-ciphertext', crypto_type: 'aes-256-cbc', updated_at: '2026-10-25T00:00:00Z' }));
    const cookie = await login(fetch); const response = await fetch('/admin/api/datasets', { headers: { cookie } });
    const text = await response.text(), data = JSON.parse(text); expect(data.items).toHaveLength(10); expect(data.cursor).toBeTruthy();
    expect(text).not.toContain('never-return-this-ciphertext'); expect(text).not.toContain('workerkit:admin');
    const page2 = await fetch('/admin/api/datasets?cursor=' + data.cursor, { headers: { cookie } }); expect((await page2.json() as any).items).toHaveLength(2);
    const config = await (await fetch('/admin/api/configuration', { headers: { cookie } })).text(); expect(config).toContain('uploadTokenConfigured'); expect(config).not.toContain('never-return-this-secret');
  });
  it('requires both a valid session and exact deletion confirmation, leaving unrelated keys intact', async () => {
    const { fetch, values } = fixture(); values.set('cookiecloud:v1:sample', JSON.stringify({ encrypted: 'cipher', crypto_type: 'legacy' })); values.set('unrelated:key', 'keep');
    const cookie = await login(fetch);
    expect((await fetch('/admin/api/datasets/sample', { method: 'DELETE', headers: { cookie, Origin: 'https://evil.test' }, body: JSON.stringify({ confirmUuid: 'sample' }) })).status).toBe(403);
    expect((await fetch('/admin/api/datasets/sample', { method: 'DELETE', headers: { cookie, Origin: origin }, body: '{}' })).status).toBe(400); expect(values.has('cookiecloud:v1:sample')).toBe(true);
    expect((await fetch('/admin/api/datasets/sample', { method: 'DELETE', headers: { cookie, Origin: origin }, body: JSON.stringify({ confirmUuid: 'sample' }) })).status).toBe(200); expect(values.has('cookiecloud:v1:sample')).toBe(false); expect(values.get('unrelated:key')).toBe('keep');
  });
  it('revokes copied cookies on logout and supports an API_ROOT prefix', async () => {
    const { fetch } = fixture('/sync'); const cookie = await login(fetch);
    expect((await fetch('/admin/api/auth/session', { headers: { cookie } })).status).toBe(200);
    const page = await fetch('/admin'); expect(await page.text()).toContain('/sync/admin-assets/console.js');
    await fetch('/admin/api/auth/logout', { method: 'POST', headers: { cookie, Origin: origin } });
    expect((await fetch('/admin/api/auth/session', { headers: { cookie } })).status).toBe(401);
  });
  it('serves a session-protected, prefixed OpenAPI catalog with real schemas and no Token management routes', async () => {
    const { fetch, env } = fixture('/sync');
    env.COOKIECLOUD_UPDATE_TOKEN = 'do-not-leak-upload-secret';
    const cookie = await login(fetch);
    const response = await fetch('/admin/api/openapi.json', { headers: { cookie } });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const raw = await response.text(), spec = JSON.parse(raw);
    expect(raw).not.toContain(env.COOKIECLOUD_UPDATE_TOKEN);
    expect(spec.openapi).toBe('3.1.0');
    const operations = Object.entries(spec.paths).flatMap(([path, value]) => Object.keys(value as object).map((method) => `${method.toUpperCase()} ${path}`));
    expect(operations).toHaveLength(15);
    expect(operations).toContain('GET /sync/get/{uuid}'); expect(operations).toContain('POST /sync/get/{uuid}');
    expect(operations.some((operation) => /api-keys|tokens/.test(operation))).toBe(false);
    const upload = spec.paths['/sync/update'].post;
    expect(upload.security).toEqual([{ uploadHeader: [] }, { uploadBearer: [] }]);
    expect(upload.requestBody.content['application/json'].schema.required).toEqual(['uuid', 'encrypted']);
    expect(spec.paths['/sync/admin/status'].get.security).toEqual([{ basicAdmin: [] }]);
    expect(spec.paths['/sync/admin/api/datasets'].get.security).toEqual([{ adminSession: [] }]);
    expect(spec.paths['/sync/admin/api/datasets/{uuid}'].delete.requestBody.content['application/json'].schema.required).toEqual(['confirmUuid']);
    const health = await (await fetch('/health')).json();
    expect(Object.keys(health as object).sort()).toEqual(spec.paths['/sync/health'].get.responses[200].content['application/json'].schema.required.sort());
    delete env.COOKIECLOUD_UPDATE_TOKEN;
    const publicUploadSpec = await (await fetch('/admin/api/openapi.json', { headers: { cookie } })).json() as any;
    expect(publicUploadSpec.paths['/sync/update'].post.security).toEqual([]);
  });
  it('isolates Scalar assets from the console and allows embedding only from the same origin', async () => {
    const { fetch } = fixture('/sync');
    const page = await fetch('/admin'), reference = await fetch('/admin/reference');
    expect(page.headers.get('content-security-policy')).toContain("frame-src 'self'");
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(reference.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(reference.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    const shell = await reference.text(); expect(shell).toContain('/sync/admin-assets/reference.js'); expect(shell).toContain('data-api-root="/sync"');
    expect(shell).not.toContain('console.js');
  });

  it('uses the configured username for both session and legacy Basic authentication, invalidating prior identities', async () => {
    const { fetch, env } = fixture();
    const oldCookie = await login(fetch);
    env.ADMIN_USERNAME = 'operator-test';
    expect((await fetch('/admin/api/auth/session', { headers: { cookie: oldCookie } })).status).toBe(401);
    const oldLogin = await fetch('/admin/api/auth/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ username: 'admin', password: 'existing-admin-password' }) });
    expect(oldLogin.status).toBe(401);
    const cookie = await login(fetch, 'operator-test');
    expect(await (await fetch('/admin/api/auth/session', { headers: { cookie } })).json()).toEqual({ username: 'operator-test' });
    const basic = (user: string) => ({ Authorization: `Basic ${btoa(`${user}:existing-admin-password`)}` });
    expect((await fetch('/admin/status', { headers: basic('admin') })).status).toBe(401);
    const legacy = await fetch('/admin/status', { headers: basic('operator-test') });
    expect(legacy.status).toBe(200); expect((await legacy.json() as any).authenticated_as).toBe('operator-test');
    env.ADMIN_PASSWORD = 'rotated-test-password';
    expect((await fetch('/admin/api/auth/session', { headers: { cookie } })).status).toBe(401);
  });

});
