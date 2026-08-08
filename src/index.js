const TABLES = Object.freeze({
  customers: "tblaKpdhEc0fkzOj",
  orders: "tblNQxuo4asc8mJA",
  salesLines: "tblyoVmcI7h6Oumz",
  supplierOrders: "tblhf8K45izlZGtB",
  purchaseLines: "tblikW5kxDin6hfT",
  cis: "tblbT3w6lnlO6TKh",
  shipmentLines: "tblZ31SpNwpx706T",
  arPlans: "tblab4ZSILnBCrlz"
});

let tokenCache = { token: "", expiresAt: 0 };
const loginAttempts = new Map();
const SESSION_COOKIE = "order_status_session";
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

function parseCookies(header) {
  return Object.fromEntries((header || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function digest(value) {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function signSession(secret, payload) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function hasValidSession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE] || "";
  const [version, expiresText, nonce, signature, ...extra] = token.split(".");
  if (version !== "v1" || extra.length || !/^\d+$/.test(expiresText || "") || !nonce || !signature) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await signSession(env.SESSION_SECRET, `${version}.${expiresText}.${nonce}`);
  return constantTimeEqual(signature, expected);
}

function sameOrigin(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function readJsonBodyLimited(request, maxBytes = 4096) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new RangeError("Request too large");
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RangeError("Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(decoder.decode(bytes));
}

function loginAttempt(request) {
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.windowEnds <= now) return { key, count: 0, windowEnds: now + 15 * 60 * 1000, blockedUntil: 0 };
  return { key, ...current };
}

async function loginResponse(request, env) {
  if (!env.DASHBOARD_PASSWORD || env.DASHBOARD_PASSWORD.length < 12 || !env.SESSION_SECRET) {
    return json({ error: "Login is not configured" }, 503);
  }
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "JSON body required" }, 415);
  }
  const attempt = loginAttempt(request);
  if (attempt.blockedUntil > Date.now()) {
    return json({ error: "Too many login attempts" }, 429, { "retry-after": String(Math.ceil((attempt.blockedUntil - Date.now()) / 1000)) });
  }
  let body;
  try {
    body = await readJsonBodyLimited(request);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: "Request too large" }, 413);
    return json({ error: "Invalid JSON" }, 400);
  }
  const candidate = typeof body.password === "string" ? body.password : "";
  const matches = constantTimeEqual(await digest(candidate), await digest(env.DASHBOARD_PASSWORD));
  if (!matches) {
    attempt.count += 1;
    if (attempt.count >= 5) attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
    loginAttempts.set(attempt.key, attempt);
    await new Promise(resolve => setTimeout(resolve, Math.min(5000, 500 * (2 ** Math.min(attempt.count, 4)))));
    return json({ error: "Invalid password" }, 401);
  }
  loginAttempts.delete(attempt.key);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expiresAt}.${nonce}`;
  const signature = await signSession(env.SESSION_SECRET, payload);
  return json({ ok: true }, 200, {
    "set-cookie": `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  });
}

