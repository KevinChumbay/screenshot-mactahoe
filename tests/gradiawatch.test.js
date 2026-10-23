import { test } from "node:test";
import assert from "node:assert/strict";

import { initialWatch, stepWatch } from "../lib/gradiawatch.js";

function run(events) {
  let watch = initialWatch();
  let result = null;
  for (const ev of events) {
    ({ watch, result } = stepWatch(watch, ev));
    if (result)
      return result;
  }
  return null;
}

test("sin ventana de Gradia a tiempo → timeout", () => {
  assert.deepEqual(run([{ type: "windowTimeout" }]), { timeout: true });
});

test("cerrar la ventana no basta: espera a que Gradia guarde", () => {
  assert.equal(run([{ type: "windowCreated" }, { type: "unmanaged" }]), null);
});

test("guardado después de cerrar → copia marcada", () => {
  assert.deepEqual(run([{ type: "windowCreated" }, { type: "unmanaged" }, { type: "fileSaved" }]), { copyExists: true });
});

test("guardado antes de que se desmonte la ventana → copia marcada al cerrar", () => {
  assert.deepEqual(run([{ type: "windowCreated" }, { type: "fileSaved" }, { type: "unmanaged" }]), { copyExists: true });
});

test("copia a la papelera al cerrar → sin copia", () => {
  assert.deepEqual(run([{ type: "windowCreated" }, { type: "unmanaged" }, { type: "fileGone" }]), { copyExists: false });
});

test("si Gradia nunca guarda, al vencer la espera decide si la copia existe", () => {
  assert.deepEqual(run([{ type: "windowCreated" }, { type: "unmanaged" }, { type: "saveTimeout", exists: true }]),
    { copyExists: true });
});

test("Gradia se oculta y vuelve (captura interna) → sigue editando", () => {
  assert.equal(run([{ type: "windowCreated" }, { type: "unmanaged" }, { type: "windowCreated" },
    { type: "saveTimeout", exists: true }]), null);
});

test("el timeout de ventana no aplica una vez abierta", () => {
  assert.equal(run([{ type: "windowCreated" }, { type: "windowTimeout" }]), null);
});

import { fileEventKind } from "../lib/gradiawatch.js";

const COPY = "c-marcada-1.png";

test("escribir o renombrar sobre la copia es guardar", () => {
  assert.equal(fileEventKind("changes-done-hint", COPY, null, COPY), "saved");
  assert.equal(fileEventKind("renamed", ".goutputstream-X", COPY, COPY), "saved");
  assert.equal(fileEventKind("moved-in", COPY, null, COPY), "saved");
});

test("borrarla o sacarla de la carpeta es perderla", () => {
  assert.equal(fileEventKind("deleted", COPY, null, COPY), "gone");
  assert.equal(fileEventKind("moved-out", COPY, null, COPY), "gone");
  assert.equal(fileEventKind("renamed", COPY, "otra.png", COPY), "gone");
});

test("eventos de otros archivos no cuentan", () => {
  assert.equal(fileEventKind("changes-done-hint", "otra.png", null, COPY), null);
  assert.equal(fileEventKind("created", COPY, null, COPY), null);
});
