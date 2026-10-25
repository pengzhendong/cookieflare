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
async function login(fetch: ReturnType<typeof fixture>['fetch']) { const response = await fetch('/admin/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'existing-admin-password' }) }); expect(response.status).toBe(200); return response.headers.get('set-cookie')!.split(';')[0]!; }
describe('Cookieflare management API', () => {
  it('protects every management read and deletion, and never treats an upload token as an admin session', async () => {
    const { fetch, env } = fixture(); env.COOKIECLOUD_UPDATE_TOKEN = 'upload-only';
    for (const path of ['/datasets', '/configuration', '/runtime', '/runtime/metrics']) expect((await fetch('/admin/api' + path, { headers: { Authorization: 'Bearer upload-only' } })).status).toBe(401);
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
});
