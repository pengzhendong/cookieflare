<script setup lang="ts">
import { useResource } from '../api';
type Configuration = { apiRoot: string; storage: string; encryption: string; uploadTokenConfigured: boolean; uuidRateLimitConfigured: boolean; ipRateLimitConfigured: boolean; loginRateLimitConfigured: boolean; sessionHours: number };
const { data, busy, error, refresh } = useResource<Configuration>('/configuration');
</script>
<template>
  <div class="page-heading"><div><h1>服务配置</h1><p>查看当前部署的能力与认证状态。</p></div><UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="busy" @click="refresh">刷新配置</UButton></div>
  <UAlert v-if="error" color="error" :description="error" role="alert" :actions="[{ label: '重试', onClick: refresh }]" />
  <USkeleton v-else-if="!data" class="h-80 w-full" aria-label="正在读取服务配置" />
  <UCard v-else><dl class="details-list">
    <div><dt>API 前缀</dt><dd><code>{{ data.apiRoot }}</code></dd></div>
    <div><dt>存储</dt><dd>{{ data.storage }}</dd></div>
    <div><dt>加密</dt><dd>{{ data.encryption }}</dd></div>
    <div><dt>上传令牌</dt><dd>{{ data.uploadTokenConfigured ? '已配置，仅保护写入；标准客户端需确认支持自定义请求头。' : '未配置，使用标准 CookieCloud 上传协议。' }}</dd></div>
    <div><dt>UUID 上传限流</dt><dd><UBadge :color="data.uuidRateLimitConfigured ? 'success' : 'warning'" variant="subtle">{{ data.uuidRateLimitConfigured ? '已配置' : '未配置' }}</UBadge></dd></div>
    <div><dt>IP 上传限流</dt><dd><UBadge :color="data.ipRateLimitConfigured ? 'success' : 'warning'" variant="subtle">{{ data.ipRateLimitConfigured ? '已配置' : '未配置' }}</UBadge></dd></div>
    <div><dt>后台登录限流</dt><dd><UBadge :color="data.loginRateLimitConfigured ? 'success' : 'warning'" variant="subtle">{{ data.loginRateLimitConfigured ? '已配置' : '未配置' }}</UBadge></dd></div>
    <div><dt>后台会话</dt><dd>{{ data.sessionHours }} 小时，注销后在服务端删除。</dd></div>
  </dl></UCard>
</template>
