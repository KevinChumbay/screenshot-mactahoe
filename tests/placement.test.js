import { test } from "node:test";
import assert from "node:assert/strict";

import { fitThumb, cornerPosition, pickMonitor } from "../lib/placement.js";

test("fitThumb ajusta capturas horizontales a 200 de ancho", () => {
  assert.deepEqual(fitThumb(1920, 1080), { width: 200, height: 113 });
});

test("fitThumb ajusta capturas verticales a 200 de alto", () => {
  assert.deepEqual(fitThumb(400, 1600), { width: 50, height: 200 });
});

test("fitThumb no agranda imágenes pequeñas", () => {
  assert.deepEqual(fitThumb(120, 80), { width: 120, height: 80 });
});

test("cornerPosition deja 16 px a la esquina inferior derecha", () => {
  assert.deepEqual(
    cornerPosition({ x: 1920, y: 0, width: 2560, height: 1400 }, { width: 248, height: 161 }),
    { x: 1920 + 2560 - 248 - 16, y: 1400 - 161 - 16 });
});

test("pickMonitor usa el principal por defecto", () => {
  assert.equal(pickMonitor("primary", -1, 0, 1), 0);
});

test("pickMonitor usa el del puntero", () => {
  assert.equal(pickMonitor("pointer", -1, 0, 1), 1);
});

test("pickMonitor usa el conector configurado", () => {
  assert.equal(pickMonitor("HDMI-1", 1, 0, 0), 1);
});

test("pickMonitor vuelve al principal si el conector está desconectado", () => {
  assert.equal(pickMonitor("HDMI-1", -1, 0, 1), 0);
});
