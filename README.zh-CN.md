# Cookieflare

[English](README.md) · [简体中文](README.zh-CN.md)

Cookieflare 是一个运行在 [Cloudflare Workers](https://workers.cloudflare.com/) 和 KV 上的轻量级、无服务器 [CookieCloud](https://github.com/easychen/CookieCloud) 兼容服务端。

它只保存 CookieCloud 上传的加密数据，不解密 Cookie，也不需要 CookieCloud 密码。Cookieflare 是独立实现，并非 CookieCloud 官方项目。

## 特性

- 不需要 NAS、VPS 或长期运行的电脑
- 兼容 CookieCloud 的上传和下载接口
- 支持 CookieCloud 使用的 gzip 上传格式
- 可为自定义客户端启用上传 Token
- 使用 Cloudflare KV 保存轻量级、低频同步数据

## 部署

### 环境要求

- Node.js 20 或更高版本
- 具备 Workers 和 KV 权限的 Cloudflare 账号
- 只有使用自定义域名时才需要将域名托管在 Cloudflare

### 1. 安装依赖并登录

```bash
npm ci
npx wrangler login
```

### 2. 创建 KV namespace

```bash
npx wrangler kv namespace create COOKIE_STORE
```

将命令返回的 namespace ID 填入 `wrangler.jsonc`，替换其中的全零占位 ID。仓库中的配置不包含账号专属的 KV ID 或域名。

### 3. 设置 CookieCloud UUID

该值必须与 CookieCloud 客户端中配置的 Key/UUID 完全一致：

```bash
npx wrangler secret put COOKIECLOUD_UUID
```

`COOKIECLOUD_UPDATE_TOKEN` 是可选项，仅适用于能够发送 `X-CookieCloud-Token` 或 Bearer Token 的自定义客户端。标准 CookieCloud 客户端通常无法添加自定义上传请求头，使用标准客户端时不要设置它。

### 4. 部署

```bash
npm run verify
npm run deploy
```

不配置路由时，Wrangler 会在部署输出中提供 `workers.dev` 地址。如果要使用自己的域名，可以添加类似下面的 Custom Domain 配置：

```jsonc
"routes": [
  { "pattern": "api.example.com", "custom_domain": true }
]
```

然后重新部署。具体要求参见 Cloudflare 的 [Custom Domains 文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

个人生产配置、域名和账号专属 ID 不要提交到 Git。本仓库已经忽略 `wrangler.production.jsonc`，可以用它保存本机生产配置。

## CookieCloud 客户端配置

将部署后的域名填写为服务端地址：

| 配置项 | 内容 |
| --- | --- |
| 服务端地址 | `https://<你的-worker-subdomain>.workers.dev` 或你的自定义域名 |
| UUID | 与 `COOKIECLOUD_UUID` 完全一致 |
| 密码 | 继续使用 CookieCloud 客户端自己的密码 |

填写基础地址即可，客户端会自行调用 `/update` 和 `/get/:uuid`。密码始终留在客户端。更换服务端地址后，先手动上传一次，再尝试下载。

## 存储与隐私

Cookieflare 只把加密后的 CookieCloud 数据和 `crypto_type` 保存到 KV，不解密、不读取，也不记录 Cookie 内容或密码。

KV 是最终一致性存储，新上传的数据在其他地区可见前可能有短暂延迟。本项目适合个人、低频同步，多个客户端同时上传时以最后一次成功上传为准。

## API

| 接口 | 作用 |
| --- | --- |
| `POST /update` | 保存加密后的 CookieCloud 数据 |
| `GET /get/:uuid` | 获取加密数据 |
| `POST /get/:uuid` | 兼容 CookieCloud 的下载方式 |
| `GET /health` | 健康检查 |

下载接口始终返回加密数据，即使请求带有密码，也不会在 Worker 端解密，解密过程留在客户端。

## 运维与查看

项目本身没有应用级后台。可以在 Cloudflare 控制台查看 Worker 的请求、错误和 Observability 日志，也可以用下面的命令实时查看日志：

```bash
npx wrangler tail
```

KV 中保存的是加密数据，不建议通过公开后台展示。

## 本地开发

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

运行完整校验：

```bash
npm run verify
```

该命令会生成 Worker 类型、执行 TypeScript 检查、部署 dry-run 和测试，不会真正部署 Worker。

## 许可证

Cookieflare 使用 [GNU General Public License v3.0](LICENSE) 发布。
