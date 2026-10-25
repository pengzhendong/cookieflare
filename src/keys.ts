export const COOKIE_STORE_PREFIX = 'cookiecloud:v1:';
export const keyForUuid = (uuid: string) => `${COOKIE_STORE_PREFIX}${encodeURIComponent(uuid)}`;
export function normalizeUuid(value: string | null): string | null {
  const uuid = value?.trim() ?? '';
  if (!uuid || uuid.length > 128 || /[/\\\u0000-\u001f\u007f]/u.test(uuid) || new TextEncoder().encode(keyForUuid(uuid)).byteLength > 512) return null;
  return uuid;
}
