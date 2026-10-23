import { test } from "node:test";
import assert from "node:assert/strict";

import { encode, decodeLines } from "../lib/protocol.js";

test("encode produce una línea JSON", () => {
  assert.equal(encode({ cmd: "quit" }), '{"cmd":"quit"}\n');
});

test("decodeLines guarda la línea incompleta", () => {
  assert.deepEqual(decodeLines('{"event":"click"}\n{"ev'), { messages: [{ event: "click" }], rest: '{"ev' });
});

test("decodeLines omite líneas inválidas", () => {
  assert.deepEqual(decodeLines('basura\n{"event":"expired"}\n'), { messages: [{ event: "expired" }], rest: "" });
});
