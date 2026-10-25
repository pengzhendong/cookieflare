import type { OpenAPIV3_1 as O } from 'openapi-types';
import { runtimeMetricsSchema, runtimeSnapshotSchema } from '@pengzhendong/worker-kit/contracts';

const string = { type: 'string' as const }, boolean = { type: 'boolean' as const };
const object = (properties: Record<string, O.SchemaObject>, required = Object.keys(properties)): O.SchemaObject => ({ type: 'object', properties, required });
const nullable = (schema: O.SchemaObject): O.SchemaObject => ({ anyOf: [schema, { type: 'null' }] });
const content = (schema: O.SchemaObject) => ({ 'application/json': { schema } });
const result = (schema: O.SchemaObject): O.ResponseObject => ({ description: '成功', content: content(schema) });
const text: O.ResponseObject = { description: '文本响应', content: { 'text/plain': { schema: string } } };
const error = object({ error: object({ code: string, message: string }) });
const errors = (codes: number[]) => Object.fromEntries(codes.map((code) => [code, { description: ({ 400: '参数无效或请求过大', 401: '未登录或会话失效', 403: '请求来源不符', 404: '不存在', 429: '请求过于频繁', 500: '存储服务异常', 503: '认证未配置' } as Record<number, string>)[code] ?? '请求失败', content: content(error) }]));
const uuid: O.ParameterObject = { name: 'uuid', in: 'path', required: true, description: '客户端 UUID；应视作访问密文的凭据，避免公开。', schema: { type: 'string', minLength: 1, maxLength: 128 } };
const body = (schema: O.SchemaObject): O.RequestBodyObject => ({ required: true, content: content(schema) });

