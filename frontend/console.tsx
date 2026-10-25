import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, App, Button, Card, Col, Descriptions, Flex, Modal, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { CloudServerOutlined, DatabaseOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined, UserOutlined, ApiOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { AdminShell, AppErrorBoundary, LoginPage, PageHeader, WorkerKitProvider, createApiClient, createSessionScope, isRequestCancelled } from '@pengzhendong/worker-kit/web';
import { ApiCenter } from '@pengzhendong/worker-kit/web/api-center';
import { RuntimeStatus } from '@pengzhendong/worker-kit/web/runtime-status';
import '@pengzhendong/worker-kit/web/styles.css';
import './console.css';

const base = document.body.dataset.apiRoot || '';
const path = (suffix: string) => `${base}/admin/api${suffix}`;
const scope = createSessionScope(), api = createApiClient({ scope }), auth = createApiClient();
scope.registerCleanup(() => Modal.destroyAll());
const readPage = () => location.hash.replace(/^#\/?/, '') || 'datasets';
type Dataset = { uuid: string; updatedAt: string | null; encryptedBytes: number | null; cryptoType: string | null; status: string };
const size = (bytes: number | null) => bytes === null ? '—' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

function Datasets() {
  const { modal, message } = App.useApp();
  const [items, setItems] = useState<Dataset[]>([]), [cursor, setCursor] = useState<string | null>(null), [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => { setBusy(true); setError(''); try {
    const data = await api<{ items: Dataset[]; cursor: string | null }>(path('/datasets') + (stack.at(-1) ? `?cursor=${encodeURIComponent(stack.at(-1)!)}` : ''), { signal }); setItems(data.items); setCursor(data.cursor);
  } catch (e) { if (!isRequestCancelled(e)) setError(e instanceof Error ? e.message : '读取失败'); } finally { if (!signal?.aborted) setBusy(false); } }, [stack]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  function remove(item: Dataset) { modal.confirm({ title: '删除这个数据集？', icon: <DeleteOutlined />, content: <><Typography.Paragraph><Typography.Text code>{item.uuid}</Typography.Text></Typography.Paragraph><Typography.Paragraph>这会删除服务端的加密快照，无法从后台撤销。客户端之后仍可重新上传。</Typography.Paragraph></>, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => { try { await api(path(`/datasets/${encodeURIComponent(item.uuid)}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmUuid: item.uuid }) }); message.success('数据集已删除'); await load(); } catch (e) { message.error(e instanceof Error ? e.message : '删除失败'); throw e; } } }); }
  return <><PageHeader title="数据集" description="管理客户端上传的加密 CookieCloud 快照。" actions={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={busy}>刷新列表</Button>} />
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}><Col xs={24} sm={8}><Card><Statistic title="本页数据集" value={items.length} prefix={<DatabaseOutlined />} /></Card></Col><Col xs={24} sm={8}><Card><Statistic title="本页密文大小" value={size(items.reduce((total, item) => total + (item.encryptedBytes ?? 0), 0))} /></Card></Col><Col xs={24} sm={8}><Card><Space><SafetyCertificateOutlined /><Typography.Text>客户端加密</Typography.Text></Space><Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>后台不解密或展示 Cookie 内容。</Typography.Paragraph></Card></Col></Row>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => void load()}>重试</Button>} style={{ marginBottom: 16 }} />}
    <Card><Table<Dataset> loading={busy} dataSource={items} rowKey="uuid" pagination={false} scroll={{ x: 720 }} locale={{ emptyText: '尚无加密快照，客户端首次同步后会显示在这里。' }} columns={[
      { title: 'UUID', dataIndex: 'uuid', render: (uuid) => <Typography.Text code copyable>{uuid}</Typography.Text> },
      { title: '更新时间', dataIndex: 'updatedAt', render: (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录' },
      { title: '密文大小', dataIndex: 'encryptedBytes', render: size }, { title: '加密格式', dataIndex: 'cryptoType', render: (value) => value || '—' },
      { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'stored' ? 'green' : 'red'}>{value === 'stored' ? '已存储' : '格式异常'}</Tag> },
      { title: '操作', key: 'actions', render: (_, item) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(item)}>删除</Button> },
    ]} /><Flex justify="space-between" align="center" wrap gap={12} style={{ marginTop: 16 }}><Typography.Text type="secondary">每页最多 10 条，KV 列表可能有短暂同步延迟。</Typography.Text><Space><Button disabled={stack.length === 1 || busy} onClick={() => setStack((value) => value.slice(0, -1))}>上一页</Button><Typography.Text>第 {stack.length} 页</Typography.Text><Button disabled={!cursor || busy} onClick={() => setStack((value) => [...value, cursor!])}>下一页</Button></Space></Flex></Card>
  </>;
}
function Configuration() {
  const [data, setData] = useState<any>(), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); api(path('/configuration'), { signal: controller.signal }).then(setData).catch((e) => { if (!isRequestCancelled(e)) setError(e.message); }); return () => controller.abort(); }, []);
  return <><PageHeader title="服务配置" description="查看当前部署的能力与认证状态。" />{error ? <Alert type="error" title={error} /> : !data ? <Spin /> : <Card><Descriptions column={1} items={[
    { key: 'root', label: 'API 前缀', children: data.apiRoot }, { key: 'storage', label: '存储', children: data.storage }, { key: 'crypto', label: '加密', children: data.encryption },
    { key: 'token', label: '上传令牌', children: data.uploadTokenConfigured ? '已配置，仅保护写入；标准客户端需确认支持自定义请求头。' : '未配置，使用标准 CookieCloud 上传协议。' },
    { key: 'uuid-limit', label: 'UUID 上传限流', children: data.uuidRateLimitConfigured ? '已配置' : '未配置' }, { key: 'ip-limit', label: 'IP 上传限流', children: data.ipRateLimitConfigured ? '已配置' : '未配置' },
    { key: 'login-limit', label: '后台登录限流', children: data.loginRateLimitConfigured ? '已配置' : '未配置' }, { key: 'session', label: '后台会话', children: `${data.sessionHours} 小时，注销后在服务端删除。` },
  ]} /></Card>}</>;
}
function ApiDocs() {
  return <ApiCenter client={api} scope={scope} specUrl={path('/openapi.json')} referenceUrl={`${base}/admin/reference`} description="CookieCloud 兼容接口与后台管理接口。" documentationNote="文档调试只请求当前应用。后台接口使用当前会话，不提供 API Token 签发。写请求会修改真实数据。" />;
}
function Console() {
  const [page, setPage] = useState(readPage), [session, setSession] = useState<{ username: string } | null>(), [error, setError] = useState('');
  useEffect(() => { const changed = () => setPage(readPage()); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { const controller = new AbortController(); auth<{ username: string }>(path('/auth/session'), { signal: controller.signal }).then(setSession).catch((e) => { if (isRequestCancelled(e)) return; if (e.status === 401) setSession(null); else setError(e.message); }); return () => controller.abort(); }, []);
  useEffect(() => scope.subscribe(({ reason }) => { if (reason === 'expired') setSession(null); }), []);
  if (error) return <div className="cf-loading"><Alert type="error" title={error} action={<Button onClick={() => location.reload()}>重试</Button>} /></div>;
  if (session === undefined) return <div className="cf-loading"><Spin size="large" /></div>;
  if (!session) return <LoginPage title="Cookieflare" onLogin={async (values, signal) => { const data = await auth<{ username: string }>(path('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal }); scope.reset('signed-in'); setSession(data); }} />;
  return <AdminShell title="Cookieflare" brandIcon={<img width={30} height={30} src={`${base}/admin-assets/favicon.svg`} alt="" />} activeKey={page} onNavigate={(key) => { location.hash = key; }} pageTitleInHeader username={session.username} items={[
    { key: 'datasets', label: '数据集', icon: <DatabaseOutlined /> }, { key: 'runtime', label: '运行状态', icon: <CloudServerOutlined /> }, { key: 'configuration', label: '服务配置', icon: <SettingOutlined /> },
  ]} userMenuItems={[{ key: 'account', label: '当前账户', icon: <UserOutlined /> }, { key: 'api', label: 'API 中心', icon: <ApiOutlined /> }]} onLogout={async () => { await api(path('/auth/logout'), { method: 'POST' }); scope.reset('signed-out'); setSession(null); }}>
    <AppErrorBoundary key={`${scope.version}:${page}`} scope="page">{page === 'datasets' ? <Datasets /> : page === 'runtime' ? <RuntimeStatus client={api} statusUrl={path('/runtime')} metricsUrl={path('/runtime/metrics')} /> : page === 'configuration' ? <Configuration /> : page === 'api' ? <ApiDocs /> : page === 'account' ? <Card title="当前账户"><Descriptions column={1} items={[{ key: 'username', label: '用户名', children: session.username }, { key: 'role', label: '角色', children: '管理员' }, { key: 'session', label: '会话', children: '12 小时有效，使用 HttpOnly Cookie；注销会删除服务端会话。' }]} /></Card> : <Alert type="warning" title="页面不存在" action={<Button onClick={() => { location.hash = 'datasets'; }}>返回数据集</Button>} />}</AppErrorBoundary>
  </AdminShell>;
}
createRoot(document.getElementById('root')!).render(<AppErrorBoundary scope="application"><WorkerKitProvider><Console /></WorkerKitProvider></AppErrorBoundary>);
