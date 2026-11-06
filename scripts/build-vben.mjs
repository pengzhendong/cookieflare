import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { vbenWorkDirectory } from '../vendor/worker-kit/examples/vben-dashboard/paths.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const iconSets = [['lucide', ['database', 'activity', 'settings-2', 'braces', 'user-round']], ['ep', ['fold', 'expand']], ['mdi', ['keyboard-esc']]];
const icons = [];
for (const [name, names] of iconSets) {
  const collection = JSON.parse(await readFile(path.join(root, `node_modules/@iconify-json/${name}/icons.json`), 'utf8'));
  const selected = Object.fromEntries(names.map(name => {
    const icon = collection.icons[name];
    if (!icon?.body) throw new Error(`Missing bundled Vben icon: ${collection.prefix}:${name}`);
    return [name, icon];
  }));
  icons.push({ prefix: collection.prefix, width: collection.width, height: collection.height, icons: selected });
}
await mkdir(path.join(root, '.wrangler'), { recursive: true });
await writeFile(path.join(root, '.wrangler/vben-icons.ts'), `import type { addCollection } from '@iconify/vue';\nconst icons: Parameters<typeof addCollection>[0][] = ${JSON.stringify(icons)};\nexport default icons;\n`);
const env = { ...process.env, COOKIEFLARE_ROOT: root, WORKERKIT_VBEN_APP: path.join(root, 'frontend-vben') };
async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
if (process.argv.includes('--check')) {
  const app = path.join(vbenWorkDirectory, 'apps/workerkit-demo');
  const config = path.join(app, 'tsconfig.cookieflare.json');
  await writeFile(config, JSON.stringify({ extends: './tsconfig.json', compilerOptions: { paths: {
    'vue': [path.join(app, 'node_modules/vue')],
    'vue-router': [path.join(app, 'node_modules/vue-router')],
    '@cookieflare/api': [path.join(root, 'frontend/api.ts')],
    '@cookieflare/openapi': [path.join(root, 'frontend/openapi.ts')],
    '@cookieflare/icons': [path.join(root, '.wrangler/vben-icons.ts')],
  } } }, null, 2));
  await run(path.join(root, 'node_modules/.bin/vue-tsc'), ['-p', config, '--noEmit']);
} else {
  const args = ['vendor/worker-kit/examples/vben-dashboard/setup.mjs'];
  if (!process.argv.includes('--setup')) args.push('--build');
  await run(process.execPath, args);
}
