import { test } from "node:test";
import assert from "node:assert/strict";

import { timerMayRun } from "../lib/timer.js";

const base = { finished: false, dragging: false, menuOpen: false, hovering: false };

test("corre si no pasa nada", () => {
  assert.equal(timerMayRun(base), true);
});

test("no corre durante un arrastre, aunque el puntero haya salido", () => {
  assert.equal(timerMayRun({ ...base, dragging: true }), false);
});

test("no corre con el menú abierto, con el puntero encima ni terminada", () => {
  assert.equal(timerMayRun({ ...base, menuOpen: true }), false);
  assert.equal(timerMayRun({ ...base, hovering: true }), false);
  assert.equal(timerMayRun({ ...base, finished: true }), false);
});
