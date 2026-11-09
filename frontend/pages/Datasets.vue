<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TableColumn } from '@nuxt/ui';
import { useToast } from '@nuxt/ui/composables';
import { api, formatBytes, formatTime, isRequestCancelled, path, useResource } from '../api';

type Dataset = { uuid: string; updatedAt: string | null; encryptedBytes: number | null; cryptoType: string | null; status: string };
const history = ref<(string | undefined)[]>([undefined]);
const suffix = computed(() => '/datasets' + (history.value.at(-1) ? `?cursor=${encodeURIComponent(history.value.at(-1)!)}` : ''));
const { data, busy, error, refresh } = useResource<{ items: Dataset[]; cursor: string | null }>(suffix);
const selected = ref<Dataset | null>(null), deleting = ref(false), deleteError = ref(''), confirmationOpen = ref(false);
const toast = useToast();
const items = computed(() => data.value?.items || []);
const columns: TableColumn<Dataset>[] = [
  { accessorKey: 'uuid', header: 'UUID' }, { accessorKey: 'updatedAt', header: '更新时间' },
  { accessorKey: 'encryptedBytes', header: '密文大小' }, { accessorKey: 'cryptoType', header: '加密格式' },
  { accessorKey: 'status', header: '状态' }, { id: 'actions', header: '操作' },
];
function confirm(item: Dataset) { selected.value = item; deleteError.value = ''; confirmationOpen.value = true; }
async function remove() {
  if (!selected.value || deleting.value) return;
  deleting.value = true; deleteError.value = '';
  try {
    await api(path(`/datasets/${encodeURIComponent(selected.value.uuid)}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmUuid: selected.value.uuid }) });
    confirmationOpen.value = false; selected.value = null; toast.add({ title: '数据集已删除', color: 'success' }); refresh();
  } catch (error) { if (!isRequestCancelled(error)) deleteError.value = error instanceof Error ? error.message : '删除失败，请重试'; }
  finally { deleting.value = false; }
}
</script>
<template>
  <div class="page-intro"><p>管理客户端上传的加密 CookieCloud 快照。</p><UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="busy" @click="refresh">刷新列表</UButton></div>
  <div class="grid sm:grid-cols-3 gap-4 mb-6">
    <UCard><p class="text-muted flex items-center gap-2"><UIcon name="i-lucide-database" />本页数据集</p><div class="metric-value">{{ data ? items.length : '—' }}</div></UCard>
    <UCard><p class="text-muted">本页密文大小</p><div class="metric-value">{{ data ? formatBytes(items.reduce((sum, item) => sum + (item.encryptedBytes || 0), 0)) : '—' }}</div></UCard>
    <UCard><p class="font-medium flex items-center gap-2"><UIcon name="i-lucide-shield-check" class="text-success" />客户端加密</p><p class="text-muted mt-3 text-sm leading-6">后台只展示元数据，不解密或展示 Cookie 内容。</p></UCard>
  </div>
  <UAlert v-if="error" color="error" :description="error" role="alert" class="mb-5" :actions="[{ label: '重试', onClick: refresh }]" />
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <UTable :data="items" :columns="columns" :loading="busy" empty="尚无加密快照，客户端首次同步后会显示在这里。" :ui="{ root: 'overflow-auto', th: 'whitespace-nowrap', td: 'whitespace-nowrap' }">
      <template #uuid-cell="{ row }"><code class="text-xs">{{ row.original.uuid }}</code></template>
      <template #updatedAt-cell="{ row }">{{ formatTime(row.original.updatedAt) }}</template>
      <template #encryptedBytes-cell="{ row }">{{ formatBytes(row.original.encryptedBytes) }}</template>
      <template #cryptoType-cell="{ row }">{{ row.original.cryptoType || '—' }}</template>
      <template #status-cell="{ row }"><UBadge :color="row.original.status === 'stored' ? 'success' : 'error'" variant="subtle">{{ row.original.status === 'stored' ? '已存储' : '格式异常' }}</UBadge></template>
      <template #actions-cell="{ row }"><UButton color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="`删除 ${row.original.uuid}`" @click="confirm(row.original)">删除</UButton></template>
    </UTable>
    <template #footer><div class="flex justify-between items-center gap-4 flex-wrap"><span class="text-xs text-muted">每页最多 10 条，KV 列表可能有短暂同步延迟。</span><div class="flex gap-3 items-center"><UButton color="neutral" variant="outline" :disabled="history.length === 1 || busy" @click="history = history.slice(0, -1)">上一页</UButton><span class="text-sm">第 {{ history.length }} 页</span><UButton color="neutral" variant="outline" :disabled="!data?.cursor || busy" @click="history = [...history, data!.cursor!]">下一页</UButton></div></div></template>
  </UCard>
  <UModal v-model:open="confirmationOpen" title="删除这个数据集？" description="此操作删除服务端的加密快照，无法从后台撤销。客户端之后仍可重新上传。" :dismissible="!deleting">
    <template #body><code class="break-all">{{ selected?.uuid }}</code><UAlert v-if="deleteError" color="error" :description="deleteError" role="alert" class="mt-4" /></template>
    <template #footer><div class="flex justify-end gap-3 w-full"><UButton color="neutral" variant="outline" :disabled="deleting" @click="confirmationOpen = false">取消</UButton><UButton color="error" :loading="deleting" @click="remove">确认删除</UButton></div></template>
  </UModal>
</template>
