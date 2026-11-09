<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEventListener, useMutationObserver } from '@vueuse/core';
import type { TableColumn } from '@nuxt/ui';
import { base, scope, useResource } from '../api';
import type { OpenAPIV3_1 as O } from 'openapi-types';
import { methods, listOperations, type ApiOperation } from '../openapi';
const { data, busy, error, refresh } = useResource<O.Document>('/openapi.json');
const search = ref(''), method = ref('ALL'), group = ref('ALL'), page = ref(1), tab = ref<string | number>('list'), selected = ref('');
const frame = ref<HTMLIFrameElement>(), dark = ref(document.documentElement.classList.contains('dark'));
useMutationObserver(document.documentElement, () => { dark.value = document.documentElement.classList.contains('dark'); }, { attributes: true, attributeFilter: ['class'] });
const operations = computed(() => listOperations(data.value));
const groups = computed(() => [{ label: '全部分组', value: 'ALL' }, ...[...new Set(operations.value.map(item => item.group))].map(value => ({ label: value, value }))]);
const methodItems = [{ label: '全部方法', value: 'ALL' }, ...methods.map(value => ({ label: value.toUpperCase(), value: value.toUpperCase() }))];
const filtered = computed(() => operations.value.filter(item => (method.value === 'ALL' || item.method === method.value) && (group.value === 'ALL' || item.group === group.value) && `${item.path} ${item.summary}`.toLowerCase().includes(search.value.toLowerCase())));
const rows = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
const columns: TableColumn<ApiOperation>[] = [{ accessorKey: 'method', header: '方法' }, { accessorKey: 'path', header: '路径' }, { accessorKey: 'summary', header: '用途' }, { accessorKey: 'authentication', header: '认证' }, { id: 'actions', header: '文档' }];
const url = computed(() => `${base}/admin/reference?theme=${dark.value ? 'dark' : 'light'}${selected.value ? `&operation=${encodeURIComponent(selected.value)}` : ''}`);
const version = scope.version;
useEventListener(window, 'message', event => {
  if (event.origin === location.origin && event.source === frame.value?.contentWindow && event.data?.type === 'workerkit:api-session-expired') scope.expire(version);
});
function openOperation(id: string) { selected.value = id; tab.value = 'reference'; }
</script>
<template>
  <div class="page-intro"><p>CookieCloud 同步协议与管理接口。</p><UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="busy" @click="refresh">刷新文档</UButton></div>
  <UAlert v-if="error" color="error" :description="error" :actions="[{ label: '重试', onClick: refresh }]" />
  <UTabs v-model="tab" :items="[{ label: '接口列表', value: 'list', slot: 'list' }, { label: '交互文档', value: 'reference', slot: 'reference' }]" class="w-full">
    <template #list>
      <div class="flex flex-wrap gap-3 my-4"><UInput v-model="search" placeholder="搜索路径或用途" aria-label="搜索接口" icon="i-lucide-search" class="flex-1 min-w-48" @update:model-value="page = 1" /><USelect v-model="method" :items="methodItems" aria-label="请求方法" @update:model-value="page = 1" /><USelect v-model="group" :items="groups" aria-label="接口分组" @update:model-value="page = 1" /></div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }"><UTable :data="rows" :columns="columns" :loading="busy" empty="没有匹配的接口" :ui="{ root: 'overflow-auto', td: 'whitespace-nowrap' }"><template #method-cell="{ row }"><UBadge :color="row.original.method === 'DELETE' ? 'error' : row.original.method === 'POST' ? 'warning' : 'info'" variant="subtle">{{ row.original.method }}</UBadge></template><template #path-cell="{ row }"><code class="text-xs">{{ row.original.path }}</code></template><template #actions-cell="{ row }"><UButton variant="ghost" :aria-label="`查看 ${row.original.summary}`" @click="openOperation(row.original.id)">查看</UButton></template></UTable><template #footer><div class="flex flex-wrap items-center justify-between gap-3"><span class="text-sm text-muted">共 {{ filtered.length }} 个接口</span><UPagination v-model:page="page" :total="filtered.length" :items-per-page="10" /></div></template></UCard>
    </template>
    <template #reference><div class="flex flex-wrap justify-between items-center gap-3 my-4"><p class="text-sm text-muted">调试只请求当前应用；写请求会修改实际数据。</p><UButton v-if="selected" color="neutral" variant="outline" @click="selected = ''">查看全部接口</UButton></div><iframe ref="frame" :src="url" title="交互式 API 文档" class="reference-frame border border-default" /></template>
  </UTabs>
</template>
