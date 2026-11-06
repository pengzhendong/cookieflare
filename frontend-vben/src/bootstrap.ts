import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { setupI18n } from '@vben/locales';
import { initStores, useAccessStore } from '@vben/stores';
import { addCollection } from '@iconify/vue';
import icons from '@cookieflare/icons';
import '@vben/styles';
import '@vben/styles/antd';
import { Alert, App as AntdApp, Button, Card, Col, Form, Input, Modal, Pagination, Result, Row, Select, Skeleton, Space, Spin, Statistic, Table, Tabs, Tag } from 'ant-design-vue';
import App from './App.vue';
import Layout from './Layout.vue';
import './style.css';

import { pages } from './navigation';
export async function bootstrap() {
  // Bundle the same offline icons used by menus. No Iconify network requests.
  for (const collection of icons) addCollection(collection);
  const router = createRouter({ history: createWebHashHistory(), routes: [
    { path: '/', component: Layout, children: [
      { path: '', redirect: '/datasets' },
      ...pages.map(page => ({ path: page.path, name: page.name, component: page.component, meta: { title: page.title, icon: page.icon, affixTab: page.path === '/datasets', keepAlive: false } })),
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('./pages/NotFound.vue'), meta: { title: '页面不存在' } },
    ] },
  ] });
  const app = createApp(App);
  await setupI18n(app, { defaultLocale: 'zh-CN' });
  await initStores(app, { namespace: 'cookieflare-vben' });
  useAccessStore().setAccessMenus(pages.slice(0, 4).map(page => ({ path: page.path, name: page.title, icon: page.icon })));
  app.use(Alert).use(AntdApp).use(Button).use(Card).use(Col).use(Form).use(Input).use(Modal).use(Pagination).use(Result).use(Row).use(Select).use(Skeleton).use(Space).use(Spin).use(Statistic).use(Table).use(Tabs).use(Tag); app.use(router); app.mount('#root');
}
