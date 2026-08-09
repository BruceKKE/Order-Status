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

月度功能变更后，进入“月度回款计划”并切换过去、当前和未来月份：确认某月会显示所有到该月月底已到期且截至当前仍未收的活动 ARCI；前月欠款在后续月份继续出现，核销为 0 后才消失。确认同一 CI 的分期逐条保留，已收齐和暂停计划不出现，不同币种分别合计。抽查一个客户的页面明细、分币种合计和英文邮件草稿完全一致；邮件标题使用 `Currently Outstanding, Due by <月份>`，避免把当前余额误写成历史快照，并按实际到期日区分逾期与未到期措辞。缺邮箱时草稿收件人为空，客户关系异常时邮件按钮必须禁用。打开草稿失败或正文较长时，“复制邮件内容”应可作为回退。每次发送前仍要与收款分摊或银行记录核对。

## 常见故障

- 飞书错误 `10003`：App ID 与 App Secret 不匹配，重新从同一应用复制。
- 飞书返回非 JSON：`FEISHU_BASE_TOKEN` 填成了完整 URL 或包含查询参数；只保留 token。
- 登录接口 503：`DASHBOARD_PASSWORD` 少于 12 位，或 `SESSION_SECRET` 缺失。
- 页面登录后 502：查看 Worker Observability 日志，优先检查飞书应用权限、Base token 和表 ID。
- 页面仍显示旧版：先 `Ctrl + F5`；再确认最新 Worker Version 已部署，且 GitHub Pages 根 `index.html` 仍跳转到 Worker 地址。
- 月度计划没有自动带入邮箱：在飞书 `客户档案.邮箱` 填写有效地址后刷新。经 2026-08-09 只读检查，当前 4 个客户档案的邮箱均为空。
- 点击邮件草稿没有反应：确认 Windows 已配置默认邮件客户端；也可直接使用“复制邮件内容”。超过安全长度的草稿会自动复制，避免 `mailto:` 被浏览器或邮件客户端截断。
- 月度计划金额与实际到账不一致：先核对 `收款分摊` 是否已同步到活动 ARCI；网页只读 ARCI，不能在前端硬编码已收例外。
- 每次轮询都触发 8 表读取：确认 Worker 缓存响应使用 `public, max-age=<CACHE_SECONDS>`，而返回浏览器的响应为 `no-store`；不要把 `private` 响应直接写入 Cache API。

## 费用边界

当前使用 Cloudflare Workers 免费额度。2026-08-08 此账号的 Zero Trust Free 激活流程要求提供付款方式并授权超额费用，因此未启用 Access。应定期查看 Workers 用量；若业务规模接近免费额度，先暂停自动刷新或提高缓存时间，再决定是否升级。
