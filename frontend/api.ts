import { createApiClient, createSessionScope } from '@pengzhendong/worker-kit/client';
import { useApiQuery } from '@pengzhendong/worker-kit/web';
export { ApiClientError, isRequestCancelled } from '@pengzhendong/worker-kit/client';

export const base = document.body.dataset.apiRoot || '';
export const path = (suffix: string) => `${base}/admin/api${suffix}`;
export const scope = createSessionScope();
export const api = createApiClient({ scope });
export const auth = createApiClient();
export type Session = { username: string };
export const useResource = <T,>(suffix: string) => useApiQuery<T>(api, path(suffix));
export const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录';
export const formatBytes = (value: number | null) => value === null ? '—' : value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
