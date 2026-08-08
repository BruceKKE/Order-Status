# Agent Instructions

Use this file when working inside `D:\Order-Status`.

## Start Here

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RUNBOOK.md`
4. `docs/HANDOFF.md`

The upstream business contracts live in `D:\FeishuOrderSystem\INTERFACE_CONTRACTS.md`. Read that file before changing any field mapping, financial metric, AR logic, or relationship traversal.

## Safety Boundaries

- This application is read-only. Never add a Feishu write, update, or delete request.
- Keep `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_BASE_TOKEN`, `DASHBOARD_PASSWORD`, and `SESSION_SECRET` in Cloudflare Worker Secrets only.
- Never expose Feishu record IDs, relationship IDs, full source records, access tokens, or attachment URLs in the browser DTO.
- Preserve the ARCI rule: receivables come only from active `ARCI-*` plans; records with `状态 = 暂停` are excluded.
- Preserve order identity fallback: `销售PI号`, then `客户PO号`.
- Preserve original-currency supplier amounts separately from USD-converted amounts.
- Do not replace password authentication with a client-side secret or direct browser-to-Feishu request.
- `public/wincotek-logo.png` is the shared login/sidebar branding asset. Keep it local; do not hotlink the desktop source file.

## Commands

```powershell
cd D:\Order-Status
npm install
npm run check
npm run deploy
```

After deployment, run the unauthenticated smoke checks in `docs/RUNBOOK.md`, then verify a logged-in page shows an update timestamp and all three record counts.

## Documentation Maintenance

- Update `docs/ARCHITECTURE.md` when routes, source tables, DTOs, authentication, caching, or business semantics change.
- Update `docs/RUNBOOK.md` when secrets, deployment, verification, or troubleshooting changes.
- Update `docs/HANDOFF.md` when the live URL, hosting arrangement, or known operational constraints change.
- Do not add secrets, live record samples, or private customer data to documentation or tests.
