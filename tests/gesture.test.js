import { test } from "node:test";
import assert from "node:assert/strict";

import { isDismissSwipe } from "../lib/gesture.js";

test("un desplazamiento largo a la derecha descarta", () => {
  assert.equal(isDismissSwipe(90, 0), true);
});

test("un movimiento corto pero rápido a la derecha descarta", () => {
  assert.equal(isDismissSwipe(30, 700), true);
});

test("un movimiento corto y lento no descarta", () => {
  assert.equal(isDismissSwipe(30, 100), false);
});

test("hacia la izquierda no descarta", () => {
  assert.equal(isDismissSwipe(-120, -900), false);
});
