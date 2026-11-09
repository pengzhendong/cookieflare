<script setup lang="ts">
import { computed, nextTick, onErrorCaptured, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from '@nuxt/ui/composables';
import { zh_cn } from '@nuxt/ui/locale';
import { api, auth, ApiClientError, base, isRequestCancelled, path, scope, type Session } from './api';

const route = useRoute(), toast = useToast();
const pageTitle = computed(() => String(route.meta.title || '管理界面'));
const session = shallowRef<Session | null>(), sessionError = ref(''), loginError = ref('');
const signingIn = ref(false), signingOut = ref(false), open = ref(false), collapsed = ref(false);
const generation = ref(scope.version), failed = ref(false);
const form = reactive({ username: '', password: '' });
let sessionRequest: AbortController | undefined, loginRequest: AbortController | undefined;
const unsubscribe = scope.subscribe(event => {
  generation.value = event.version;
  if (event.reason === 'expired' || event.reason === 'signed-out') { session.value = null; form.password = ''; open.value = false; }
});
const unregister = scope.registerCleanup(() => toast.clear());
onScopeDispose(() => { sessionRequest?.abort(); loginRequest?.abort(); unsubscribe(); unregister(); });
onErrorCaptured(() => { failed.value = true; return false; });

async function inspectSession() {
  sessionRequest?.abort(); sessionRequest = new AbortController(); sessionError.value = '';
  try { session.value = await auth<Session>(path('/auth/session'), { signal: sessionRequest.signal }); }
  catch (error) {
    if (isRequestCancelled(error)) return;
    if (error instanceof ApiClientError && error.status === 401) session.value = null;
    else sessionError.value = error instanceof Error ? error.message : '无法读取会话，请重试';
  }
}
async function signIn() {
  if (signingIn.value) return;
  loginError.value = ''; signingIn.value = true; loginRequest = new AbortController();
  try {
    const value = await auth<Session>(path('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), signal: loginRequest.signal });
    form.password = ''; scope.reset('signed-in'); session.value = value;
  } catch (error) { if (!isRequestCancelled(error)) loginError.value = error instanceof Error ? error.message : '登录失败，请重试'; }
  finally { signingIn.value = false; }
}
async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  try { await api(path('/auth/logout'), { method: 'POST' }); scope.reset('signed-out'); }
  catch (error) { if (!isRequestCancelled(error)) toast.add({ title: '退出失败', description: error instanceof Error ? error.message : '请重试', color: 'error' }); }
  finally { signingOut.value = false; }
}
function retryApplication() { if (failed.value) location.reload(); else void inspectSession(); }
const navigation = [
  { label: '数据集', icon: 'i-lucide-database', to: '/datasets' },
  { label: '服务配置', icon: 'i-lucide-settings-2', to: '/configuration' },
  { label: '运行状态', icon: 'i-lucide-activity', to: '/runtime' },
].map(item => ({ ...item, onSelect: () => { open.value = false; } }));
const accountItems = computed(() => [[
  { label: '当前账户', icon: 'i-lucide-user-round', to: '/account' },
  { label: 'API 中心', icon: 'i-lucide-braces', to: '/api' },
], [{ label: '退出登录', icon: 'i-lucide-log-out', color: 'error' as const, disabled: signingOut.value, onSelect: signOut }]]);
watch(() => route.fullPath, async () => {
  open.value = false; failed.value = false;
  document.title = `${pageTitle.value} · Cookieflare`;
  await nextTick(); document.querySelector('[data-content-scroll]')?.scrollTo({ top: 0 });
}, { immediate: true });
void inspectSession();
</script>

<template>
  <UApp :locale="zh_cn">
    <main v-if="sessionError || failed" class="min-h-dvh grid place-items-center p-6">
      <UCard class="w-full max-w-md"><UAlert color="error" variant="soft" :title="failed ? '页面暂时不可用' : '无法读取会话'" :description="failed ? '请重新加载页面后重试。' : sessionError" />
        <UButton class="mt-5" @click="retryApplication">重试</UButton>
      </UCard>
    </main>
    <div v-else-if="session === undefined" role="status" class="min-h-dvh grid place-items-center text-muted">正在确认登录状态…</div>
    <main v-else-if="!session" class="min-h-dvh grid place-items-center bg-elevated/30 p-5">
      <UCard class="w-full max-w-sm">
        <div class="flex items-center gap-3 mb-6"><img :src="`${base}/admin-assets/cookieflare-icon.svg`" width="38" height="38" alt="" /><div><h1 class="text-xl font-semibold">Cookieflare</h1><p class="text-sm text-muted">登录管理界面</p></div></div>
        <UForm :state="form" class="space-y-5" @submit="signIn">
          <UAlert v-if="loginError" color="error" :description="loginError" role="alert" />
          <UFormField name="username" label="用户名" required><UInput v-model="form.username" name="username" autocomplete="username" required :disabled="signingIn" class="w-full" /></UFormField>
          <UFormField name="password" label="密码" required><UInput v-model="form.password" name="password" type="password" autocomplete="current-password" required :disabled="signingIn" class="w-full" /></UFormField>
          <UButton type="submit" block :loading="signingIn">登录</UButton>
        </UForm>
        <p class="text-xs text-muted mt-5 leading-5">此账户用于管理同步服务，与客户端的 CookieCloud 加密密码分开。</p>
      </UCard>
    </main>
    <UDashboardGroup v-else unit="px" storage="local" storage-key="cookieflare-layout">
      <UDashboardSidebar v-model:open="open" v-model:collapsed="collapsed" collapsible :default-size="232" :min-size="232" :collapsed-size="72" :ui="{ root: 'bg-elevated/40', header: 'h-12 px-5', body: 'px-3', footer: 'border-t border-default p-3' }">
        <template #header="{ collapsed: small }"><RouterLink to="/datasets" class="flex items-center gap-2.5 font-semibold text-lg"><img :src="`${base}/admin-assets/cookieflare-icon.svg`" width="30" height="30" alt="" /><span v-if="!small">Cookieflare</span></RouterLink></template>
        <template #default="{ collapsed: small }"><UNavigationMenu :items="navigation" :collapsed="small" orientation="vertical" tooltip :ui="{ link: 'h-11 px-3 gap-3', linkLeadingIcon: 'size-5' }" /></template>
        <template #footer="{ collapsed: small }"><UDropdownMenu :items="accountItems" :content="{ side: 'top', align: 'start' }" :ui="{ content: 'w-52' }">
          <UButton variant="ghost" color="neutral" class="w-full p-2" :square="small" aria-label="账户菜单" :loading="signingOut"><UAvatar :text="session.username.slice(0, 1).toUpperCase()" size="sm" /><span v-if="!small" class="text-left flex-1 truncate">{{ session.username }}</span><UIcon v-if="!small" name="i-lucide-chevrons-up-down" class="size-4" /></UButton>
        </UDropdownMenu></template>
      </UDashboardSidebar>
      <UDashboardPanel :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0' }">
        <template #header><UDashboardNavbar data-console-navbar :title="pageTitle" :ui="{ root: 'h-12 px-4 lg:px-6', title: 'text-sm font-medium' }">
          <template #leading><UDashboardSidebarCollapse class="hidden lg:flex" /></template>
          <template #right><UColorModeButton aria-label="切换明暗主题" /></template>
        </UDashboardNavbar></template>
        <template #body><div data-content-scroll class="content-scroll"><main class="page-container"><RouterView :key="`${generation}:${route.path}`" /></main></div></template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>
