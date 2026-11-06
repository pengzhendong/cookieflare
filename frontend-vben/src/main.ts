import { initPreferences } from '@vben/preferences';
const root = document.body.dataset.apiRoot || '';
await initPreferences({ namespace: 'cookieflare-vben-v1', overrides: {
  app: { name: 'Cookieflare', defaultHomePath: '/datasets', defaultAvatar: `${root}/admin-assets/favicon.svg`, enableCheckUpdates: false, enableCopyPreferences: false, locale: 'zh-CN', contentPadding: 0 },
  logo: { source: `${root}/admin-assets/favicon.svg` },
  copyright: { enable: false }, theme: { mode: 'light', semiDarkSidebar: false },
  tabbar: { keepAlive: false, persist: false },
  transition: { enable: false },
  widget: { lockScreen: false, languageToggle: false, notification: false, timezone: false, fullscreen: false, refresh: false, logoutButtonPosition: 'user-dropdown' },
} });
const { bootstrap } = await import('./bootstrap');
await bootstrap();
