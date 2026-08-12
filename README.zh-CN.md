<div align="center">

# Cookieflare

**在自己的 Cloudflare 账号中运行一个轻量的 CookieCloud 兼容同步服务。**

开源 · 自托管 · 只保存加密数据

[English](README.md) · [快速部署](#快速部署) · [安全边界](#安全边界) · [接口](#接口)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![CookieCloud compatible](https://img.shields.io/badge/CookieCloud-Compatible-5B8DEF)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue)

</div>

Cookieflare 是 [CookieCloud](https://github.com/easychen/CookieCloud) 上传与下载接口的独立、无服务器实现。它运行在 Cloudflare Workers 上，并将每个客户端的加密数据保存到 Cloudflare KV，不需要 NAS、VPS 或常开电脑。

> [!IMPORTANT]
> Cookieflare 不会收到 CookieCloud 的加密密码，也无法解密 Cookie。后台密码只保护运维页面，并不保护 `/get/:uuid`。请使用高强度且不与其他服务共用的 CookieCloud 密码，并保管好 UUID。

## 为什么选择 Cookieflare

| | 能力 |
| --- | --- |
| **无需维护服务器** | Workers 处理请求，KV 保存最新的加密数据。 |
| **兼容现有客户端** | 提供 CookieCloud 上传和下载接口，并支持 gzip 上传。 |
| **不接触明文** | 只保存 `encrypted`、`crypto_type` 和内部更新时间。 |
| **数据相互隔离** | 每个 CookieCloud UUID 对应一份独立的逻辑数据。 |
| **基础滥用防护** | 按 UUID 和客户端 IP 限制上传频率。 |
| **轻量运维页面** | `/admin` 只显示服务汇总状态，不展示 Cookie 数据。 |

## 工作方式

1. CookieCloud 在客户端使用配置的密码加密 Cookie。
2. 客户端将密文和 UUID 上传到 Cookieflare。
3. Cookieflare 校验请求，并按 UUID 保存这份不可读的密文。
4. 其他客户端下载密文，再使用相同密码在本地解密。

相同 UUID 的后一次上传会覆盖前一次数据，不同 UUID 之间互不影响。

## 快速部署

### 环境要求

- Node.js 22 或更高版本
- 具备 Workers 和 KV 权限的 Cloudflare 账号
- 仅在使用自定义域名时需要将域名托管到 Cloudflare

### 1. 安装并登录

```bash
git clone https://github.com/pengzhendong/cookieflare.git
cd cookieflare
npm ci
npx wrangler login
```

### 2. 创建 KV namespace

```bash
npx wrangler kv namespace create COOKIE_STORE
```

将返回的 namespace ID 填入 `wrangler.jsonc` 的 `kv_namespaces`，替换其中的全零占位 ID。

仓库配置还包含两组上传限流：每个 UUID 每分钟 10 次、每个客户端 IP 每分钟 30 次。它们的 `namespace_id` 必须在你的 Cloudflare 账号中唯一；如果已有同号配置，请自行更换。

### 3. 保护运维页面

```bash
npx wrangler secret put ADMIN_PASSWORD
```

用户名固定为 `admin`。该 secret 只用于 `/admin`；即使不设置，CookieCloud API 仍可工作。

### 4. 校验并部署

```bash
npm run verify
npm run deploy
```

部署完成后，Wrangler 会输出一个 `workers.dev` 地址。访问 `/health` 即可确认 Worker 是否正常响应。

### 5. 连接 CookieCloud

| 客户端配置 | 填写内容 |
| --- | --- |
| 服务器地址 | Worker 的基础地址，不要附加 `/update` 或 `/get` |
| UUID | 客户端生成且不易猜测的 UUID |
| 密码 | 高强度且不与其他服务共用的 CookieCloud 加密密码 |

需要共享同一份 Cookie 的设备，应填写相同的 UUID 和密码。新服务端配置完成后，先上传一次，再在其他设备下载。

## 可选配置

### 避免把生产配置提交到 Git

可以将 `wrangler.jsonc` 复制为已被忽略的 `wrangler.production.jsonc`，在其中填写真实 KV ID 和可选的自定义域名，然后执行：

```bash
npx wrangler secret put ADMIN_PASSWORD --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

自定义域名示例：

```jsonc
"routes": [
  { "pattern": "cookies.example.com", "custom_domain": true }
]
```

具体要求参见 Cloudflare 的 [Custom Domains 文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

### 启用上传 Token

自定义客户端可以发送以下任意一种请求头：

```text
X-CookieCloud-Token: <token>
Authorization: Bearer <token>
```

使用下面的命令启用校验：

```bash
npx wrangler secret put COOKIECLOUD_UPDATE_TOKEN
```

> [!WARNING]
> 标准 CookieCloud 客户端通常不能添加该请求头。使用标准客户端时请不要设置这个 secret，否则所有上传都会被拒绝。Token 只保护上传，下载接口仍保持 CookieCloud 兼容。

### 使用路径前缀

将 `API_ROOT` 设为 `/sync` 一类的路径后，接口会对应变为 `/sync/update`、`/sync/get/:uuid`、`/sync/admin` 等。

## 安全边界

- 加密和解密都在 CookieCloud 客户端完成，Worker 不参与解密。
- KV 只保存加密数据、加密类型和内部更新时间。
- Worker 错误日志只记录事件名称，不记录 Cookie 数据或密码。
- 知道服务地址和 UUID 的人可以下载密文，因此客户端密码才是主要的机密性边界。
- `ADMIN_PASSWORD` 只保护只读运维页面及其状态接口。
- 启用 `COOKIECLOUD_UPDATE_TOKEN` 后可以防止未授权覆盖，但它不保护下载。
- Cloudflare KV 是最终一致性存储，新上传的数据在其他地区可见前可能存在短暂延迟。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/update` | 保存 CookieCloud 加密数据 |
| `GET` / `POST` | `/get/:uuid` | 返回对应 UUID 的加密数据 |
| `GET` | `/health` | 检查 Worker 是否正常响应 |
| `GET` | `/admin` | 打开由 Basic Auth 保护的运维页面 |
| `GET` | `/admin/status` | 返回运维页面使用的汇总状态 |

上传支持 JSON、URL 编码表单、multipart 表单和 gzip 压缩请求体，当前数据上限为 8 MiB。

## 运维与开发

使用 `.dev.vars` 中的本地 secret 启动开发服务：

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

生成类型、执行 TypeScript 检查、部署预检和测试：

```bash
npm run verify
```

实时查看生产日志：

```bash
npx wrangler tail
```

忘记后台密码时，重新执行 `wrangler secret put ADMIN_PASSWORD` 即可覆盖旧密码。运维页面不会列出 UUID，也不会展示加密数据。

## 致谢

Cookieflare 兼容 [easychen/CookieCloud](https://github.com/easychen/CookieCloud) 建立的客户端协议。它是独立实现，与原项目没有隶属关系。

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE) 发布。
