<script setup lang="ts">
import { useResource, type Session } from '../api';
const { data, busy, error, refresh } = useResource<Session>('/auth/session');
</script>
<template>
  <div class="page-heading"><div><h1>当前账户</h1><p>当前管理身份与会话信息。</p></div></div>
  <UAlert v-if="error" color="error" :description="error" role="alert" :actions="[{ label: '重试', onClick: refresh }]" />
  <USkeleton v-else-if="busy" class="h-56" />
  <UCard v-else class="max-w-3xl"><dl class="details-list"><div><dt>用户名</dt><dd>{{ data?.username }}</dd></div><div><dt>角色</dt><dd><UBadge color="neutral" variant="subtle">管理员</UBadge></dd></div><div><dt>会话</dt><dd>12 小时有效，使用 HttpOnly Cookie；注销会删除服务端会话。</dd></div></dl></UCard>
</template>
