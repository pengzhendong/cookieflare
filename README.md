# Cookieflare

Cookieflare 是一个兼容 [CookieCloud](https://github.com/easychen/CookieCloud) 协议的 Cloudflare Worker：用 KV 保存 CookieCloud 客户端上传的**加密字符串**，Worker 本身不会解密，也不会记录 cookie 内容。

官方客户端目前会以 gzip 压缩的 JSON 调用 `POST /update`，本项目同时兼容 gzip JSON、普通 JSON 和 `application/x-www-form-urlencoded`；`GET /get/:uuid` 与 `POST /get/:uuid` 都返回加密数据。

## 部署

先安装依赖：

```bash
npm install
```

创建一个 KV namespace：

```bash
npx wrangler kv namespace create COOKIE_STORE
```

把命令输出的 namespace ID 替换到 `wrangler.jsonc` 中 `COOKIE_STORE` 的 `id`。当前的全零 ID 只是本地开发/配置占位符，不要直接用它部署。

把 CookieCloud 客户端里的 UUID 作为 Worker secret：

```bash
npx wrangler secret put COOKIECLOUD_UUID
```

可选地再设置上传 token：

```bash
npx wrangler secret put COOKIECLOUD_UPDATE_TOKEN
```

最后部署：

```bash
npm run deploy
```

在 CookieCloud 客户端里填写：

- 服务端地址：Worker 部署后的根地址，例如 `https://cookieflare.<account>.workers.dev`
- UUID：与 `COOKIECLOUD_UUID` 完全一致
- 密码：继续使用 CookieCloud 客户端自己的密码；它只在客户端参与加解密，Worker 不需要知道

如果设置了 `COOKIECLOUD_UPDATE_TOKEN`，在客户端的自定义请求头中添加：

```text
X-CookieCloud-Token: 与 secret 完全一致的值
```

官方扩展支持自定义上传请求头；下载不需要这个 token。

## 本地运行和测试

复制 `.dev.vars.example` 为 `.dev.vars`，填入测试 UUID，然后：

```bash
npm run dev
```

项目自带测试覆盖官方 gzip 上传格式、普通表单上传、下载、UUID 校验、可选上传 token、CORS 预检。完整校验命令：

```bash
npm run verify
```

`npm run verify` 会生成 Wrangler 运行时类型、执行 TypeScript 检查、执行部署 dry-run 和 Vitest 测试；不会创建远程 Cloudflare 资源。

## 设计取舍

- KV 的 value 是 `{ encrypted, crypto_type }`，不保存明文 cookie。
- `COOKIECLOUD_UUID` 是第一层访问凭据；生产环境应使用足够随机、只用于这个服务的 UUID。
- `COOKIECLOUD_UPDATE_TOKEN` 用来防止拿到 UUID 的请求覆盖上传内容，默认不启用以保持原生 CookieCloud 客户端兼容。
- 下载接口会始终返回加密内容，即使请求带了 `password`；这是为了让密码永远不进入 Worker。
- KV 适合这种低频写入、频繁读取的小型同步数据，但跨区域读取存在最终一致性延迟。刚上传后短时间内在另一处读取到旧值是正常的。

如果要挂在域名的二级路径下，可以修改 `wrangler.jsonc` 的 `API_ROOT`，再执行 `npm run types` 后部署；Cloudflare 的 route 也需要把该路径交给此 Worker。

## License

Cookieflare is released under the GNU General Public License v3.0. See [LICENSE](./LICENSE).

Cookieflare is an independent implementation and is not an official CookieCloud project.
