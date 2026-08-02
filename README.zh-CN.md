# Cookieflare

[English](README.md) · [简体中文](README.zh-CN.md)

Cookieflare 是一个运行在 [Cloudflare Workers](https://workers.cloudflare.com/) 和 KV 上的轻量级、无服务器 [CookieCloud](https://github.com/easychen/CookieCloud) 兼容服务端。

它只保存 CookieCloud 上传的加密数据，不解密 Cookie，也不需要 CookieCloud 密码。Cookieflare 是独立实现，并非 CookieCloud 官方项目。

## 特性

- 不需要 NAS、VPS 或长期运行的电脑
- 兼容 CookieCloud 的上传和下载接口
- 支持官方客户端使用的 gzip 上传格式
- 可选上传 Token，避免数据被意外覆盖
- 使用 Cloudflare KV 保存轻量级、低频同步数据

## 快速部署

安装依赖并创建 KV namespace：

```bash
npm install
npx wrangler kv namespace create COOKIE_STORE
```

把命令返回的 namespace ID 填入 `wrangler.jsonc`，替换其中的占位 ID；然后设置 CookieCloud 客户端使用的 UUID：

```bash
npx wrangler secret put COOKIECLOUD_UUID
```

也可以额外设置上传 Token：

```bash
npx wrangler secret put COOKIECLOUD_UPDATE_TOKEN
```

部署：

```bash
npm run deploy
```

## CookieCloud 客户端配置

将部署后的 Worker 地址填写为服务端地址：

| 配置项 | 内容 |
| --- | --- |
| 服务端地址 | `https://cookieflare.<account>.workers.dev` |
| UUID | 与 `COOKIECLOUD_UUID` 完全一致 |
| 密码 | 继续使用 CookieCloud 客户端自己的密码 |

密码始终留在客户端。如果设置了 `COOKIECLOUD_UPDATE_TOKEN`，在扩展的自定义上传请求头中添加：

```text
X-CookieCloud-Token: <你的 Token>
```

Token 只用于上传，下载不需要。

## API

| 接口 | 作用 |
| --- | --- |
| `POST /update` | 保存加密后的 CookieCloud 数据 |
| `GET /get/:uuid` | 获取加密数据 |
| `POST /get/:uuid` | 兼容 CookieCloud 的下载方式 |
| `GET /health` | 健康检查 |

下载接口始终返回加密数据，即使请求带有密码，也不会在 Worker 端解密，从而保证解密过程留在客户端。

## 本地开发

复制 `.dev.vars.example` 为 `.dev.vars`，填入测试 UUID，然后启动本地 Worker：

```bash
npm run dev
```

运行完整校验：

```bash
npm run verify
```

该命令会生成类型、执行 TypeScript 检查、部署 dry-run 和测试，不会创建远程 Cloudflare 资源。

## 许可证

Cookieflare 使用 [GNU General Public License v3.0](LICENSE) 发布。
