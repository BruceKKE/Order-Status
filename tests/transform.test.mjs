import assert from "node:assert/strict";
import { buildDashboard } from "../src/index.js";

const rec = (record_id, fields) => ({ record_id, fields });
const linked = id => [{ record_ids: [id], text: "linked", type: "text" }];
const linkedMany = ids => [{ record_ids: ids, text: "linked", type: "text" }];
const raw = {
  customers: [rec("recCustomer", { "客户名称": "ACME", "邮箱": "finance@example.com", "联系人": "Alice" })],
  orders: [rec("recOrder", { "销售PI号": "PI-001", "客户PO号": "PO-001", "客户": linked("recCustomer"), "订单金额": 1000, "成本合计": 700, "毛利润": 300, "毛利率": 0.3, "订单日期": 1767225600000 })],
  salesLines: [rec("recSales", { "销售明细编号": "SL-1", "对应客户订单": linked("recOrder"), "产品型号": "X", "数量": 10, "销售金额": 1000 })],
  supplierOrders: [rec("recSupplier", { "采购订单号": "SC-1", "对应销售订单": linked("recOrder"), "采购金额": 700 })],
  purchaseLines: [rec("recPurchase", { "采购明细编号": "PL-1", "对应供应商订单": linked("recSupplier"), "数量": 10, "采购金额": 700 })],
  cis: [rec("recCi", { "CI号": "CI-1", "对应客户订单": linked("recOrder"), "客户": linked("recCustomer"), "CI金额": 1000, "CI日期": 1767312000000 })],
  shipmentLines: [rec("recShip", { "出货明细编号": "SH-1", "对应CI": linked("recCi"), "出货数量": 10 })],
  arPlans: [rec("recAr", { "应收计划编号": "ARCI-recCi", "对应CI": linked("recCi"), "状态": "待收", "到期日": "2026-03-01", "计划应收金额": 1000, "已收款金额": 400, "未收金额": 600 })]
};

const result = buildDashboard(raw, new Date("2026-05-15T00:00:00Z"));
assert.equal(result.orders[0].orderNo, "PI-001");
assert.equal(result.orders[0].customerName, "ACME");
assert.equal(result.orders[0].lineCount, 1);
assert.equal(result.supplierOrders[0].lineCount, 1);
assert.equal(result.cis[0].lineCount, 1);
assert.equal(result.cis[0].customerName, "ACME");
assert.deepEqual(result.cis[0].orderNos, ["PI-001"]);
assert.equal(result.cis[0].outstanding, 600);
assert.equal(result.cis[0].dueOutstanding, 600);
assert.equal(result.cis[0].over60Outstanding, 600);
assert.equal(result.cis[0].isDue, true);
assert.equal(result.cis[0].daysOverdue, 75);
assert.equal(result.cis[0].overdueMoreThan60Days, true);
assert.equal(result.summary.totalSales, 1000);
assert.equal(result.summary.weightedMargin, 0.3);
assert.equal(result.summary.outstandingCiCount, 1);
assert.equal(result.summary.totalDueOutstanding, 600);
assert.equal(result.summary.totalOver60Outstanding, 600);
assert.equal(result.receivablesByCustomer[0].customerName, "ACME");
assert.equal(result.receivablesByCustomer[0].customerEmail, "finance@example.com");
assert.equal(result.receivablesByCustomer[0].contactName, "Alice");
assert.equal(result.receivablesByCustomer[0].emailEligible, true);
assert.equal(result.receivablesByCustomer[0].totalOutstanding, 600);
assert.deepEqual(result.receivablesByCustomer[0].items[0].orderNos, ["PI-001"]);
assert.deepEqual(result.receivablesByCustomer[0].schedules, [{
  ciNo: "CI-1",
  orderNos: ["PI-001"],
  dueDate: "2026-03-01",
  currency: "USD",
  outstanding: 600,
  status: "待收"
}]);
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

