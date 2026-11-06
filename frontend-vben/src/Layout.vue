<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BasicLayout, UserDropdown } from '@vben/layouts';
import { usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { App } from 'ant-design-vue';
import { api, base, isRequestCancelled, path, scope } from '@cookieflare/api';
import { pages } from './navigation';
const route = useRoute(), router = useRouter();
const { isMobile } = usePreferences();
const user = useUserStore();
const { message } = App.useApp();
useAccessStore().setAccessMenus(pages.slice(0, 4).map(page => ({ path: page.path, name: page.title, icon: page.icon })));
async function signOut() {
  try { await api(path('/auth/logout'), { method: 'POST' }); scope.reset('signed-out'); }
  catch (error) { if (!isRequestCancelled(error)) message.error(error instanceof Error ? error.message : '退出失败'); }
}
const menus = [{ text: '当前账户', handler: () => router.push('/account') }];
watch(() => route.fullPath, async () => {
  document.title = `${String(route.meta.title || '管理界面')} · Cookieflare · Vben`;
  if (isMobile.value) document.querySelector<HTMLElement>('[data-layout-region="sidebar-mask"]')?.click();
  await nextTick(); document.querySelector('[data-layout-region="scroll"]')?.scrollTo({ top: 0 });
}, { immediate: true, flush: 'post' });
</script>
<template><BasicLayout :avatar="`${base}/admin-assets/favicon.svg`" :text="user.userInfo?.username || ''" @logout="signOut">
  <template #header-right-1><AButton size="small" :href="`${base}/admin#${route.path}`" class="mx-2">切换 Nuxt UI</AButton></template>
  <template #user-dropdown><UserDropdown :avatar="`${base}/admin-assets/favicon.svg`" :text="user.userInfo?.username || ''" description="Cookieflare 管理员" :menus="menus" @logout="signOut" /></template>
</BasicLayout></template>
