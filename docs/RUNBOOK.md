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

发布顺序固定为：本地检查 → Worker 部署 → 线上冒烟 → Git 提交/推送。不要在测试失败时部署或推送。

修改浏览器 DTO 字段时，必须同步升级 `src/index.js` 的 `DASHBOARD_CACHE_VERSION`，防止新前端命中旧结构缓存。

## 冒烟检查

```powershell
$siteRoot = 'https://order-status-live.goldlikeke.workers.dev'
curl.exe -I $siteRoot
curl.exe -i "$siteRoot/api/session"
curl.exe -i "$siteRoot/api/order-status"
curl.exe -i -H "cf-access-jwt-assertion: fake" "$siteRoot/api/order-status"
curl.exe -I "$siteRoot/wincotek-logo.png"
```

预期：主页和 Logo 返回 200；未登录 session 返回 `authenticated: false`；后两个订单 API 请求均返回 401。随后在浏览器登录，确认页面显示更新时间、订单/供应商订单/CI 数量且无错误提示；“客户应收汇总”能显示客户总额、到期金额、逾期超过 60 天金额及 CI/对应订单明细，业务概览的近期提醒不含已收清 CI。

修改前端后还要检查登录页和侧栏 Logo 没有裁切；缓存未更新时使用 `Ctrl + F5` 强制刷新。当前 Logo 文件为 `public/wincotek-logo.png`，两个位置的显示比例在 `public/index.html` 的 `.auth-logo` 和 `.sidebar-logo` 中分别控制。

筛选组件变更后，分别进入客户应收、客户订单、供应商订单和 CI 发货栏目：确认下拉名单来自当前数据；勾选一个及多个名称后行数正确；文字搜索可继续按订单号/CI/日期/状态过滤；“清除筛选”恢复全部记录；窄屏下拉框不超出视口。

## 常见故障

- 飞书错误 `10003`：App ID 与 App Secret 不匹配，重新从同一应用复制。
- 飞书返回非 JSON：`FEISHU_BASE_TOKEN` 填成了完整 URL 或包含查询参数；只保留 token。
- 登录接口 503：`DASHBOARD_PASSWORD` 少于 12 位，或 `SESSION_SECRET` 缺失。
- 页面登录后 502：查看 Worker Observability 日志，优先检查飞书应用权限、Base token 和表 ID。
- 页面仍显示旧版：先 `Ctrl + F5`；再确认最新 Worker Version 已部署，且 GitHub Pages 根 `index.html` 仍跳转到 Worker 地址。
- 每次轮询都触发 8 表读取：确认 Worker 缓存响应使用 `public, max-age=<CACHE_SECONDS>`，而返回浏览器的响应为 `no-store`；不要把 `private` 响应直接写入 Cache API。

## 费用边界

当前使用 Cloudflare Workers 免费额度。2026-08-08 此账号的 Zero Trust Free 激活流程要求提供付款方式并授权超额费用，因此未启用 Access。应定期查看 Workers 用量；若业务规模接近免费额度，先暂停自动刷新或提高缓存时间，再决定是否升级。
