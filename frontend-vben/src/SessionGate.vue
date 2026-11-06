<script setup lang="ts">
import { onErrorCaptured, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { App } from 'ant-design-vue';
import { useUserStore, useTabbarStore, useAccessStore } from '@vben/stores';
import { auth, ApiClientError, base, isRequestCancelled, path, scope, type Session } from '@cookieflare/api';
const { message, notification } = App.useApp();
const session = shallowRef<Session | null>(), failure = ref(''), loginError = ref(''), failed = ref(false);
const busy = ref(false), generation = ref(scope.version);
const nuxtHref = `${base}/admin${location.hash}`;
const form = reactive({ username: '', password: '' });
let request: AbortController | undefined;
const unregister = scope.registerCleanup(() => { message.destroy(); notification.destroy(); });
const unsubscribe = scope.subscribe(event => {
  generation.value = event.version;
  useTabbarStore().$reset();
  if (event.reason === 'expired' || event.reason === 'signed-out') {
    session.value = null; form.password = ''; useUserStore().$reset(); useAccessStore().$reset();
  }
});
onScopeDispose(() => { request?.abort(); unregister(); unsubscribe(); });
onErrorCaptured(() => { failed.value = true; return false; });
watch(session, value => {
  if (value) useUserStore().setUserInfo({ userId: value.username, username: value.username, realName: value.username, avatar: `${base}/admin-assets/favicon.svg`, roles: [], homePath: '/datasets' });
});
async function inspect() {
  request?.abort(); request = new AbortController(); failure.value = '';
  try { session.value = await auth<Session>(path('/auth/session'), { signal: request.signal }); }
  catch (error) {
    if (isRequestCancelled(error)) return;
    if (error instanceof ApiClientError && error.status === 401) session.value = null;
    else failure.value = error instanceof Error ? error.message : '无法读取会话';
  }
}
async function signIn() {
  if (busy.value) return; busy.value = true; loginError.value = '';
  request?.abort(); request = new AbortController();
  try {
    const value = await auth<Session>(path('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), signal: request.signal });
    form.password = ''; scope.reset('signed-in'); session.value = value;
  } catch (error) { if (!isRequestCancelled(error)) loginError.value = error instanceof Error ? error.message : '登录失败'; }
  finally { busy.value = false; }
}
function retry() { if (failed.value) location.reload(); else void inspect(); }
void inspect();
</script>
<template>
  <main v-if="failure || failed" class="login-page"><ACard class="login-card"><AResult status="error" title="页面暂时不可用" :sub-title="failure || '请重新加载后重试'"><template #extra><AButton type="primary" @click="retry">重试</AButton></template></AResult></ACard></main>
  <div v-else-if="session === undefined" class="login-page" role="status"><ASpin tip="正在确认登录状态…" /></div>
  <main v-else-if="!session" class="login-page"><ACard class="login-card">
    <div class="login-brand"><img :src="`${base}/admin-assets/favicon.svg`" width="42" height="42" alt="" /><div><h1>Cookieflare</h1><p>Vben Admin · 登录管理界面</p></div></div>
    <AAlert v-if="loginError" type="error" :message="loginError" show-icon class="mb-5" />
    <AForm :model="form" layout="vertical" @finish="signIn">
      <AFormItem label="用户名" name="username" :rules="[{ required: true, message: '请输入用户名' }]"><AInput v-model:value="form.username" name="username" autocomplete="username" :disabled="busy" size="large" /></AFormItem>
      <AFormItem label="密码" name="password" :rules="[{ required: true, message: '请输入密码' }]"><AInputPassword v-model:value="form.password" name="password" autocomplete="current-password" :disabled="busy" size="large" /></AFormItem>
      <AButton type="primary" html-type="submit" aria-label="登录" block size="large" :loading="busy">登录</AButton>
    </AForm>
    <p class="muted text-xs mt-5">管理账户与 CookieCloud 客户端的加密密码分开。</p>
    <AButton type="link" :href="nuxtHref" class="mt-3">切换 Nuxt UI</AButton>
  </ACard></main>
  <RouterView v-else :key="generation" />
</template>
