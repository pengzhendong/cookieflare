<script setup lang="ts">
import { watch, shallowRef } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import type { RuntimeSnapshot, RuntimeMetrics } from '@pengzhendong/worker-kit/contracts';
import { formatBytes, formatTime, useResource } from '../api';
const { data, busy, error, refresh } = useResource<RuntimeSnapshot>('/runtime');
const metrics = useResource<RuntimeMetrics>('/runtime/metrics');
const history = shallowRef<{ at: string; ok: boolean }[]>([]);
watch(data, value => { if (value) history.value = [...history.value, { at: value.checkedAt, ok: value.ok }].slice(-20); });
useIntervalFn(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
</script>
<template>
  <div class="page-heading"><div><h1>运行状态</h1><p>检查当前 Worker 与存储的真实连接状态。</p></div><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="busy" @click="refresh">检查连接</UButton></div>
  <UAlert v-if="error" color="error" :description="error" role="alert" :actions="[{ label: '重试', onClick: refresh }]" class="mb-5" />
  <div v-if="!data && busy" role="status" class="text-muted mb-5">正在检查运行状态…</div>
  <template v-if="data">
    <div class="grid sm:grid-cols-3 gap-4 mb-6">
      <UCard><p class="text-muted">应用</p><p class="text-lg font-semibold mt-3">{{ data.application.name }} <span class="text-muted text-sm">{{ data.application.version }}</span></p></UCard>
      <UCard><p class="text-muted">运行环境</p><p class="font-medium mt-3">{{ data.runtime }}</p><p class="text-sm text-muted mt-1">{{ data.environment }}</p></UCard>
      <UCard><p class="text-muted">检查时间</p><p class="text-sm mt-3">{{ formatTime(data.checkedAt) }}</p><p class="text-xs text-muted mt-1">每 30 秒检查依赖连接</p></UCard>
    </div>
    <UCard class="mb-6"><template #header><div class="flex items-center justify-between gap-3"><h2 class="font-semibold">依赖连接</h2><UBadge :color="data.ok ? 'success' : 'error'" variant="subtle">{{ data.ok ? '依赖正常' : '需要检查' }}</UBadge></div></template>
      <div v-for="check in data.checks" :key="check.name" class="flex items-center gap-3"><UIcon :name="check.status === 'ok' ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'" class="size-6 shrink-0" :class="check.status === 'ok' ? 'text-success' : 'text-error'" /><div class="flex-1"><strong>{{ check.name }}</strong><p class="text-sm text-muted">{{ check.description }}</p></div><span class="text-sm text-muted">{{ check.durationMs }} ms</span><UBadge :color="check.status === 'ok' ? 'success' : 'error'" variant="subtle">{{ check.status === 'ok' ? '正常' : check.status === 'timeout' ? '超时' : '异常' }}</UBadge></div>
      <div class="flex gap-1.5 items-end mt-6 h-9" aria-label="本页检查记录"><span v-for="(sample, index) in history" :key="index" class="w-3 h-8 rounded-sm" :class="sample.ok ? 'bg-success' : 'bg-error'" :title="`${formatTime(sample.at)} · ${sample.ok ? '正常' : '异常'}`" /></div>
    </UCard>
    <UCard class="mb-6"><template #header><h2 class="font-semibold">Worker 版本</h2></template><dl class="details-list"><div><dt>版本标记</dt><dd>{{ data.version.tag || '未设置' }}</dd></div><div><dt>版本 ID</dt><dd><code>{{ data.version.id || '本地预览未提供' }}</code></dd></div><div><dt>构建时间</dt><dd>{{ data.version.createdAt ? formatTime(data.version.createdAt) : '未提供' }}</dd></div></dl></UCard>
  </template>
  <UAlert v-if="metrics.error.value" color="warning" title="无法读取平台指标" :description="metrics.error.value" />
  <UAlert v-else-if="metrics.data.value?.status === 'not-configured'" color="neutral" icon="i-lucide-chart-no-axes-combined" title="平台指标未接入" :description="metrics.data.value.message" />
  <UAlert v-else-if="metrics.data.value?.status === 'error'" color="warning" title="平台指标暂时不可用" :description="metrics.data.value.message" />
  <UCard v-else-if="metrics.data.value"><template #header><h2 class="font-semibold">平台指标</h2></template><dl class="details-list"><div><dt>请求量</dt><dd>{{ metrics.data.value.requests ?? '无数据' }}</dd></div><div><dt>错误数</dt><dd>{{ metrics.data.value.errors ?? '无数据' }}</dd></div><div><dt>CPU P50 / P99</dt><dd>{{ metrics.data.value.cpuMsP50 ?? '—' }} / {{ metrics.data.value.cpuMsP99 ?? '—' }} ms</dd></div><div><dt>耗时 P50 / P99</dt><dd>{{ metrics.data.value.wallMsP50 ?? '—' }} / {{ metrics.data.value.wallMsP99 ?? '—' }} ms</dd></div><div><dt>内存 P50 / P99</dt><dd>{{ formatBytes(metrics.data.value.memoryBytesP50) }} / {{ formatBytes(metrics.data.value.memoryBytesP99) }}</dd></div></dl></UCard>
</template>
