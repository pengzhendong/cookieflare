import { WorkerKitConsoleLayout } from '../vendor/worker-kit/src/web/console-layout';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, App, Button, Card, Flex, Result, Skeleton } from 'antd';
import { ApiOutlined, DatabaseOutlined, LineChartOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { AppErrorBoundary, LoginPage, WorkerKitProvider } from '@pengzhendong/worker-kit/web';
import { ApiClientError, api, auth, base, isRequestCancelled, path, scope, type Session } from './api';
import { Account, ApiCenter, Configuration, Datasets, Runtime } from './pages';
import '../vendor/worker-kit/src/web/styles.css';
import './style.css';

const logo = `${base}/admin-assets/cookieflare-icon.svg`;
const navigation = [
  { path: '/datasets', name: '数据集', icon: <DatabaseOutlined aria-hidden /> },
  { path: '/configuration', name: '服务配置', icon: <SettingOutlined aria-hidden /> },
  { path: '/runtime', name: '运行状态', icon: <LineChartOutlined aria-hidden /> },
];
const account = [
  { key: '/account', label: '当前账户', icon: <UserOutlined /> },
  { key: '/api', label: 'API 中心', icon: <ApiOutlined /> },
  { key: 'logout', label: '退出登录', danger: true },
];

function currentPage() {
  const hash = location.hash.slice(1);
  return !hash || hash === '/' ? '/datasets' : '/' + hash.replace(/^\//, '');
}

function Console() {
  const { message } = App.useApp();
  const [page, setPage] = useState(currentPage);
  const [session, setSession] = useState<Session | null>();
  const [revision, setRevision] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const sync = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', sync);
    const unsubscribe = scope.subscribe(event => {
      if (event.reason === 'expired' || event.reason === 'signed-out') {
        setSession(null);

      }
    });
    return () => { unsubscribe(); window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => {
    const request = new AbortController();
    setSessionError('');
    auth<Session>(path('/auth/session'), { signal: request.signal })
      .then(value => { if (!request.signal.aborted) setSession(value); })
      .catch(error => {
        if (request.signal.aborted || isRequestCancelled(error)) return;
        if (error instanceof ApiClientError && error.status === 401) setSession(null);
        else setSessionError(error instanceof Error ? error.message : '无法读取会话，请重试');
      });
    return () => request.abort();
  }, [revision]);

  const title = navigation.find(item => item.path === page)?.name ?? account.find(item => item.key === page)?.label ?? '页面不存在';
  useEffect(() => { document.title = session ? `${title} · Cookieflare` : 'Cookieflare'; }, [session, title]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await api(path('/auth/logout'), { method: 'POST' }); scope.reset('signed-out'); }
    catch (error) { if (!isRequestCancelled(error)) void message.error(error instanceof Error ? error.message : '退出失败，请重试'); }
    finally { setSigningOut(false); }
  }

  if (sessionError) return <main className="cookieflare-session"><Alert type="error" title="无法读取会话" description={sessionError}
    action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /></main>;
  if (session === undefined) return <main className="cookieflare-session"><Card style={{ width: 'min(100%, 420px)' }}><Skeleton active paragraph={{ rows: 3 }} /></Card></main>;
  if (!session) return <LoginPage title="Cookieflare" logo={<img src={logo} width={40} height={40} alt="" />}
    description="登录同步服务管理后台。"
    onLogin={async (values, signal) => {
      const value = await auth<Session>(path('/auth/login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal,
      });
      scope.reset('signed-in');
      setSession(value);
    }} />;


  return <WorkerKitConsoleLayout name="Cookieflare" logo={<img src={logo} width={32} height={32} alt="" />}
    pageTitle={title} activeKey={page.slice(1)} sidebarStorageKey="cookieflare.sidebar"
    items={navigation.map(item => ({ key: item.path.slice(1), label: item.name, icon: item.icon }))}
    username={session.username} accountItems={account} signingOut={signingOut}
    onAccountAction={key => { if (key === 'logout') void signOut(); else location.hash = key; }}
  >
      <AppErrorBoundary key={page}>
      <Flex vertical gap={12}>
        {page === '/datasets' ? <Datasets /> : page === '/configuration' ? <Configuration /> :
          page === '/runtime' ? <Runtime /> : page === '/account' ? <Account username={session.username} /> :
          page === '/api' ? <ApiCenter /> : <Result status="404" title="找不到此页面" />}
      </Flex>
    </AppErrorBoundary>
  </WorkerKitConsoleLayout>;
}

createRoot(document.getElementById('root')!).render(
  <WorkerKitProvider storageKey="cookieflare.theme"><AppErrorBoundary scope="application"><Console /></AppErrorBoundary></WorkerKitProvider>,
);
