import { createRoot } from 'react-dom/client';
import { AppErrorBoundary, WorkerKitProvider } from '@pengzhendong/worker-kit/web';
import { ScalarReference } from '@pengzhendong/worker-kit/web/scalar-reference';
import '@pengzhendong/worker-kit/web/styles.css';

const base = document.body.dataset.apiRoot || '';
createRoot(document.getElementById('root')!).render(<AppErrorBoundary scope="application"><WorkerKitProvider><ScalarReference specUrl={`${base}/admin/api/openapi.json`} /></WorkerKitProvider></AppErrorBoundary>);
