import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, expect, request } from '@playwright/test';

// This check creates opaque synthetic snapshots and deletes them. Never target production.
const origin = new URL(process.env.CONSOLE_URL || 'http://127.0.0.1:8798');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Console checks only run against loopback');
const consolePath = '/admin';
const prefix = origin.pathname.replace(/\/$/, '');
const url = path => `${origin.origin}${prefix}${path}`;
const fixtures = Array.from({ length: 12 }, (_, index) => `preview-${randomUUID()}-${index}`);
const marker = Buffer.from('Synthetic opaque preview fixture; contains no cookies.').toString('base64');
const headers = { Origin: origin.origin };
const guest = await request.newContext();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const errors = [], foreignRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', req => { if (new URL(req.url()).origin !== origin.origin) foreignRequests.push(req.url()); });
const api = context.request;
const out = `test-results/console${prefix ? '-prefix' : ''}`;
await mkdir(out, { recursive: true });
async function navigate(label) {
  await page.getByRole('link', { name: label, exact: true }).click();
}
const sidebar = page.locator('.ant-pro-sider');
async function expectPageTitle(title) {
  const options = { name: title, exact: true };
  await expect(page.getByRole('heading', options)).toBeVisible();
  await expect(page.getByRole('heading', options)).toHaveCSS('font-size', '14px');
  await expect(page.getByRole('heading', options)).toHaveCount(1);
  await expect(page).toHaveTitle(`${title} · Cookieflare`);
}
const uploaded = [];
try {
  await expect.poll(async () => { try { return (await guest.get(url('/health'))).status(); } catch { return 0; } }, { timeout: 15000, message: 'Local preview must be ready' }).toBe(200);
  assert.equal((await guest.get(url('/admin/api/datasets'))).status(), 401);
  assert.equal((await guest.post(url('/admin/api/auth/login'), { data: { username: 'admin', password: 'password' } })).status(), 403);
  assert.equal((await guest.post(url('/admin/api/auth/login'), { headers, data: { username: 'admin', password: 'wrong-preview-password' } })).status(), 401);
  for (const uuid of fixtures) {
    const response = await guest.post(url('/update'), { data: { uuid, encrypted: marker, crypto_type: 'preview-opaque' } });
    assert.equal(response.status(), 200, 'Synthetic upload must use local public protocol');
    uploaded.push(uuid);
  }
  await page.goto(url(consolePath));
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', `${prefix}/admin-assets/cookieflare-icon.svg`);
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expectPageTitle('数据集');
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开侧栏', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '收起侧栏', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Cloudflare KV', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
  const list = await (await api.get(url('/admin/api/datasets'))).json();
  assert.equal(list.items.length, 10); assert.ok(list.cursor); assert.equal(JSON.stringify(list).includes(marker), false);
  const first = list.items.find(item => fixtures.includes(item.uuid))?.uuid;
  assert.ok(first, 'This check needs its own synthetic dataset on the first page; use an isolated local preview');
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText('第 2 页', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  assert.equal((await api.delete(url(`/admin/api/datasets/${first}`), { headers, data: { confirmUuid: 'wrong' } })).status(), 400);
  assert.equal((await api.delete(url(`/admin/api/datasets/${first}`), { data: { confirmUuid: first } })).status(), 403);
  await page.getByRole('button', { name: `删除 ${first}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /取\s*消/, exact: true }).click();
  assert.equal((await guest.get(url(`/get/${first}`))).status(), 200);
  await page.getByRole('button', { name: `删除 ${first}`, exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: first, exact: true })).toHaveCount(0);
  assert.equal((await guest.get(url(`/get/${first}`))).status(), 404);

  // A server failure offers retry, without expiring the logged-in identity.
  await page.route('**/admin/api/datasets', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '预览检查：临时读取失败', code: 'preview_failure' } }) }), { times: 1 });
  await page.getByRole('button', { name: /刷新列表/ }).click();
  await expect(page.getByText('预览检查：临时读取失败', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /重\s*试/, exact: true }).click();
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
  await page.screenshot({ animations: 'disabled', path: `${out}/datasets-desktop.png` });

  await navigate('运行状态');
  await expectPageTitle('运行状态');
  await expect(page.getByText('可连接', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '平台资源指标', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 400 });
  const before = await sidebar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await page.evaluate(() => window.scrollY > 0), 'Page content should scroll');
  assert.equal(Math.round((await sidebar.boundingBox()).y), Math.round(before.y), 'Sidebar must remain fixed');
  await navigate('服务配置');
  await expectPageTitle('服务配置');
  await expect(page.getByText('Cloudflare KV', { exact: true }).last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '账户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: /API 中心/ }).click();
  await expectPageTitle('API 中心');
  await page.getByRole('textbox', { name: '搜索接口', exact: true }).fill('服务存活检查');
  await expect(page.getByText('共 1 个接口', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看 服务存活检查', exact: true }).click();
  const reference = page.frameLocator('iframe[title="交互式 API 文档"]');
  await expect(reference.getByText('服务存活检查', { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await reference.getByRole('button', { name: /GET .*health 服务存活检查/ }).click();
  await reference.getByRole('button', { name: /^测试请求/ }).click();
  const [result] = await Promise.all([
    page.waitForResponse(response => response.url() === url('/health') && response.request().method() === 'GET'),
    reference.getByRole('button', { name: /向 .*health 发送 get 请求/ }).click(),
  ]);
  assert.equal(result.status(), 200); assert.equal((await result.json()).status, 'OK');
  await reference.getByRole('button', { name: '关闭客户端', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: `${out}/api-desktop.png` });
  assert.equal(new URL(page.url()).hash, '#/api', 'Scalar navigation must not replace the application hash');

  await page.getByRole('button', { name: '账户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: /当前账户/ }).click();
  await expectPageTitle('当前账户');
  await page.goto(url(consolePath + '#/missing-page'));
  await expectPageTitle('页面不存在');

  // Wait for the native responsive layout before operating its mobile drawer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url(consolePath + '#/datasets'));
  await expectPageTitle('数据集');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page-wide horizontal overflow');
  await page.screenshot({ animations: 'disabled', path: `${out}/datasets-mobile.png` });
  const toggle = page.getByRole('banner').getByRole('img', { name: 'menu', exact: true });
  await toggle.click();
  await navigate('服务配置');
  await expectPageTitle('服务配置');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await toggle.click();
  await page.getByRole('button', { name: '深色模式', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cookieflare.theme') === 'dark')).toBe(true);
  await page.screenshot({ animations: 'disabled', path: `${out}/configuration-mobile-dark.png` });

  await page.goto(url('/admin/vben#/datasets'));
  await expect(page).toHaveURL(url('/admin#/datasets'));
  await expectPageTitle('数据集');
  await expect(page.getByRole('button', { name: '登录', exact: true })).toHaveCount(0);
  await page.goto(url(consolePath + '#/configuration'));
  await expectPageTitle('服务配置');

  // A revoked server session must remove private content immediately on the next read.
  assert.equal((await api.post(url('/admin/api/auth/logout'), { headers })).status(), 200);
  await page.getByRole('button', { name: /刷新配置/ }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  assert.equal((await api.get(url('/admin/api/configuration'))).status(), 401);
  assert.deepEqual(errors, [], 'No browser exceptions'); assert.deepEqual(foreignRequests, [], 'No external scripts, fonts, telemetry or API calls');
  console.log('PASS: protocol, auth, pagination, confirmed deletion, retry, runtime, scroll, API docs, mobile drawer, theme, session revocation');
} finally {
  // Clean only successfully uploaded UUIDs, even if a browser assertion failed.
  try {
    if (uploaded.length) {
      if ((await api.get(url('/admin/api/auth/session'))).status() === 401) {
        let login = await api.post(url('/admin/api/auth/login'), { headers, data: { username: 'admin', password: 'password' } });
        if (login.status() === 429) {
          // Honor the real login limiter's retry window before cleaning up.
          const seconds = Number(login.headers()['retry-after']);
          assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 60);
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          login = await api.post(url('/admin/api/auth/login'), { headers, data: { username: 'admin', password: 'password' } });
        }
        assert.equal(login.status(), 200);
      }
      for (const uuid of uploaded) assert.equal((await api.delete(url(`/admin/api/datasets/${uuid}`), { headers, data: { confirmUuid: uuid } })).status(), 200, 'Synthetic fixture cleanup must succeed');
    }
  } finally { await browser.close(); await guest.dispose(); }
}
