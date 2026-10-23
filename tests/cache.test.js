import { test } from "node:test";
import assert from "node:assert/strict";

import { copyName, staleFiles } from "../lib/cache.js";

test("copyName marca la copia y le pone la hora", () => {
  assert.equal(copyName("Captura desde 2026-10-23 10-00-00.png", 5), "Captura desde 2026-10-23 10-00-00-marcada-5.png");
});

test("staleFiles devuelve solo las de más de un día", () => {
  const now = 10 * 86400000;
  const entries = [
    { name: "vieja.png", mtimeMs: now - 86400001 },
    { name: "nueva.png", mtimeMs: now - 1000 },
  ];
  assert.deepEqual(staleFiles(entries, now), ["vieja.png"]);
});
