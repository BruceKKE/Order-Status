# 架构与数据口径

## 数据流

浏览器只访问 Cloudflare Worker。Worker 校验登录会话后，使用服务端 Secret 获取飞书 tenant access token，再以只读方式读取多维表格。业务数据不会写入 Git、静态资源或浏览器 localStorage。

Worker 缓存成功响应 60 秒，前端每 60 秒刷新一次，并显示飞书数据生成时间。刷新失败时只保留本次页面会话中的上次成功数据。

## HTTP 路由

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/` | GET | 静态登录页和仪表盘 |
| `/api/session` | GET | 返回当前会话是否有效 |
| `/api/login` | POST | 校验访问密码并设置 12 小时签名 Cookie |
| `/api/logout` | POST | 清除会话 Cookie |
| `/api/order-status` | GET | 登录后返回最小化订单 DTO |

会话 Cookie 使用 HMAC-SHA256 签名和随机 nonce，并设置 `HttpOnly`、`Secure`、`SameSite=Strict`。登录和退出请求要求同源 `Origin`。旧的 `cf-access-jwt-assertion` 请求头不能绕过认证。登录失败按来源 IP 做 15 分钟窗口的尽力限速，并采用指数退避；它不能代替高熵强密码。

## 业务粒度

- 销售额、订单成本、订单利润：`客户订单` 粒度，订单号优先使用 `销售PI号`，缺失时回退 `客户PO号`。
- 采购与应付：`供应商订单` 粒度，保留原币金额和折算 USD 金额。
- 发货：CI 与 `出货明细` 粒度，通过飞书 record ID 关系连接客户订单、销售明细和采购明细。
- 收款：仅使用 `应收计划` 中的 ARCI 计划应收、已收和未收；不使用手工布尔值推断收款状态。

前端只读，不提供新增、删除、手工结单或收款写回入口。飞书是唯一事实源。

## 安全边界

- 所有飞书凭据和登录密钥只能存为 Cloudflare Worker Secret。
- 静态 HTML 不含业务记录；未登录 API 返回 401。
- 动态文本在前端插入 HTML 前统一转义，金额字段强制转换为数字。
- 页面设置 `noindex,nofollow`，但这不是访问控制；真正的控制在 Worker API 会话校验。
