import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import './style.css';

// Keep bookmarks from the previous console (#runtime, #api, ...) working.
if (location.hash && !location.hash.startsWith('#/')) history.replaceState(null, '', '#/' + location.hash.slice(1));
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', redirect: '/datasets' },
  { path: '/datasets', component: () => import('./pages/Datasets.vue'), meta: { title: '数据集' } },
  { path: '/runtime', component: () => import('./pages/Runtime.vue'), meta: { title: '运行状态' } },
  { path: '/configuration', component: () => import('./pages/Configuration.vue'), meta: { title: '服务配置' } },
  { path: '/api', component: () => import('./pages/Api.vue'), meta: { title: 'API 中心' } },
  { path: '/account', component: () => import('./pages/Account.vue'), meta: { title: '当前账户' } },
  { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFound.vue'), meta: { title: '页面不存在' } },
] });
createApp(App).use(router).use(ui).mount('#root');
