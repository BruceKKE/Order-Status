# 部署与运维手册

## 必需配置

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `FEISHU_APP_ID` | Secret | 飞书自建应用 ID |
| `FEISHU_APP_SECRET` | Secret | 飞书自建应用 Secret |
| `FEISHU_BASE_TOKEN` | Secret | 飞书 Base URL 中 `/base/` 后、`?` 前的 token |
| `DASHBOARD_PASSWORD` | Secret | 唯一强密码，至少 12 位 |
| `SESSION_SECRET` | Secret | 随机生成的会话 HMAC 密钥 |
| `CACHE_SECONDS` | Plaintext | 服务端缓存秒数，当前为 60 |

不要把 Secret 写入 `.env`、源码、GitHub Actions 输出或静态文件。

## 部署

```powershell
cd D:\Order-Status
npm install
npm run check
npm run deploy
```

修改 Secret 使用 Cloudflare 控制台或 `npx wrangler secret put <NAME>`。修改 `wrangler.jsonc` 后重新部署会覆盖对应远端明文变量，但会保留 Worker Secret。

## 冒烟检查

```powershell
$siteRoot = 'https://order-status-live.goldlikeke.workers.dev'
curl.exe -I $siteRoot
curl.exe -i "$siteRoot/api/session"
curl.exe -i "$siteRoot/api/order-status"
curl.exe -i -H "cf-access-jwt-assertion: fake" "$siteRoot/api/order-status"
```

预期：主页 200；未登录 session 返回 `authenticated: false`；后两个订单 API 请求均返回 401。随后在浏览器登录，确认页面显示更新时间、订单/供应商订单/CI 数量且无错误提示。

## 常见故障

- 飞书错误 `10003`：App ID 与 App Secret 不匹配，重新从同一应用复制。
- 飞书返回非 JSON：`FEISHU_BASE_TOKEN` 填成了完整 URL 或包含查询参数；只保留 token。
- 登录接口 503：`DASHBOARD_PASSWORD` 少于 12 位，或 `SESSION_SECRET` 缺失。
- 页面登录后 502：查看 Worker Observability 日志，优先检查飞书应用权限、Base token 和表 ID。

## 费用边界

当前使用 Cloudflare Workers 免费额度，不启用需要绑卡并授权超额扣费的 Zero Trust 结算。应定期查看 Workers 用量；若业务规模接近免费额度，先暂停自动刷新或提高缓存时间，再决定是否升级。