const splitSchedule = buildDashboard({
  ...raw,
  arPlans: [
    raw.arPlans[0],
    rec("recArFuture", { "应收计划编号": "ARCI-recCi-future", "对应CI": linked("recCi"), "状态": "待收", "到期日": "2026-06-01", "计划应收金额": 400, "未收金额": 400 })
  ]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(splitSchedule.summary.totalOutstanding, 1000);
assert.equal(splitSchedule.summary.totalDueOutstanding, 600);
assert.equal(splitSchedule.summary.totalOver60Outstanding, 600);
assert.equal(splitSchedule.receivablesByCustomer[0].items[0].dueOutstanding, 600);
assert.equal(splitSchedule.receivablesByCustomer[0].items[0].over60Outstanding, 600);
assert.deepEqual(splitSchedule.receivablesByCustomer[0].schedules.map(schedule => [schedule.dueDate, schedule.outstanding]), [["2026-03-01", 600], ["2026-06-01", 400]]);

const exact60Days = buildDashboard({
  ...raw,
  arPlans: [rec("recAr", { ...raw.arPlans[0].fields, "到期日": "2026-03-16" })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(exact60Days.cis[0].daysOverdue, 60);
assert.equal(exact60Days.summary.totalOver60Outstanding, 0);

const over60Days = buildDashboard({
  ...raw,
  arPlans: [rec("recAr", { ...raw.arPlans[0].fields, "到期日": "2026-03-15" })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(over60Days.cis[0].daysOverdue, 61);
assert.equal(over60Days.summary.totalOver60Outstanding, 600);

const missingArRelationFallback = buildDashboard({
  ...raw,
  arPlans: [rec("recAr", { ...raw.arPlans[0].fields, "对应CI": undefined })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(missingArRelationFallback.cis[0].outstanding, 600);
assert.equal(missingArRelationFallback.summary.unlinkedArPlanCount, 0);

const danglingRelations = buildDashboard({
  ...raw,
  cis: [rec("recCi", { ...raw.cis[0].fields, "对应客户订单": "recMissingOrder", "客户": "recMissingCustomer" })]
}, new Date("2026-05-15T00:00:00Z"));
assert.deepEqual(danglingRelations.cis[0].orderNos, []);
assert.equal(danglingRelations.cis[0].customerName, "未归属客户");
assert.doesNotMatch(JSON.stringify(danglingRelations), /recMissing/);

const danglingSupplier = buildDashboard({
  ...raw,
  supplierOrders: [rec("recSupplier", { ...raw.supplierOrders[0].fields, "供应商": "recMissingSupplier" })]
});
assert.equal(danglingSupplier.supplierOrders[0].supplierName, "未归属供应商");
assert.doesNotMatch(JSON.stringify(danglingSupplier), /recMissingSupplier/);

const twoOrdersOneCi = buildDashboard({
  ...raw,
  orders: [...raw.orders, rec("recOrder2", { ...raw.orders[0].fields, "销售PI号": "PI-002" })],
  cis: [rec("recCi", { ...raw.cis[0].fields, "对应客户订单": linkedMany(["recOrder", "recOrder2"]) })]
}, new Date("2026-05-15T00:00:00Z"));
assert.deepEqual(twoOrdersOneCi.cis[0].orderNos, ["PI-001", "PI-002"]);
assert.equal(twoOrdersOneCi.summary.totalOutstanding, 600);

const sameNameCustomers = buildDashboard({
  ...raw,
  customers: [...raw.customers, rec("recCustomer2", { "客户名称": "ACME" })],
  orders: [...raw.orders, rec("recOrder2", { ...raw.orders[0].fields, "销售PI号": "PI-002", "客户": linked("recCustomer2") })],
  cis: [...raw.cis, rec("recCi2", { ...raw.cis[0].fields, "CI号": "CI-2", "对应客户订单": linked("recOrder2"), "客户": linked("recCustomer2") })],
  arPlans: [...raw.arPlans, rec("recAr2", { ...raw.arPlans[0].fields, "应收计划编号": "ARCI-recCi2", "对应CI": linked("recCi2"), "未收金额": 200 })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(sameNameCustomers.summary.customerReceivableCount, 2);
assert.deepEqual(sameNameCustomers.receivablesByCustomer.map(group => group.totalOutstanding).sort((a, b) => a - b), [200, 600]);

const ambiguousCustomerRelation = buildDashboard({
  ...raw,
  customers: [...raw.customers, rec("recCustomer2", { "客户名称": "BETA", "邮箱": "beta@example.com" })],
  cis: [rec("recCi", { ...raw.cis[0].fields, "客户": linkedMany(["recCustomer", "recCustomer2"]) })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(ambiguousCustomerRelation.summary.ambiguousCustomerCiCount, 1);
assert.equal(ambiguousCustomerRelation.receivablesByCustomer[0].emailEligible, false);
assert.equal(ambiguousCustomerRelation.receivablesByCustomer[0].customerEmail, "");
assert.equal(ambiguousCustomerRelation.receivablesByCustomer[0].contactName, "");

const partiallyDanglingCustomerRelation = buildDashboard({
  ...raw,
  cis: [rec("recCi", { ...raw.cis[0].fields, "客户": linkedMany(["recCustomer", "recDeletedCustomer"]) })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(partiallyDanglingCustomerRelation.summary.ambiguousCustomerCiCount, 1);
assert.equal(partiallyDanglingCustomerRelation.receivablesByCustomer[0].emailEligible, false);
assert.equal(partiallyDanglingCustomerRelation.receivablesByCustomer[0].customerEmail, "");
assert.doesNotMatch(JSON.stringify(partiallyDanglingCustomerRelation), /recDeletedCustomer/);

const negativeBalance = buildDashboard({
  ...raw,
  arPlans: [rec("recAr", { ...raw.arPlans[0].fields, "未收金额": -10 })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(negativeBalance.summary.totalOutstanding, 0);
assert.deepEqual(negativeBalance.receivablesByCustomer, []);

const mixedPositiveNegative = buildDashboard({
  ...raw,
  arPlans: [
    raw.arPlans[0],
    rec("recNegative", { "应收计划编号": "ARCI-recCi-negative", "对应CI": linked("recCi"), "状态": "待收", "到期日": "2026-03-01", "未收金额": -500 })
  ]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(mixedPositiveNegative.summary.totalOutstanding, 600);
assert.equal(mixedPositiveNegative.summary.totalDueOutstanding, 600);
assert.equal(mixedPositiveNegative.summary.totalOver60Outstanding, 600);

const unresolvedAr = buildDashboard({
  ...raw,
  arPlans: [...raw.arPlans, rec("recOrphan", { "应收计划编号": "ARCI-recMissingCi", "状态": "待收", "未收金额": 99 })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(unresolvedAr.summary.unlinkedArPlanCount, 1);

const conflictingArRelation = buildDashboard({
  ...raw,
  cis: [...raw.cis, rec("recCi2", { ...raw.cis[0].fields, "CI号": "CI-2" })],
  arPlans: [rec("recConflict", { ...raw.arPlans[0].fields, "应收计划编号": "ARCI-recCi", "对应CI": linked("recCi2") })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(conflictingArRelation.summary.conflictingArPlanCount, 1);
assert.equal(conflictingArRelation.summary.unlinkedArPlanCount, 0);
assert.equal(conflictingArRelation.summary.totalOutstanding, 0);

const supplierCurrency = buildDashboard({
  ...raw,
  supplierOrders: [rec("recSupplier", { ...raw.supplierOrders[0].fields, "原币币种": "CNY", "原币金额": 680, "折算USD金额": 100 })]
});
assert.equal(supplierCurrency.supplierOrders[0].originalCurrency, "CNY");
assert.equal(supplierCurrency.supplierOrders[0].originalAmount, 680);
assert.equal(supplierCurrency.supplierOrders[0].usdAmount, 100);

const fullyPaid = buildDashboard({
  ...raw,
  arPlans: [rec("recAr", { ...raw.arPlans[0].fields, "已收款金额": 1000, "未收金额": 0, "状态": "已收齐" })]
}, new Date("2026-05-15T00:00:00Z"));
assert.equal(fullyPaid.summary.outstandingCiCount, 0);
assert.equal(fullyPaid.summary.totalOutstanding, 0);
assert.deepEqual(fullyPaid.receivablesByCustomer, []);
console.log("transform tests passed");
