import { createApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';
import type { OpenAPIV3_1 as O } from 'openapi-types';
import { referenceThemeCss } from './theme';
const lifetime = new AbortController();
window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
const root = document.querySelector<HTMLElement>('#root')!;
const base = document.body.dataset.apiRoot || '';
const params = new URLSearchParams(location.search);
const referenceFetch: typeof fetch = async (input, init) => {
  const request = new Request(typeof input === 'string' ? new URL(input, location.origin) : input, init);
  if (new URL(request.url).origin !== location.origin) throw new Error('只允许请求当前应用');
  const response = await fetch(request, { credentials: request.headers.has('Authorization') ? 'omit' : 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([lifetime.signal, request.signal]) });
  if (response.status === 401 && !request.headers.has('Authorization')) parent.postMessage({ type: 'workerkit:api-session-expired' }, location.origin);
  return response;
};
async function mount() {
  root.textContent = '正在加载接口文档…';
  try {
    const response = await referenceFetch(`${base}/admin/api/openapi.json`);
    if (!response.ok) throw new Error(`文档读取失败（${response.status}）`);
    const spec = await response.json() as O.Document;
    const operation = params.get('operation');
    if (operation) {
      const paths: Record<string, unknown> = {};
      for (const [path, item] of Object.entries(spec.paths || {})) {
        const selected: Record<string, unknown> = {};
        for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']) {
          const value = (item as Record<string, unknown> | undefined)?.[method] as O.OperationObject | undefined;
          if (value?.operationId === operation) { selected[method] = value; spec.info.title = value.summary || spec.info.title; }
        }
        if (Object.keys(selected).length) paths[path] = { ...(item?.parameters ? { parameters: item.parameters } : {}), ...selected };
      }
      spec.paths = paths as O.PathsObject;
      const usedTags = new Set(Object.values(paths).flatMap(item => Object.values(item as Record<string, O.OperationObject>).flatMap(value => value.tags || [])));
      spec.tags = spec.tags?.filter(tag => usedTags.has(tag.name));
    }
    spec.servers = [{ url: location.origin }]; root.textContent = '';
    const instance = createApiReference(root, { content: spec, theme: 'default', layout: 'classic', showSidebar: false, defaultOpenAllTags: true, defaultOpenFirstTag: true, forceDarkModeState: params.get('theme') === 'dark' ? 'dark' : 'light', hideDarkModeToggle: true, withDefaultFonts: false, persistAuth: false, telemetry: false, proxyUrl: '', agent: { disabled: true }, hideClientButton: true, showDeveloperTools: 'never', customCss: referenceThemeCss + '.selected-client-action,.generate-sdk-button{display:none!important}', customFetch: referenceFetch, localization: { locale: 'zh-CN' } });
    window.addEventListener('pagehide', () => instance.destroy(), { once: true });
  } catch (error) {
    if (lifetime.signal.aborted) return;
    root.textContent = error instanceof Error ? error.message : '文档加载失败';
    const retry = document.createElement('button'); retry.textContent = '重试'; retry.addEventListener('click', () => void mount()); root.append(document.createElement('br'), retry);
  }
}
void mount();
