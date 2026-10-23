import { test } from "node:test";
import assert from "node:assert/strict";

import { initialState, reduce } from "../lib/flow.js";

function showing() {
  let { state } = reduce(initialState(), { type: "screenshot", path: "/a.png" });
  ({ state } = reduce(state, { type: "screenshot", path: "/b.png" }));
  return state;
}

function editing() {
  return reduce(showing(), { type: "openGradia" }).state;
}

function marked() {
  const s = editing();
  return reduce(s, { type: "gradiaClosed", editId: s.editId, copy: "/c.png", copyExists: true }).state;
}

test("una captura muestra la miniatura", () => {
  const { state, effects } = reduce(initialState(), { type: "screenshot", path: "/a.png" });
  assert.equal(state.phase, "showing");
  assert.deepEqual(effects, [{ type: "show", path: "/a.png" }]);
});

test("una captura nueva reemplaza la miniatura", () => {
  const { state, effects } = reduce(reduce(initialState(), { type: "screenshot", path: "/a.png" }).state,
    { type: "screenshot", path: "/b.png" });
  assert.equal(state.current, "/b.png");
  assert.deepEqual(effects, [{ type: "show", path: "/b.png" }]);
});

test("abrir en Gradia oculta y lanza Gradia con la vigente", () => {
  const { state, effects } = reduce(showing(), { type: "openGradia" });
  assert.equal(state.phase, "editing");
  assert.deepEqual(effects, [{ type: "hide" }, { type: "launchGradia", source: "/b.png", editId: state.editId }]);
});

test("al cerrar Gradia vuelve la marcada y va al portapapeles", () => {
  const s = editing();
  const { state, effects } = reduce(s, { type: "gradiaClosed", editId: s.editId, copy: "/c.png", copyExists: true });
  assert.equal(state.phase, "showing");
  assert.equal(state.current, "/c.png");
  assert.equal(state.original, "/b.png");
  assert.deepEqual(effects, [{ type: "show", path: "/c.png" }, { type: "clipboard", path: "/c.png" }]);
});

test("si la copia no existe vuelve la imagen previa", () => {
  const s = editing();
  const { state, effects } = reduce(s, { type: "gradiaClosed", editId: s.editId, copy: "/c.png", copyExists: false });
  assert.equal(state.current, "/b.png");
  assert.deepEqual(effects, [{ type: "show", path: "/b.png" }]);
});

test("si Gradia no abre a tiempo vuelve la imagen previa", () => {
  const s = editing();
  assert.deepEqual(reduce(s, { type: "gradiaTimeout", editId: s.editId }).effects, [{ type: "show", path: "/b.png" }]);
});

test("una captura durante la edición gana al cierre viejo de Gradia", () => {
  const s1 = editing();
  const s4 = reduce(s1, { type: "screenshot", path: "/n.png" }).state;
  const s5 = reduce(s4, { type: "gradiaClosed", editId: s1.editId, copy: "/c.png", copyExists: true });
  assert.equal(s5.state.current, "/n.png");
  assert.deepEqual(s5.effects, []);
  assert.deepEqual(reduce(s4, { type: "gradiaTimeout", editId: s1.editId }).effects, []);
});

test("borrar manda el original a la papelera, nunca la copia", () => {
  const { state, effects } = reduce(marked(), { type: "delete" });
  assert.equal(state.phase, "idle");
  assert.deepEqual(effects, [{ type: "hide" }, { type: "trash", path: "/b.png" }]);
});

test("copiar usa la vigente", () => {
  assert.deepEqual(reduce(marked(), { type: "copy" }).effects, [{ type: "clipboard", path: "/c.png" }]);
});

test("mostrar en carpeta usa el original", () => {
  assert.deepEqual(reduce(marked(), { type: "showFolder" }).effects, [{ type: "showInFolder", path: "/b.png" }]);
});

test("descartar, expirar, soltar o morir la ventanita vuelve a idle", () => {
  const s2 = marked();
  for (const type of ["dismissed", "expired", "dropped", "helperExited"])
    assert.deepEqual(reduce(s2, { type }), { state: { ...s2, phase: "idle" }, effects: [] });
});

test("la ventanita cerrándose durante la edición no la interrumpe", () => {
  assert.equal(reduce(editing(), { type: "helperExited" }).state.phase, "editing");
});

test("eventos fuera de fase no hacen nada", () => {
  const idle = initialState();
  for (const type of ["openGradia", "copy", "showFolder", "delete", "dismissed"])
    assert.deepEqual(reduce(idle, { type }), { state: idle, effects: [] });
});
