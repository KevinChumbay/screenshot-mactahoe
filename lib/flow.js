// Flujo de la miniatura como reductor puro: (estado, evento) → {estado, efectos}.
// Fases: idle (nada en pantalla), showing (miniatura visible), editing (en Gradia).

export function initialState() {
  return { phase: "idle", original: null, current: null, editId: 0 };
}

const NOTHING = [];

export function reduce(state, event) {
  const same = { state, effects: NOTHING };

  switch (event.type) {
  case "screenshot":
    return {
      state: { phase: "showing", original: event.path, current: event.path, editId: state.editId + 1 },
      effects: [{ type: "show", path: event.path }],
    };

  case "openGradia": {
    if (state.phase !== "showing")
      return same;
    const editId = state.editId + 1;
    return {
      state: { ...state, phase: "editing", editId },
      effects: [{ type: "hide" }, { type: "launchGradia", source: state.current, editId }],
    };
  }

  case "gradiaClosed":
  case "gradiaTimeout": {
    if (state.phase !== "editing" || event.editId !== state.editId)
      return same;
    // Sin copia (o sin Gradia) vuelve la imagen previa: nunca una miniatura vacía.
    if (event.type === "gradiaClosed" && event.copyExists) {
      return {
        state: { ...state, phase: "showing", current: event.copy },
        effects: [{ type: "show", path: event.copy }, { type: "clipboard", path: event.copy }],
      };
    }
    return {
      state: { ...state, phase: "showing" },
      effects: [{ type: "show", path: state.current }],
    };
  }

  case "copy":
    if (state.phase !== "showing")
      return same;
    return { state, effects: [{ type: "clipboard", path: state.current }] };

  case "showFolder":
    if (state.phase !== "showing")
      return same;
    return { state, effects: [{ type: "showInFolder", path: state.original }] };

  case "delete":
    if (state.phase !== "showing")
      return same;
    return {
      state: { ...state, phase: "idle" },
      effects: [{ type: "hide" }, { type: "trash", path: state.original }],
    };

  case "dismissed":
  case "expired":
  case "dropped":
  case "helperExited":
    if (state.phase !== "showing")
      return same;
    return { state: { ...state, phase: "idle" }, effects: NOTHING };

  default:
    return same;
  }
}