/** Native Worker uses an application-owned OpenAPI document; no router or auth replacement. */
export function cookieflareOpenApi(root: string, uploadTokenConfigured: boolean): O.Document {
  // openapi-types 12 intersects PathItem methods with obsolete OpenAPI 3.0 types.
  // Keep operations checked as 3.1 and bridge only that library declaration boundary.
  const paths: Record<string, Partial<Record<'get' | 'post' | 'delete', O.OperationObject>>> = {};
  const add = (path: string, method: 'get' | 'post' | 'delete', operation: O.OperationObject & { 'x-authentication-label'?: string }) => {
    const target = `${root}${path}`;
    paths[target] ??= {};
    paths[target]![method] = operation;
  };
  const admin = (id: string, summary: string, schema: O.SchemaObject, extra: Partial<O.OperationObject> = {}): O.OperationObject => ({ operationId: id, summary, tags: ['后台管理'], security: [{ adminSession: [] }], responses: { 200: result(schema), ...errors([401, 500, 503]) }, ...extra });
  const username = object({ username: string });
  const ciphertext = object({ encrypted: { ...string, description: '客户端加密内容；服务端不会解密。' }, crypto_type: string });
  add('/', 'get', { operationId: 'service', summary: '服务入口', tags: ['服务'], security: [], responses: { 200: text } });
  add('/health', 'get', { operationId: 'health', summary: '服务存活检查', tags: ['服务'], security: [], description: '只返回服务标识，不会读取 KV。检查存储连接请使用后台运行状态接口。', responses: { 200: result(object({ status: { const: 'OK', type: 'string' }, storage: { const: 'cloudflare-kv', type: 'string' } })) } });
  const upload = object({ uuid: { ...string, minLength: 1, maxLength: 128 }, encrypted: { ...string, minLength: 1, maxLength: 8388608, description: '客户端生成的密文，不要填写明文 Cookie。' }, crypto_type: { ...string, maxLength: 64, default: 'legacy' } }, ['uuid', 'encrypted']);
  add('/update', 'post', { operationId: 'upload', summary: '上传加密快照', tags: ['CookieCloud'], description: '覆盖同 UUID 的快照。支持 JSON、表单和 gzip 请求体；压缩前后请求均最多 8 MiB。上传令牌仅保护写入，不能访问后台或解密数据。', security: uploadTokenConfigured ? [{ uploadHeader: [] }, { uploadBearer: [] }] : [], requestBody: { required: true, content: { ...content(upload), 'application/x-www-form-urlencoded': { schema: upload }, 'multipart/form-data': { schema: upload } } }, responses: { 200: result(object({ action: { type: 'string', const: 'done' } })), 400: text, 404: { ...text, description: '上传令牌无效时也返回 404' }, 413: text, 429: { description: 'UUID 或 IP 上传限流', content: content(object({ action: string, message: string })) }, 500: text } });
  for (const method of ['get', 'post'] as const) add('/get/{uuid}', method, { operationId: `download-${method}`, summary: `${method.toUpperCase()} 下载加密快照`, tags: ['CookieCloud'], security: [], 'x-authentication-label': 'UUID（密文读取）', description: '知道 UUID 即可获取密文；解密密码仅由客户端保存。POST 与 GET 行为一致，不读取请求体。', parameters: [uuid], responses: { 200: result(ciphertext), 404: text, 500: text } });
  add('/admin/status', 'get', { operationId: 'legacy-status', summary: '兼容旧版管理状态', tags: ['后台管理'], security: [{ basicAdmin: [] }], description: '使用已有 admin 管理密码的 HTTP Basic Auth。Cookie 会话不适用于此旧接口。可能遍历 KV 列表，常规监控建议用运行状态。', responses: { 200: result(object({ status: string, storage: string, api_mode: string, authenticated_as: string, stored_uuids: object({ count: { type: 'integer' }, list_complete: boolean }) })), 401: text, 503: text, 500: result(object({ status: string, message: string })) } });
  add('/admin/api/auth/login', 'post', { operationId: 'login', summary: '管理员登录', tags: ['后台管理'], security: [], description: '要求同源 Origin；每个来源 IP 每分钟最多 5 次。成功后设置 HttpOnly 会话 Cookie，12 小时有效；不签发 API Token。', requestBody: body(object({ username: { type: 'string', const: 'admin' }, password: { type: 'string', format: 'password' } })), responses: { 200: { ...result(username), headers: { 'Set-Cookie': { description: 'HttpOnly、SameSite=Strict，HTTPS 下为 Secure。', schema: string } } }, ...errors([400, 401, 403, 429, 503]) } });
  add('/admin/api/auth/logout', 'post', { operationId: 'logout', summary: '退出当前会话', tags: ['后台管理'], security: [{ adminSession: [] }], description: '同源 Origin 必需。幂等删除当前会话并清除 Cookie；没有会话时也可退出。', responses: { 200: result(object({ ok: boolean })), ...errors([403, 500, 503]) } });
  add('/admin/api/auth/session', 'get', admin('session', '查看当前账户', username));
  const dataset = object({ uuid: string, updatedAt: nullable({ type: 'string' }), encryptedBytes: nullable({ type: 'integer', minimum: 0 }), cryptoType: nullable(string), status: { type: 'string', enum: ['stored', 'invalid'] } });
  add('/admin/api/datasets', 'get', admin('datasets', '分页读取数据集元数据', object({ items: { type: 'array', maxItems: 10, items: dataset }, cursor: nullable(string), complete: boolean }), { description: '每页最多 10 条，不返回密文或解密密码。KV 列表存在短暂同步延迟。', parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 }, description: '使用上一页原样返回的 cursor；第一页不传。' }], responses: { 200: result(object({ items: { type: 'array', maxItems: 10, items: dataset }, cursor: nullable(string), complete: boolean })), ...errors([400, 401, 500, 503]) } }));
  add('/admin/api/datasets/{uuid}', 'delete', admin('delete-dataset', '删除加密快照', object({ deleted: boolean }), { description: '不可撤销。要求同源 Origin，且请求体 confirmUuid 必须等于路径 UUID。', parameters: [uuid], requestBody: body(object({ confirmUuid: string })), responses: { 200: result(object({ deleted: boolean })), ...errors([400, 401, 403, 500, 503]) } }));
  add('/admin/api/runtime', 'get', admin('runtime', '查看运行状态与 KV 连接', runtimeSnapshotSchema));
  add('/admin/api/runtime/metrics', 'get', admin('metrics', '查看运行指标接入状态', runtimeMetricsSchema, { description: '当前未接入 Cloudflare 指标凭据，返回 not-configured 和空指标，不把未采集误报为零。' }));
  add('/admin/api/configuration', 'get', admin('configuration', '查看服务配置', object({ apiRoot: string, storage: string, uploadTokenConfigured: boolean, uuidRateLimitConfigured: boolean, ipRateLimitConfigured: boolean, loginRateLimitConfigured: boolean, sessionHours: { type: 'integer' }, encryption: string }), { description: '只返回配置状态，不返回任何密码或令牌值。' }));
  add('/admin/api/openapi.json', 'get', admin('openapi', '读取 OpenAPI 文档', { type: 'object', description: 'OpenAPI 3.1 文档。' }));
  return { openapi: '3.1.0', info: { title: 'Cookieflare API', version: '0.1.0', description: 'CookieCloud 兼容协议与管理 API。管理接口使用现有 Cookie 会话；不提供 API Token 签发。' }, servers: [{ url: '/' }], tags: [{ name: '服务' }, { name: 'CookieCloud' }, { name: '后台管理' }], paths: paths as O.PathsObject, components: { securitySchemes: { adminSession: { type: 'apiKey', in: 'cookie', name: 'cookieflare_admin' }, basicAdmin: { type: 'http', scheme: 'basic' }, uploadHeader: { type: 'apiKey', in: 'header', name: 'X-CookieCloud-Token', description: '既有可选上传凭据，不是后台访问令牌。' }, uploadBearer: { type: 'http', scheme: 'bearer', description: '既有可选上传凭据的另一种传法。' } } } };
}
