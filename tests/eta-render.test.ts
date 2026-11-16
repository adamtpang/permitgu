import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The test runner compiles JSX in the classic style, which looks for a global React.
(globalThis as { React?: typeof React }).React = React;
// Loaded with require so it runs after the line above, not hoisted before it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EtaCallout } = require("../components/tracker") as typeof import("../components/tracker");
import { estimateEta, stepEstimateLabel } from "../lib/eta";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const DAY = 86400;

test("the estimate box shows a duration and a date once every open step has history", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  const steps = [
    { code: "intake", phase: "intake", routing: "always", status: "approved", startedAt: null },
    { code: "zoning", phase: "clearance", routing: "always", status: "in_progress", startedAt: "2026-11-14T00:00:00Z" },
    { code: "fee", phase: "fees", routing: "always", status: "not_started", startedAt: null },
    { code: "issue", phase: "issuance", routing: "always", status: "not_started", startedAt: null },
  ];
  const eta = estimateEta("clearances_in_progress", steps, [
    { code: "zoning", samples: 4, medianSeconds: 9 * DAY },
    { code: "fee", samples: 3, medianSeconds: 2 * DAY },
    { code: "issue", samples: 5, medianSeconds: 1 * DAY },
  ], now);
  assert.equal(eta.kind, "estimate");
  const shown = text(renderToStaticMarkup(createElement(EtaCallout, { eta, noun: "license" })));
  // 9 days usual, 2 already spent, then 2 and 1: 10 days.
  assert.match(shown, /Estimated time to license/);
  assert.match(shown, /About 10 days, around November 26, 2026\./);
  assert.match(shown, /An estimate, not a promise/);
  assert.match(shown, /at least 3 finished files per step/);
  assert.match(shown, /not an official agency timeline, and it stops when the license is issued\. Dates are Guam time\./);
});

test("the estimate box says plainly when there is not enough history", () => {
  const eta = estimateEta("intake", [{ code: "intake", phase: "intake", routing: "always", status: "queued", startedAt: null }], []);
  const shown = text(renderToStaticMarkup(createElement(EtaCallout, { eta })));
  assert.match(shown, /No estimate yet\. Only 0 of the 1 remaining steps/);
  assert.equal(/About|around/.test(shown), false);
  assert.equal(stepEstimateLabel({ code: "zoning", samples: 4, medianSeconds: 9 * DAY }), "Usually about 9 days, from 4 finished files on this tracker.");
});

test("a finished file shows no estimate box", () => {
  assert.equal(renderToStaticMarkup(createElement(EtaCallout, { eta: { kind: "done" } })), "");
});
