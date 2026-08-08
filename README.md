# Order Status · Feishu Live

只读订单状态页。页面和 API 运行在 Cloudflare Worker，业务数据实时读取飞书多维表格。

- 线上地址：<https://order-status-live.goldlikeke.workers.dev>
- [架构与数据口径](docs/ARCHITECTURE.md)
- [部署与运维手册](docs/RUNBOOK.md)

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

`DASHBOARD_PASSWORD` 至少 12 位，并应使用唯一强密码。Cloudflare Zero Trust Free 激活要求银行卡，因此本项目不依赖 Access，避免产生超额扣费风险。
