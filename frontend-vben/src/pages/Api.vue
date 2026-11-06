<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { usePreferences } from '@vben/preferences';
import type { OpenAPIV3_1 as O } from 'openapi-types';
import { base, scope, useResource } from '@cookieflare/api';
import { methods, listOperations } from '@cookieflare/openapi';
const { data, busy, error, refresh } = useResource<O.Document>('/openapi.json');
const search = ref(''), method = ref('ALL'), group = ref('ALL'), page = ref(1), tab = ref('list'), selected = ref('');
const { isDark } = usePreferences();
const frame = ref<HTMLIFrameElement>();
const operations = computed(() => listOperations(data.value));
const groups = computed(() => [{ label: '全部分组', value: 'ALL' }, ...[...new Set(operations.value.map(item => item.group))].map(value => ({ label: value, value }))]);
const methodItems = [{ label: '全部方法', value: 'ALL' }, ...methods.map(value => ({ label: value.toUpperCase(), value: value.toUpperCase() }))];
const filtered = computed(() => operations.value.filter(item => (method.value === 'ALL' || item.method === method.value) && (group.value === 'ALL' || item.group === group.value) && `${item.path} ${item.summary}`.toLowerCase().includes(search.value.toLowerCase())));
const rows = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
const columns = [{ key: 'method', dataIndex: 'method', title: '方法' }, { key: 'path', dataIndex: 'path', title: '路径' }, { key: 'summary', dataIndex: 'summary', title: '用途' }, { key: 'authentication', dataIndex: 'authentication', title: '认证' }, { key: 'actions', title: '文档' }];
const url = computed(() => `${base}/admin/reference?theme=${isDark.value ? 'dark' : 'light'}${selected.value ? `&operation=${encodeURIComponent(selected.value)}` : ''}`);
const version = scope.version;
useEventListener(window, 'message', event => {
  if (event.origin === location.origin && event.source === frame.value?.contentWindow && event.data?.type === 'workerkit:api-session-expired') scope.expire(version);
});
function openOperation(id: string) { selected.value = id; tab.value = 'reference'; }
</script>
<template><section class="business-page">
  <div class="page-heading"><div><h1>API 中心</h1><p>CookieCloud 同步协议与管理接口。</p></div><AButton :loading="busy" @click="refresh">刷新文档</AButton></div>
  <AAlert v-if="error" type="error" :message="error" show-icon><template #action><AButton @click="refresh">重试</AButton></template></AAlert>
  <ATabs v-model:active-key="tab" destroy-inactive-tab-pane><ATabPane key="list" tab="接口列表">
    <div class="flex flex-wrap gap-3 mb-5"><AInput v-model:value="search" placeholder="搜索路径或用途" aria-label="搜索接口" allow-clear class="flex-1 min-w-48" @change="page = 1" /><ASelect v-model:value="method" :options="methodItems" aria-label="请求方法" class="min-w-32" @change="page = 1" /><ASelect v-model:value="group" :options="groups" aria-label="接口分组" class="min-w-36" @change="page = 1" /></div>
    <ACard :body-style="{ padding: '0' }"><ATable :data-source="rows" :columns="columns" :loading="busy" :pagination="false" :scroll="{ x: 900 }" row-key="id" :locale="{ emptyText: '没有匹配的接口' }"><template #bodyCell="{ column, record }"><ATag v-if="column.key === 'method'" :color="record.method === 'DELETE' ? 'error' : record.method === 'POST' ? 'warning' : 'blue'">{{ record.method }}</ATag><code v-else-if="column.key === 'path'" class="text-xs">{{ record.path }}</code><AButton v-else-if="column.key === 'actions'" type="link" :aria-label="`查看 ${record.summary}`" @click="openOperation(record.id)">查看</AButton></template></ATable><div class="list-footer p-4"><span class="muted">共 {{ filtered.length }} 个接口</span><APagination v-model:current="page" :total="filtered.length" :page-size="10" :show-size-changer="false" /></div></ACard>
  </ATabPane><ATabPane key="reference" tab="交互文档"><div class="flex flex-wrap items-center justify-between gap-3 mb-4"><p class="muted text-sm m-0">调试只请求当前应用；写请求会修改实际数据。</p><AButton v-if="selected" @click="selected = ''">查看全部接口</AButton></div><iframe ref="frame" :src="url" title="交互式 API 文档" class="reference-frame" /></ATabPane></ATabs>
</section></template>
