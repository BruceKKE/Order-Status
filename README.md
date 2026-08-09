# Order Status · Feishu Live

只读订单状态页。页面和 API 运行在 Cloudflare Worker，业务数据以 60 秒轮询和最多 60 秒服务端缓存近实时读取飞书多维表格。

- 线上地址：<https://order-status-live.goldlikeke.workers.dev>
- 原 GitHub Pages 地址：<https://brucekke.github.io/Order-Status/>（自动跳转到线上地址）
- [架构与数据口径](docs/ARCHITECTURE.md)
- [部署与运维手册](docs/RUNBOOK.md)
- [当前交接状态](docs/HANDOFF.md)

页面打开时立即读取数据，保持打开后每 60 秒自动刷新；手动点击“刷新数据”也会重新请求。登录页和主界面共用本地静态资源 `public/wincotek-logo.png`。

“客户应收汇总”按活动 `ARCI-*` 计划统计未收金额，展示每个客户的应收总额、已到期应收和逾期超过 60 天金额，并下钻到 CI 及其对应业务订单。已收清的 CI 不进入提醒或客户应收汇总。

客户应收、客户订单和 CI 发货栏目使用可搜索的客户多选下拉框；供应商订单使用可搜索的供应商多选下拉框。可以同时勾选多个名称、继续按订单号/CI/日期/状态搜索，并一键清除筛选。

“月度回款计划”选择某个月时，会列出所有到该月月底已经到期、截至当前仍未收的活动 ARCI；以前月份的欠款会逐月结转，直到核销付清后消失，并按客户和币种分别合计。这是当前余额视图，不是历史月份快照。每个客户可打开预填收件人、英文主题和明细的本机邮件草稿，也可复制完整邮件内容；网页不会自动发送邮件。

页面反映飞书 ARCI 的核销同步状态，不替代银行现金或收款分摊台账；已确认收款只有在分摊与 ARCI 同步完成后才会从未收金额中移除。

## 安全边界

- 飞书是唯一事实源，网页不写入飞书。
- API 需要登录；会话使用 HMAC 签名的 Secure、HttpOnly、SameSite Cookie，12 小时后失效。
- `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BASE_TOKEN`、`DASHBOARD_PASSWORD`、`SESSION_SECRET` 只能配置为 Worker secrets。
- 前端不保存业务数据到 localStorage。

## 本地检查

```bash
npm install
npm run check
```

## 部署

```bash
npx wrangler login
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET
npx wrangler secret put FEISHU_BASE_TOKEN
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy
```

`DASHBOARD_PASSWORD` 至少 12 位，并应使用唯一强密码。2026-08-08 此 Cloudflare 账号的 Zero Trust Free 激活流程要求提供付款方式并授权超额费用，因此本项目未启用 Access。
