import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Flex, Input, Modal, Select, Skeleton, Space, Tabs, Tag, Typography } from 'antd';
import { ProDescriptions, ProTable, type ProColumns } from '@ant-design/pro-components';
import { PageHeader, StatCard, useWorkerKitTheme } from '@pengzhendong/worker-kit/web';
import { RuntimeStatus } from '@pengzhendong/worker-kit/web/runtime-status';
import type { OpenAPIV3_1 as O } from 'openapi-types';
import { api, base, formatBytes, formatTime, isRequestCancelled, path, scope, useResource, type Session } from './api';
import { methods, listOperations, type ApiOperation } from './openapi';

type Dataset = { uuid: string; updatedAt: string | null; encryptedBytes: number | null; cryptoType: string | null; status: string };

export function Datasets() {
  const { message } = App.useApp();
  const [history, setHistory] = useState<(string | undefined)[]>([undefined]);
  const cursor = history.at(-1);
  const { data, loading, error, refresh } = useResource<{ items: Dataset[]; cursor: string | null }>(
    '/datasets' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
  );
  const [selected, setSelected] = useState<Dataset>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const rows = data?.items ?? [];
  async function remove() {
    if (!selected || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(path(`/datasets/${encodeURIComponent(selected.uuid)}`), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmUuid: selected.uuid }),
      });
      setSelected(undefined);
      void message.success('数据集已删除');
      if (rows.length === 1 && history.length > 1) setHistory(previous => previous.slice(0, -1));
      else refresh();
    } catch (failure) {
      if (!isRequestCancelled(failure)) setDeleteError(failure instanceof Error ? failure.message : '删除失败，请重试');
    } finally { setDeleting(false); }
  }
  const columns: ProColumns<Dataset>[] = [
    { title: 'UUID', dataIndex: 'uuid', render: (_, row) => <code>{row.uuid}</code> },
    { title: '更新时间', render: (_, row) => formatTime(row.updatedAt) },
    { title: '密文大小', render: (_, row) => formatBytes(row.encryptedBytes) },
    { title: '加密格式', dataIndex: 'cryptoType' },
    { title: '状态', render: (_, row) => <Tag color={row.status === 'stored' ? 'success' : 'error'}>{row.status === 'stored' ? '已存储' : '格式异常'}</Tag> },
    { title: '操作', valueType: 'option', render: (_, row) => <Button type="link" danger aria-label={`删除 ${row.uuid}`}
      onClick={() => { setDeleteError(''); setSelected(row); }}>删除</Button> },
  ];
  return <Flex vertical gap={16}>
    <PageHeader title="数据集" description="管理客户端上传的加密 CookieCloud 快照。"
      actions={<Button loading={loading} onClick={refresh}>刷新列表</Button>} />
    <div className="cookieflare-stats">
      <StatCard title="本页数据集" value={data ? rows.length : '—'} />
      <StatCard title="本页密文大小" value={data ? formatBytes(rows.reduce((sum, item) => sum + (item.encryptedBytes || 0), 0)) : '—'} />
      <Card size="small"><Typography.Text strong>客户端加密</Typography.Text><p>后台只展示元数据，不解密或展示 Cookie 内容。</p></Card>
    </div>
    {error && <Alert type="error" title={error} action={<Button onClick={refresh}>重试</Button>} />}
    <ProTable<Dataset> rowKey="uuid" columns={columns} dataSource={rows} loading={loading} search={false} options={false}
      pagination={false} scroll={{ x: 720 }} locale={{ emptyText: '尚无加密快照，客户端首次同步后会显示在这里。' }}
      footer={() => <Flex justify="space-between" gap={8} align="center" wrap>
        <Typography.Text type="secondary">每页最多 10 条，KV 列表可能有短暂同步延迟。</Typography.Text>
        <Space><Button disabled={history.length === 1 || loading || deleting} onClick={() => setHistory(value => value.slice(0, -1))}>上一页</Button>
          <span>第 {history.length} 页</span><Button disabled={!data?.cursor || loading || deleting}
            onClick={() => { if (data?.cursor) setHistory(value => [...value, data.cursor!]); }}>下一页</Button></Space>
      </Flex>} />
    <Modal open={!!selected} title="删除这个数据集？" okText="确认删除" okButtonProps={{ danger: true }} confirmLoading={deleting}
      onCancel={() => { if (!deleting) setSelected(undefined); }} onOk={remove}>
      <p>此操作删除服务端的加密快照，无法从后台撤销。客户端之后仍可重新上传。</p>
      <code>{selected?.uuid}</code>
      {deleteError && <Alert type="error" title={deleteError} />}
    </Modal>
  </Flex>;
}

