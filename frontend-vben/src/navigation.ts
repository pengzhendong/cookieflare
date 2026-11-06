export const pages = [
  { path: '/datasets', name: 'Datasets', title: '数据集', icon: 'lucide:database', component: () => import('./pages/Datasets.vue') },
  { path: '/runtime', name: 'Runtime', title: '运行状态', icon: 'lucide:activity', component: () => import('./pages/Runtime.vue') },
  { path: '/configuration', name: 'Configuration', title: '服务配置', icon: 'lucide:settings-2', component: () => import('./pages/Configuration.vue') },
  { path: '/api', name: 'Api', title: 'API 中心', icon: 'lucide:braces', component: () => import('./pages/Api.vue') },
  { path: '/account', name: 'Account', title: '当前账户', icon: 'lucide:user-round', component: () => import('./pages/Account.vue') },
];
