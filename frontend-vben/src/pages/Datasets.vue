<script setup lang="ts">
import { computed, ref } from 'vue';
import { App } from 'ant-design-vue';
import { api, formatBytes, formatTime, isRequestCancelled, path, useResource } from '@cookieflare/api';
type Dataset = { uuid: string; updatedAt: string | null; encryptedBytes: number | null; cryptoType: string | null; status: string };
const cursors = ref<(string | undefined)[]>([undefined]);
const suffix = computed(() => '/datasets' + (cursors.value.at(-1) ? `?cursor=${encodeURIComponent(cursors.value.at(-1)!)}` : ''));
const { data, busy, error, refresh } = useResource<{ items: Dataset[]; cursor: string | null }>(suffix);
const items = computed(() => data.value?.items || []);
const columns = [{ key: 'uuid', dataIndex: 'uuid', title: 'UUID' }, { key: 'updatedAt', dataIndex: 'updatedAt', title: '更新时间' }, { key: 'encryptedBytes', dataIndex: 'encryptedBytes', title: '密文大小' }, { key: 'cryptoType', dataIndex: 'cryptoType', title: '加密格式' }, { key: 'status', dataIndex: 'status', title: '状态' }, { key: 'actions', title: '操作' }];
const selected = ref<Dataset | null>(null), open = ref(false), deleting = ref(false), deleteError = ref('');
const { message } = App.useApp();
function confirm(item: Dataset) { selected.value = item; deleteError.value = ''; open.value = true; }
async function remove() {
  if (!selected.value || deleting.value) return;
  deleting.value = true; deleteError.value = '';
  try {
    await api(path(`/datasets/${encodeURIComponent(selected.value.uuid)}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmUuid: selected.value.uuid }) });
    open.value = false; selected.value = null; message.success('数据集已删除'); refresh();
  } catch (error) { if (!isRequestCancelled(error)) deleteError.value = error instanceof Error ? error.message : '删除失败'; }
  finally { deleting.value = false; }
}
function next() { if (data.value?.cursor) cursors.value = [...cursors.value, data.value.cursor]; }
</script>
<template><section class="business-page">
  <div class="page-heading"><div><h1>数据集</h1><p>管理客户端上传的加密 CookieCloud 快照。</p></div><AButton :loading="busy" @click="refresh">刷新列表</AButton></div>
  <ARow :gutter="[16, 16]" class="mb-6"><ACol :xs="24" :sm="8"><ACard><AStatistic title="本页数据集" :value="data ? items.length : '—'" /></ACard></ACol><ACol :xs="24" :sm="8"><ACard><AStatistic title="本页密文大小" :value="data ? formatBytes(items.reduce((sum, item) => sum + (item.encryptedBytes || 0), 0)) : '—'" /></ACard></ACol><ACol :xs="24" :sm="8"><ACard><div class="font-semibold mb-2">客户端加密</div><p class="muted text-sm m-0">后台只展示元数据，不解密或展示 Cookie 内容。</p></ACard></ACol></ARow>
  <AAlert v-if="error" type="error" :message="error" show-icon class="mb-5"><template #action><AButton size="small" @click="refresh">重试</AButton></template></AAlert>
  <ACard :body-style="{ padding: '0' }"><ATable :columns="columns" :data-source="items" :loading="busy" row-key="uuid" :pagination="false" :scroll="{ x: 950 }" :locale="{ emptyText: '尚无加密快照，客户端首次同步后会显示在这里。' }">
    <template #bodyCell="{ column, record }"><code v-if="column.key === 'uuid'" class="text-xs">{{ record.uuid }}</code><template v-else-if="column.key === 'updatedAt'">{{ formatTime(record.updatedAt) }}</template><template v-else-if="column.key === 'encryptedBytes'">{{ formatBytes(record.encryptedBytes) }}</template><template v-else-if="column.key === 'cryptoType'">{{ record.cryptoType || '—' }}</template><ATag v-else-if="column.key === 'status'" :color="record.status === 'stored' ? 'success' : 'error'">{{ record.status === 'stored' ? '已存储' : '格式异常' }}</ATag><AButton v-else-if="column.key === 'actions'" type="link" danger :aria-label="`删除 ${record.uuid}`" @click="confirm(record)">删除</AButton></template>
  </ATable><div class="list-footer p-4"><span class="muted text-xs">每页最多 10 条，KV 列表可能有短暂同步延迟。</span><ASpace><AButton :disabled="cursors.length === 1 || busy" @click="cursors = cursors.slice(0, -1)">上一页</AButton><span>第 {{ cursors.length }} 页</span><AButton :disabled="!data?.cursor || busy" @click="next">下一页</AButton></ASpace></div></ACard>
  <AModal v-model:open="open" title="删除这个数据集？" ok-text="确认删除" cancel-text="取消" :confirm-loading="deleting" :ok-button-props="{ danger: true }" :cancel-button-props="{ disabled: deleting }" :closable="!deleting" :mask-closable="!deleting" :keyboard="!deleting" @ok="remove"><p>此操作删除服务端的加密快照，无法从后台撤销。客户端之后仍可重新上传。</p><code class="break-all">{{ selected?.uuid }}</code><AAlert v-if="deleteError" type="error" :message="deleteError" class="mt-4" /></AModal>
</section></template>
