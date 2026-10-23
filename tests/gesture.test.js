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

import { classifyMove } from "../lib/gesture.js";

test("sin moverse es un clic", () => {
  assert.equal(classifyMove(3, 2), "none");
});

test("horizontal a la derecha es deslizar", () => {
  assert.equal(classifyMove(20, 5), "swipe");
});

test("hacia arriba, la izquierda o en diagonal es arrastrar el archivo", () => {
  assert.equal(classifyMove(0, -20), "drag");
  assert.equal(classifyMove(-20, 0), "drag");
  assert.equal(classifyMove(15, 15), "drag");
});