function logoutResponse(request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  return json({ ok: true }, 200, {
    "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  });
}

async function assetResponse(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    for (const key of ["text", "name", "value", "label"]) {
      if (value[key] != null) return textOf(value[key]);
    }
  }
  return "";
}

function numberOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(textOf(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function linkIds(value, result = new Set()) {
  if (value == null) return result;
  if (typeof value === "string") {
    if (/^rec[A-Za-z0-9]+$/.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) linkIds(item, result);
    return result;
  }
  if (typeof value === "object") {
    for (const key of ["record_id", "recordId", "id"]) {
      if (typeof value[key] === "string" && /^rec[A-Za-z0-9]+$/.test(value[key])) result.add(value[key]);
    }
    for (const key of ["record_ids", "recordIds", "value"]) {
      if (value[key] != null) linkIds(value[key], result);
    }
  }
  return result;
}

function relation(value) {
  return { ids: [...linkIds(value)], label: textOf(value) };
}

function dateOf(value) {
  if (value == null || value === "") return "";
  const raw = Array.isArray(value) ? value[0] : value;
  let date;
  if (typeof raw === "number") date = new Date(raw > 1e11 ? raw : raw * 1000);
  else if (/^\d{12,}$/.test(String(raw))) date = new Date(Number(raw));
  else date = new Date(textOf(raw));
  if (Number.isNaN(date.getTime())) return textOf(raw).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || textOf(value) === "") continue;
    const parsed = Number.parseFloat(textOf(value).replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function getTenantToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const body = await response.json();
  if (!response.ok || body.code !== 0 || !body.tenant_access_token) {
    throw new Error(`Feishu authentication failed (code ${body.code ?? response.status})`);
  }
  tokenCache = {
    token: body.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expire || 7200) - 300) * 1000
  };
  return tokenCache.token;
}

async function listRecords(env, token, tableId) {
  const records = [];
  let pageToken = "";
  do {
    const url = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(env.FEISHU_BASE_TOKEN)}/tables/${tableId}/records`);
    url.searchParams.set("page_size", "500");
    url.searchParams.set("user_id_type", "open_id");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok || body.code !== 0) {
      throw new Error(`Feishu table read failed for ${tableId} (code ${body.code ?? response.status})`);
    }
    records.push(...(body.data?.items || []));
    if (body.data?.has_more && !body.data?.page_token) throw new Error(`Missing page token for ${tableId}`);
    pageToken = body.data?.has_more ? body.data.page_token : "";
  } while (pageToken);
  return records;
}

async function readAllTables(env, token) {
  const names = Object.keys(TABLES);
  const entries = [];
  for (let index = 0; index < names.length; index += 5) {
    const batch = names.slice(index, index + 5);
    const values = await Promise.all(batch.map(async name => [name, await listRecords(env, token, TABLES[name])]));
    entries.push(...values);
  }
  return Object.fromEntries(entries);
}

function groupBy(records, getKeys) {
  const map = new Map();
  for (const record of records) {
    for (const key of getKeys(record)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    }
  }
  return map;
}

export function buildDashboard(raw) {
  const customers = new Map(raw.customers.map(record => [record.record_id, textOf(record.fields?.["客户名称"] || record.fields?.["客户简称"] || record.fields?.["名称"])]));
  const salesByOrder = groupBy(raw.salesLines, record => relation(record.fields?.["对应客户订单"]).ids);
  const purchaseBySupplier = groupBy(raw.purchaseLines, record => relation(record.fields?.["对应供应商订单"]).ids);
  const shipmentByCi = groupBy(raw.shipmentLines, record => relation(record.fields?.["对应CI"]).ids);
  const arByCi = groupBy(raw.arPlans.filter(record => {
    const id = textOf(record.fields?.["应收计划编号"]);
    const status = textOf(record.fields?.["状态"]);
    return id.startsWith("ARCI-") && status !== "暂停";
  }), record => relation(record.fields?.["对应CI"]).ids);

  const orderRows = raw.orders.map(record => {
    const f = record.fields || {};
    const customerLink = relation(f["客户"]);
    const lineCount = (salesByOrder.get(record.record_id) || []).length;
    return {
      orderNo: textOf(f["销售PI号"]) || textOf(f["客户PO号"]),
      customerName: customerLink.ids.map(id => customers.get(id)).filter(Boolean).join(" / ") || customerLink.label || "未归属客户",
      date: dateOf(f["订单日期"]),
      currency: textOf(f["币种"]) || "USD",
      amount: firstNumber(f["订单金额"], f["合同金额"], f["自动订单金额"]),
      cost: firstNumber(f["成本合计"], f["自动成本合计"]),
      profit: firstNumber(f["毛利润"], f["自动毛利润"]),
      margin: firstNumber(f["毛利率"], f["自动毛利率"]),
      pendingAmount: numberOf(f["待发货金额"]),
      status: textOf(f["订单状态"]),
      paymentStatus: textOf(f["收款状态"]),
      lineCount
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const supplierRows = raw.supplierOrders.map(record => {
    const f = record.fields || {};
    const lineCount = (purchaseBySupplier.get(record.record_id) || []).length;
    return {
      orderNo: textOf(f["采购订单号"] || f["供应商合同号"]),
      supplierName: textOf(f["供应商"]) || "未归属供应商",
      date: dateOf(f["下单日期"]),
      originalCurrency: textOf(f["原币币种"] || f["币种"]),
      originalAmount: numberOf(f["原币金额"]),
      usdAmount: firstNumber(f["折算USD金额"], f["采购金额"], f["自动采购金额"]),
      paidAmount: numberOf(f["已付款金额"]),
      payableBalance: numberOf(f["应付余额"]),
      status: textOf(f["订单状态"]),
      deliveryStatus: textOf(f["物流/交付状态"]),
      paymentStatus: textOf(f["付款状态"]),
      lineCount
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const ciRows = raw.cis.map(record => {
    const f = record.fields || {};
    const lineCount = (shipmentByCi.get(record.record_id) || []).length;
    const plans = arByCi.get(record.record_id) || [];
    const receivable = plans.reduce((sum, plan) => sum + numberOf(plan.fields?.["计划应收金额"]), 0);
    const received = plans.reduce((sum, plan) => sum + numberOf(plan.fields?.["已收款金额"]), 0);
    const outstanding = plans.reduce((sum, plan) => sum + numberOf(plan.fields?.["未收金额"]), 0);
    const dueDates = plans.map(plan => dateOf(plan.fields?.["到期日"])).filter(Boolean).sort();
    return {
      ciNo: textOf(f["CI号"]),
      customerName: textOf(f["客户"]),
      ciDate: dateOf(f["CI日期"]),
      shipmentDate: dateOf(f["发货日期"]),
      dueDate: dueDates[0] || "",
      currency: textOf(f["币种"]) || "USD",
      amount: firstNumber(f["CI金额"], f["自动出货金额"]),
      receivable,
      received,
      outstanding,
      status: textOf(f["发货状态"] || f["CI状态"]),
      lineCount
    };
  }).sort((a, b) => (b.ciDate || "").localeCompare(a.ciDate || ""));

  const totalSales = orderRows.reduce((sum, row) => sum + row.amount, 0);
  const totalProfit = orderRows.reduce((sum, row) => sum + row.profit, 0);
  const totalOutstanding = ciRows.reduce((sum, row) => sum + row.outstanding, 0);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      timeZone: "Asia/Singapore",
      source: "Feishu Base",
      grains: { sales: "order", shipment: "shipment/CI", receivable: "cash-allocation/ARCI" }
    },
    summary: {
      orderCount: orderRows.length,
      ciCount: ciRows.length,
      supplierOrderCount: supplierRows.length,
      totalSales,
      totalProfit,
      weightedMargin: totalSales ? totalProfit / totalSales : 0,
      totalOutstanding
    },
    orders: orderRows,
    supplierOrders: supplierRows,
    cis: ciRows
  };
}

async function dashboardResponse(request, env, ctx) {
  if (!(await hasValidSession(request, env))) return json({ error: "Authentication required" }, 401);
  for (const key of ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_BASE_TOKEN"]) {
    if (!env[key]) return json({ error: `Server is missing ${key}` }, 503);
  }
  const cache = caches.default;
  const cacheKey = new Request("https://order-status.internal/api/order-status", { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const token = await getTenantToken(env);
  const raw = await readAllTables(env, token);
  const payload = buildDashboard(raw);
  const seconds = Math.max(10, Math.min(300, Number(env.CACHE_SECONDS || 30)));
  const response = json(payload, 200, { "cache-control": `private, max-age=0, s-maxage=${seconds}` });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/login" && request.method === "POST") return await loginResponse(request, env);
      if (url.pathname === "/api/logout" && request.method === "POST") return logoutResponse(request);
      if (url.pathname === "/api/session" && request.method === "GET") {
        return json({ authenticated: await hasValidSession(request, env) }, 200);
      }
      if (url.pathname === "/api/order-status" && request.method === "GET") {
        return await dashboardResponse(request, env, ctx);
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return assetResponse(request, env);
    } catch (error) {
      console.error("order-status request failed", error?.message || error);
      return json({ error: "Unable to refresh Feishu data", retryable: true }, 502);
    }
  }
};
