import { createKvAdminAuth, inspectRuntime, readCloudflareMetrics } from '@pengzhendong/worker-kit/runtime';
import { COOKIE_STORE_PREFIX, keyForUuid, normalizeUuid } from './keys';
import type { WorkerEnv } from './index';
import { cookieflareOpenApi } from './openapi';

const auth = createKvAdminAuth({ cookieName: 'cookieflare_admin', keyPrefix: 'workerkit:admin:session:', authScope: 'cookieflare:admin-auth', sessionSeconds: 12 * 60 * 60 });
const json = (data: unknown, status = 200, extra?: HeadersInit) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const failure = (status: number, code: string, message: string, extra?: HeadersInit) => json({ error: { code, message } }, status, extra);
const username = 'admin';
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  const reader = request.body.getReader(); let text = '', length = 0; const decoder = new TextDecoder();
  try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 4096) { await reader.cancel(); throw new Error('body_too_large'); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); }
  finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json'); return value as Record<string, unknown>;
}

export function adminConsolePage(root: string, reference = false) {
  const entry = reference ? 'reference' : 'console';
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="${root}/admin-assets/favicon.svg"><link rel="stylesheet" href="${root}/admin-assets/${entry}.css"><title>Cookieflare${reference ? ' API 文档' : ''}</title></head><body data-api-root="${root.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}"><div id="root"></div><script type="module" src="${root}/admin-assets/${entry}.js"></script></body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${reference ? "'self'" : "'none'"}`, 'X-Frame-Options': reference ? 'SAMEORIGIN' : 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  } });
}

/** Admin APIs are deliberately separate from the CookieCloud wire protocol and upload token. */
export async function adminApi(request: Request, env: WorkerEnv, root: string): Promise<Response | undefined> {
  const url = new URL(request.url), prefix = `${root}/admin/api`, path = url.pathname.slice(prefix.length);
  if (!url.pathname.startsWith(`${prefix}/`)) return;
  if (!env.ADMIN_PASSWORD) return failure(503, 'auth_unconfigured', '管理员认证未配置');
  if (!['GET', 'HEAD'].includes(request.method) && !auth.isSameOrigin(request)) return failure(403, 'invalid_origin', '请求来源无效');
  try {
    if (path === '/auth/login' && request.method === 'POST') {
      if (!env.ADMIN_LOGIN_RATE_LIMITER) return failure(503, 'auth_unconfigured', '登录限流未配置');
      if (!(await env.ADMIN_LOGIN_RATE_LIMITER.limit({ key: `login:${request.headers.get('CF-Connecting-IP') ?? 'local'}` })).success) return failure(429, 'login_limited', '登录尝试过于频繁', { 'Retry-After': '60' });
      const data = await body(request);
      if (typeof data.username !== 'string' || typeof data.password !== 'string' || !await auth.verifyCredentials(data.username, data.password, username, env.ADMIN_PASSWORD)) return failure(401, 'invalid_credentials', '用户名或密码错误');
      return json({ username }, 200, { 'Set-Cookie': await auth.createSession(env.COOKIE_STORE, username, env.ADMIN_PASSWORD, request) });
    }
    if (path === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': await auth.deleteSession(request, env.COOKIE_STORE) });
    if (!await auth.isAuthenticated(request, env.COOKIE_STORE, username, env.ADMIN_PASSWORD)) return failure(401, 'unauthorized', '请先登录');
    if (path === '/auth/session' && request.method === 'GET') return json({ username });
    if (path === '/openapi.json' && request.method === 'GET') return json(cookieflareOpenApi(root, !!env.COOKIECLOUD_UPDATE_TOKEN?.trim()));
    if (path === '/runtime' && request.method === 'GET') return json(await inspectRuntime({ application: { name: 'Cookieflare', version: '0.1.0' }, environment: ['127.0.0.1', 'localhost'].includes(url.hostname) ? 'local' : 'production', version: env.CF_VERSION_METADATA, checks: [{ name: 'KV', kind: 'kv', description: '加密快照与可注销的后台会话', check: () => env.COOKIE_STORE.get('workerkit:health') }] }));
    if (path === '/runtime/metrics' && request.method === 'GET') return json(await readCloudflareMetrics({}));
    if (path === '/configuration' && request.method === 'GET') return json({ apiRoot: root || '/', storage: 'Cloudflare KV', uploadTokenConfigured: !!env.COOKIECLOUD_UPDATE_TOKEN, uuidRateLimitConfigured: !!env.RATE_LIMITER, ipRateLimitConfigured: !!env.IP_RATE_LIMITER, loginRateLimitConfigured: !!env.ADMIN_LOGIN_RATE_LIMITER, sessionHours: 12, encryption: '客户端加密，服务端不保存解密密码' });
    if (path === '/datasets' && request.method === 'GET') {
      const cursor = url.searchParams.get('cursor') || undefined;
      if (cursor && cursor.length > 2048) return failure(400, 'invalid_cursor', '分页游标无效');
      const page = await env.COOKIE_STORE.list({ prefix: COOKIE_STORE_PREFIX, limit: 10, ...(cursor ? { cursor } : {}) });
      const items = [];
      // Serial reads bound peak memory even for older snapshots near the 8 MB limit.
      for (const key of page.keys) {
        let uuid: string | null; try { uuid = normalizeUuid(decodeURIComponent(key.name.slice(COOKIE_STORE_PREFIX.length))); } catch { continue; }
        if (!uuid || keyForUuid(uuid) !== key.name) continue;
        const raw = await env.COOKIE_STORE.get(key.name, 'text'); if (raw === null) continue;
        let record: any; try { record = JSON.parse(raw); } catch { record = null; }
        const valid = record && typeof record.encrypted === 'string' && typeof record.crypto_type === 'string';
        items.push({ uuid, updatedAt: valid && typeof record.updated_at === 'string' ? record.updated_at : null, encryptedBytes: valid ? new TextEncoder().encode(record.encrypted).byteLength : null, cryptoType: valid ? record.crypto_type : null, status: valid ? 'stored' : 'invalid' });
      }
      return json({ items, cursor: page.list_complete ? null : page.cursor ?? null, complete: page.list_complete });
    }
    if (path.startsWith('/datasets/') && request.method === 'DELETE') {
      let uuid: string | null; try { uuid = normalizeUuid(decodeURIComponent(path.slice('/datasets/'.length))); } catch { uuid = null; }
      if (!uuid) return failure(400, 'invalid_uuid', '数据集标识无效');
      const data = await body(request); if (data.confirmUuid !== uuid) return failure(400, 'confirmation_required', '请确认要删除的数据集');
      await env.COOKIE_STORE.delete(keyForUuid(uuid)); return json({ deleted: true });
    }
    return failure(404, 'not_found', '接口不存在');
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error && ['body_too_large', 'invalid_json'].includes(error.message)) return failure(400, 'invalid_request', '请求数据无效或过大');
    console.error(JSON.stringify({ event: 'admin_operation_failed' }));
    return failure(500, 'internal_error', '管理服务暂时不可用');
  }
}
