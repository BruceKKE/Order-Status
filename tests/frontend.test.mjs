import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "inline frontend script should exist");
const cutoff = script.lastIndexOf('document.querySelectorAll(".nav-btn")');
assert.ok(cutoff > 0, "frontend bootstrap boundary should exist");
const frontend = new Function(`${script.slice(0, cutoff)};return {state,buildMonthlyPlan,reminderDraft,mailtoHref,extractEmails,monthKey};`)();

frontend.state.data = {
  meta: { generatedAt: "2026-05-15T00:00:00.000Z" },
  receivablesByCustomer: [{
    customerName: "ACME",
    customerEmail: "finance@example.com; invalid-value",
    contactName: "Alice",
    emailEligible: true,
    schedules: [
      { ciNo: "CI-OLD", orderNos: ["PI-OLD"], dueDate: "2026-03-01", currency: "USD", outstanding: 600, status: "已逾期" },
      { ciNo: "CI-JUNE", orderNos: ["PI-001"], dueDate: "2026-06-10", currency: "USD", outstanding: 400, status: "未到期" },
      { ciNo: "CI-JUNE", orderNos: ["PI-002"], dueDate: "2026-06-10", currency: "USD", outstanding: 100, status: "未到期" },
      { ciNo: "CI-EUR", orderNos: ["PI-003"], dueDate: "2026-06-20", currency: "EUR", outstanding: 50, status: "未到期" },
      { ciNo: "CI-ZERO", orderNos: ["PI-004"], dueDate: "2026-06-25", currency: "USD", outstanding: 0, status: "已收齐" }
    ]
  }, {
    customerName: "OPTILINK",
    customerEmail: "ar@optilink.example",
    contactName: "Finance Team",
    emailEligible: true,
    schedules: [
      { ciNo: "CI-OPT-APRIL", orderNos: ["PI-OPT-001"], dueDate: "2026-04-15", currency: "USD", outstanding: 200, status: "已逾期" }
    ]
  }]
};
frontend.state.collectionMonth = "2026-06";

const plan = frontend.buildMonthlyPlan("2026-06");
assert.equal(plan.length, 2);
assert.deepEqual(plan.map(group => group.customerName), ["ACME", "OPTILINK"]);
assert.equal(plan[0].items.length, 4);
assert.deepEqual(plan[0].items.filter(item => item.currency === "USD").map(item => item.outstanding), [600, 400, 100]);
assert.deepEqual(plan[0].totals, [["EUR", 50], ["USD", 1100]]);
assert.deepEqual(frontend.extractEmails(plan[0].customerEmail), ["finance@example.com"]);
assert.equal(frontend.buildMonthlyPlan("2026-02").length, 0);
assert.equal(frontend.buildMonthlyPlan("2026-03")[0].items.length, 1);
assert.deepEqual(frontend.buildMonthlyPlan("2026-05").map(group => group.customerName), ["ACME", "OPTILINK"]);

frontend.state.monthlyPlan = plan;
const draft = frontend.reminderDraft(plan[0]);
assert.equal(draft.recipient, "finance@example.com");
assert.match(draft.subject, /Payment Reminder - ACME - Currently Outstanding, Due by June 2026/);
assert.match(draft.body, /Dear Alice/);
assert.match(draft.body, /CI CI-OLD/);
assert.match(draft.body, /CI CI-JUNE/);
assert.match(draft.body, /\$1,100\.00/);
assert.match(draft.body, /€50\.00/);
assert.match(draft.body, /current records.*due on or before the end of June 2026/);
assert.doesNotMatch(draft.body, /CI-OPT-APRIL/);

frontend.state.collectionMonth = "2026-03";
const overdueDraft = frontend.reminderDraft(frontend.buildMonthlyPlan("2026-03")[0]);
assert.match(overdueDraft.body, /arrange payment as soon as possible/);

frontend.state.collectionMonth = "2026-05";
const mixedDraft = frontend.reminderDraft({
  customerName: "ACME",
  customerEmail: "finance@example.com",
  contactName: "Alice",
  items: [
    { ciNo: "CI-PAST", orderNos: ["PI-PAST"], dueDate: "2026-05-01", currency: "USD", outstanding: 100 },
    { ciNo: "CI-UPCOMING", orderNos: ["PI-UPCOMING"], dueDate: "2026-05-20", currency: "USD", outstanding: 200 }
  ],
  totals: [["USD", 300]]
});
assert.match(mixedDraft.body, /current records.*due on or before the end of May 2026/);
assert.match(mixedDraft.body, /past-due item\(s\) as soon as possible/);
assert.match(mixedDraft.body, /upcoming item\(s\) by their due date/);

const originalGroups = frontend.state.data.receivablesByCustomer;
frontend.state.data.receivablesByCustomer = [{
  customerName: "BOUNDARY",
  customerEmail: "boundary@example.com",
  contactName: "Finance",
  emailEligible: true,
  schedules: [
    { ciNo: "CI-MONTH-END", orderNos: ["PI-END"], dueDate: "2026-06-30", currency: "USD", outstanding: 10 },
    { ciNo: "CI-NEXT-MONTH", orderNos: ["PI-NEXT"], dueDate: "2026-07-01", currency: "USD", outstanding: 20 }
  ]
}];
assert.deepEqual(frontend.buildMonthlyPlan("2026-06")[0].items.map(item => item.ciNo), ["CI-MONTH-END"]);
assert.deepEqual(frontend.buildMonthlyPlan("2026-07")[0].items.map(item => item.ciNo), ["CI-MONTH-END", "CI-NEXT-MONTH"]);
frontend.state.collectionMonth = "2026-07";
const futureDraft = frontend.reminderDraft(frontend.buildMonthlyPlan("2026-07")[0]);
assert.match(futureDraft.subject, /Currently Outstanding, Due by July 2026/);
assert.match(futureDraft.body, /Our current records/);
assert.doesNotMatch(futureDraft.body, /As of July 2026/);
frontend.state.data.receivablesByCustomer = originalGroups;

const malicious = frontend.reminderDraft({
  customerName: "ACME\r\nBcc: attacker@example.com",
  customerEmail: "victim%0D%0ABcc%3Aevil@example.com; safe@example.com",
  contactName: "Accounts Team",
  items: plan[0].items,
  totals: plan[0].totals
});
assert.equal(malicious.recipient, "safe@example.com");
assert.doesNotMatch(malicious.subject, /[\r\n]/);
const maliciousHref = frontend.mailtoHref(malicious);
assert.match(maliciousHref, /^mailto:safe%40example\.com\?/);
assert.doesNotMatch(maliciousHref, /Bcc:/i);
assert.equal(frontend.monthKey("2026-08-09T00:00:00.000Z"), "2026-08");

console.log("frontend tests passed");
