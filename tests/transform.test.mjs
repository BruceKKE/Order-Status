import assert from "node:assert/strict";
import { buildDashboard } from "../src/index.js";

const rec = (record_id, fields) => ({ record_id, fields });
const linked = id => [{ record_ids: [id], text: "linked", type: "text" }];
const raw = {
  customers: [rec("recCustomer", { "客户名称": "ACME" })],
  orders: [rec("recOrder", { "销售PI号": "PI-001", "客户PO号": "PO-001", "客户": linked("recCustomer"), "订单金额": 1000, "成本合计": 700, "毛利润": 300, "毛利率": 0.3, "订单日期": 1767225600000 })],
  salesLines: [rec("recSales", { "销售明细编号": "SL-1", "对应客户订单": linked("recOrder"), "产品型号": "X", "数量": 10, "销售金额": 1000 })],
  supplierOrders: [rec("recSupplier", { "采购订单号": "SC-1", "对应销售订单": linked("recOrder"), "采购金额": 700 })],
  purchaseLines: [rec("recPurchase", { "采购明细编号": "PL-1", "对应供应商订单": linked("recSupplier"), "数量": 10, "采购金额": 700 })],
  cis: [rec("recCi", { "CI号": "CI-1", "对应客户订单": linked("recOrder"), "CI金额": 1000, "CI日期": 1767312000000 })],
  shipmentLines: [rec("recShip", { "出货明细编号": "SH-1", "对应CI": linked("recCi"), "出货数量": 10 })],
  arPlans: [rec("recAr", { "应收计划编号": "ARCI-recCi", "对应CI": linked("recCi"), "状态": "待收", "计划应收金额": 1000, "已收款金额": 400, "未收金额": 600 })]
};

const result = buildDashboard(raw);
assert.equal(result.orders[0].orderNo, "PI-001");
assert.equal(result.orders[0].customerName, "ACME");
assert.equal(result.orders[0].lineCount, 1);
assert.equal(result.supplierOrders[0].lineCount, 1);
assert.equal(result.cis[0].lineCount, 1);
assert.equal(result.cis[0].outstanding, 600);
assert.equal(result.summary.totalSales, 1000);
assert.equal(result.summary.weightedMargin, 0.3);
const serializedResult = JSON.stringify(result);
assert.doesNotMatch(serializedResult, /record_id/);
for (const internalId of ["recOrder", "recCustomer", "recSales", "recSupplier", "recPurchase", "recCi", "recShip", "recAr"]) {
  assert.equal(serializedResult.includes(internalId), false);
}

const contractFallback = buildDashboard({
  ...raw,
  orders: [rec("recOrder", { ...raw.orders[0].fields, "订单金额": undefined, "合同金额": 950 })]
});
assert.equal(contractFallback.orders[0].amount, 950);

const legitimateZero = buildDashboard({
  ...raw,
  orders: [rec("recOrder", { ...raw.orders[0].fields, "订单金额": 0, "合同金额": 950 })]
});
assert.equal(legitimateZero.orders[0].amount, 0);

const poFallback = buildDashboard({
  ...raw,
  orders: [rec("recOrder", { ...raw.orders[0].fields, "销售PI号": "", "客户PO号": "PO-FALLBACK" })]
});
assert.equal(poFallback.orders[0].orderNo, "PO-FALLBACK");

const activeArOnly = buildDashboard({
  ...raw,
  arPlans: [
    ...raw.arPlans,
    rec("recPaused", { "应收计划编号": "ARCI-paused", "对应CI": linked("recCi"), "状态": "暂停", "未收金额": 999 }),
    rec("recLegacy", { "应收计划编号": "AR-legacy", "对应CI": linked("recCi"), "状态": "待收", "未收金额": 888 })
  ]
});
assert.equal(activeArOnly.cis[0].outstanding, 600);

const supplierCurrency = buildDashboard({
  ...raw,
  supplierOrders: [rec("recSupplier", { ...raw.supplierOrders[0].fields, "原币币种": "CNY", "原币金额": 680, "折算USD金额": 100 })]
});
assert.equal(supplierCurrency.supplierOrders[0].originalCurrency, "CNY");
assert.equal(supplierCurrency.supplierOrders[0].originalAmount, 680);
assert.equal(supplierCurrency.supplierOrders[0].usdAmount, 100);
console.log("transform tests passed");