type ConfigurationData = {
  apiRoot: string; storage: string; encryption: string; uploadTokenConfigured: boolean;
  uuidRateLimitConfigured: boolean; ipRateLimitConfigured: boolean; loginRateLimitConfigured: boolean; sessionHours: number;
};
export function Configuration() {
  const { data, loading, error, refresh } = useResource<ConfigurationData>('/configuration');
  const status = (value: unknown) => <Tag color={value ? 'success' : 'warning'}>{value ? '已配置' : '未配置'}</Tag>;
  return <>
    <PageHeader title="服务配置" description="查看当前部署的能力与认证状态。" actions={<Button loading={loading} onClick={refresh}>刷新配置</Button>} />
    {error ? <Alert type="error" title={error} action={<Button onClick={refresh}>重试</Button>} /> :
      !data ? <Skeleton active /> : <Card><ProDescriptions<ConfigurationData> dataSource={data} column={1} columns={[
        { title: 'API 前缀', render: () => <code>{data.apiRoot}</code> },
        { title: '存储', dataIndex: 'storage' }, { title: '加密', dataIndex: 'encryption' },
        { title: '上传令牌', render: () => data.uploadTokenConfigured ? '已配置，仅保护写入；标准客户端需确认支持自定义请求头。' : '未配置，使用标准 CookieCloud 上传协议。' },
        { title: 'UUID 上传限流', render: () => status(data.uuidRateLimitConfigured) },
        { title: 'IP 上传限流', render: () => status(data.ipRateLimitConfigured) },
        { title: '后台登录限流', render: () => status(data.loginRateLimitConfigured) },
        { title: '后台会话', render: () => `${data.sessionHours} 小时，注销后在服务端删除。` },
      ]} /></Card>}
  </>;
}

export function Account({ username }: Session) {
  return <><PageHeader title="当前账户" /><Card><ProDescriptions<Session> dataSource={{ username }} column={1} columns={[
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', render: () => '管理员' },
    { title: '会话', render: () => '12 小时有效，使用 HttpOnly Cookie；注销会删除服务端会话。' },
  ]} /></Card></>;
}

export function Runtime() {
  return <RuntimeStatus client={api} statusUrl={path('/runtime')} metricsUrl={path('/runtime/metrics')} />;
}

export function ApiCenter() {
  const { data, loading, error, refresh } = useResource<O.Document>('/openapi.json');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('list');
  const [selected, setSelected] = useState('');
  const { dark } = useWorkerKitTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const version = scope.version;
    const receive = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow &&
        event.data?.type === 'workerkit:api-session-expired') scope.expire(version);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  const operations = listOperations(data ?? null);
  const groups = [...new Set(operations.map(item => item.group))];
  const rows = operations.filter(item => (method === 'ALL' || item.method === method) &&
    (group === 'ALL' || item.group === group) && `${item.path} ${item.summary}`.toLowerCase().includes(search.toLowerCase()));
  const columns: ProColumns<ApiOperation>[] = [
    { title: '方法', render: (_, row) => <Tag color={row.method === 'DELETE' ? 'error' : row.method === 'POST' ? 'warning' : 'processing'}>{row.method}</Tag> },
    { title: '路径', render: (_, row) => <code>{row.path}</code> },
    { title: '用途', dataIndex: 'summary' }, { title: '认证', dataIndex: 'authentication' },
    { title: '文档', valueType: 'option', render: (_, row) => <Button type="link" aria-label={`查看 ${row.summary}`}
      onClick={() => { setSelected(row.id); setTab('reference'); }}>查看</Button> },
  ];
  const reference = `${base}/admin/reference?theme=${dark ? 'dark' : 'light'}${selected ? `&operation=${encodeURIComponent(selected)}` : ''}`;
  return <>
    <PageHeader title="API 中心" description="CookieCloud 同步协议与管理接口。" actions={<Button loading={loading} onClick={refresh}>刷新文档</Button>} />
    {error && <Alert type="error" title={error} action={<Button onClick={refresh}>重试</Button>} />}
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'list', label: '接口列表', children: <>
        <Flex wrap gap={8} style={{ marginBottom: 12 }}>
          <Input aria-label="搜索接口" placeholder="搜索路径或用途" value={search} style={{ width: 240 }} onChange={event => { setSearch(event.target.value); setPage(1); }} />
          <Select aria-label="请求方法" value={method} options={[{ label: '全部方法', value: 'ALL' }, ...methods.map(m => ({ label: m.toUpperCase(), value: m.toUpperCase() }))]} onChange={value => { setMethod(value); setPage(1); }} />
          <Select aria-label="接口分组" value={group} options={[{ label: '全部分组', value: 'ALL' }, ...groups.map(value => ({ label: value, value }))]} onChange={value => { setGroup(value); setPage(1); }} />
        </Flex>
        <ProTable<ApiOperation> rowKey={row => `${row.method}:${row.path}`} columns={columns} dataSource={rows}
          search={false} options={false} loading={loading} scroll={{ x: 700 }}
          pagination={{ current: page, pageSize: 10, showSizeChanger: false, onChange: setPage, showTotal: total => `共 ${total} 个接口` }}
          locale={{ emptyText: '没有匹配的接口' }} />
      </> },
      { key: 'reference', label: '交互文档', children: <>
        <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">调试只请求当前应用；写请求会修改实际数据。</Typography.Text>
          {selected && <Button onClick={() => setSelected('')}>查看全部接口</Button>}
        </Flex>
        <iframe ref={frame} src={reference} title="交互式 API 文档" className="cookieflare-reference" />
      </> },
    ]} />
  </>;
}
