<script setup lang="ts">
import { useResource, type Session } from '@cookieflare/api';
const { data, error, refresh } = useResource<Session>('/auth/session');
</script>
<template><section class="business-page"><div class="page-heading"><div><h1>当前账户</h1><p>管理服务的管理员会话。</p></div></div><AAlert v-if="error" type="error" :message="error"><template #action><AButton @click="refresh">重试</AButton></template></AAlert><ACard v-else :loading="!data"><dl v-if="data" class="details-list"><div><dt>用户名</dt><dd>{{ data.username }}</dd></div><div><dt>权限</dt><dd><ATag color="blue">管理员</ATag></dd></div><div><dt>会话</dt><dd>12 小时有效，注销后在服务端删除。</dd></div></dl></ACard></section></template>
