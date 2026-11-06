<script setup lang="ts">
import { useResource } from '@cookieflare/api';
type Configuration = { apiRoot: string; storage: string; encryption: string; uploadTokenConfigured: boolean; uuidRateLimitConfigured: boolean; ipRateLimitConfigured: boolean; loginRateLimitConfigured: boolean; sessionHours: number };
const { data, busy, error, refresh } = useResource<Configuration>('/configuration');
</script>
<template><section class="business-page">
  <div class="page-heading"><div><h1>服务配置</h1><p>查看当前部署的能力与认证状态。</p></div><AButton :loading="busy" @click="refresh">刷新配置</AButton></div>
  <AAlert v-if="error" type="error" :message="error" show-icon><template #action><AButton @click="refresh">重试</AButton></template></AAlert>
  <ACard v-else :loading="!data"><dl v-if="data" class="details-list"><div><dt>API 前缀</dt><dd><code>{{ data.apiRoot }}</code></dd></div><div><dt>存储</dt><dd>{{ data.storage }}</dd></div><div><dt>加密</dt><dd>{{ data.encryption }}</dd></div><div><dt>上传令牌</dt><dd>{{ data.uploadTokenConfigured ? '已配置，仅保护写入；标准客户端需确认支持自定义请求头。' : '未配置，使用标准 CookieCloud 上传协议。' }}</dd></div><div v-for="check in [{ label: 'UUID 上传限流', ok: data.uuidRateLimitConfigured }, { label: 'IP 上传限流', ok: data.ipRateLimitConfigured }, { label: '后台登录限流', ok: data.loginRateLimitConfigured }]" :key="check.label"><dt>{{ check.label }}</dt><dd><ATag :color="check.ok ? 'success' : 'warning'">{{ check.ok ? '已配置' : '未配置' }}</ATag></dd></div><div><dt>后台会话</dt><dd>{{ data.sessionHours }} 小时，注销后在服务端删除。</dd></div></dl></ACard>
</section></template>
