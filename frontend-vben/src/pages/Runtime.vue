<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import type { RuntimeSnapshot, RuntimeMetrics } from '@pengzhendong/worker-kit/contracts';
import { formatBytes, formatTime, useResource } from '@cookieflare/api';
const { data, busy, error, refresh } = useResource<RuntimeSnapshot>('/runtime');
const metrics = useResource<RuntimeMetrics>('/runtime/metrics');
const history = shallowRef<{ at: string; ok: boolean }[]>([]);
watch(data, value => { if (value) history.value = [...history.value, { at: value.checkedAt, ok: value.ok }].slice(-20); });
useIntervalFn(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
</script>
<template><section class="business-page">
  <div class="page-heading"><div><h1>运行状态</h1><p>检查当前 Worker 与存储的真实连接状态。</p></div><AButton :loading="busy" @click="refresh">检查连接</AButton></div>
  <AAlert v-if="error" type="error" :message="error" class="mb-5"><template #action><AButton @click="refresh">重试</AButton></template></AAlert>
  <ASkeleton v-if="busy && !data" active />
  <template v-if="data"><ARow :gutter="[16, 16]" class="mb-6"><ACol :xs="24" :sm="8"><ACard title="应用"><strong>{{ data.application.name }} {{ data.application.version }}</strong></ACard></ACol><ACol :xs="24" :sm="8"><ACard title="运行环境"><p>{{ data.runtime }}</p><span class="muted">{{ data.environment }}</span></ACard></ACol><ACol :xs="24" :sm="8"><ACard title="检查时间"><p>{{ formatTime(data.checkedAt) }}</p><span class="muted text-xs">每 30 秒检查依赖连接</span></ACard></ACol></ARow>
    <ACard title="依赖连接" class="mb-6"><template #extra><ATag :color="data.ok ? 'success' : 'error'">{{ data.ok ? '依赖正常' : '需要检查' }}</ATag></template><div v-for="check in data.checks" :key="check.name" class="flex flex-wrap items-center gap-4"><div class="flex-1"><strong>{{ check.name }}</strong><p class="muted mb-0">{{ check.description }}</p></div><span class="muted">{{ check.durationMs }} ms</span><ATag :color="check.status === 'ok' ? 'success' : 'error'">{{ check.status === 'ok' ? '正常' : check.status === 'timeout' ? '超时' : '异常' }}</ATag></div><div class="flex gap-1.5 mt-6 h-8" aria-label="本页检查记录"><span v-for="(sample, index) in history" :key="index" class="w-3 rounded-sm" :style="{ background: sample.ok ? '#52c41a' : '#ff4d4f' }" :title="`${formatTime(sample.at)} · ${sample.ok ? '正常' : '异常'}`" /></div></ACard>
    <ACard title="Worker 版本" class="mb-6"><dl class="details-list"><div><dt>版本标记</dt><dd>{{ data.version.tag || '未设置' }}</dd></div><div><dt>版本 ID</dt><dd><code>{{ data.version.id || '本地预览未提供' }}</code></dd></div><div><dt>构建时间</dt><dd>{{ data.version.createdAt ? formatTime(data.version.createdAt) : '未提供' }}</dd></div></dl></ACard>
  </template>
  <AAlert v-if="metrics.error.value" type="warning" message="无法读取平台指标" :description="metrics.error.value" show-icon />
  <AAlert v-else-if="metrics.data.value?.status !== 'ok' && metrics.data.value" :type="metrics.data.value.status === 'error' ? 'warning' : 'info'" :message="metrics.data.value.status === 'error' ? '平台指标暂时不可用' : '平台指标未接入'" :description="metrics.data.value.message" show-icon />
  <ACard v-else-if="metrics.data.value" title="平台指标"><dl class="details-list"><div><dt>请求量 / 错误数</dt><dd>{{ metrics.data.value.requests ?? '—' }} / {{ metrics.data.value.errors ?? '—' }}</dd></div><div><dt>CPU P50 / P99</dt><dd>{{ metrics.data.value.cpuMsP50 ?? '—' }} / {{ metrics.data.value.cpuMsP99 ?? '—' }} ms</dd></div><div><dt>耗时 P50 / P99</dt><dd>{{ metrics.data.value.wallMsP50 ?? '—' }} / {{ metrics.data.value.wallMsP99 ?? '—' }} ms</dd></div><div><dt>内存 P50 / P99</dt><dd>{{ formatBytes(metrics.data.value.memoryBytesP50) }} / {{ formatBytes(metrics.data.value.memoryBytesP99) }}</dd></div></dl></ACard>
</section></template>
