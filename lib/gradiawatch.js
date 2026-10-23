// Cuándo dar por cerrada una edición en Gradia. Gradia oculta su ventana y
// recién después guarda la copia (en un hilo), así que el cierre de la ventana
// no basta: hay que esperar el guardado, la papelera o un tope de tiempo.
//
// Eventos: windowCreated, windowTimeout, unmanaged, fileSaved, fileGone,
// saveTimeout {exists}. Resultado: {timeout: true} o {copyExists}.

export function initialWatch() {
  return { phase: "waitingWindow", saved: false };
}

export function stepWatch(watch, event) {
  const keep = { watch, result: null };
  switch (event.type) {
  case "windowCreated":
    return { watch: { ...watch, phase: "open" }, result: null };
  case "windowTimeout":
    return watch.phase === "waitingWindow" ? { watch, result: { timeout: true } } : keep;
  case "fileSaved":
    if (watch.phase === "closing")
      return { watch, result: { copyExists: true } };
    return { watch: { ...watch, saved: true }, result: null };
  case "fileGone":
    return watch.phase === "closing" ? { watch, result: { copyExists: false } } : keep;
  case "unmanaged":
    if (watch.phase !== "open")
      return keep;
    if (watch.saved)
      return { watch, result: { copyExists: true } };
    return { watch: { ...watch, phase: "closing" }, result: null };
  case "saveTimeout":
    return watch.phase === "closing" ? { watch, result: { copyExists: event.exists } } : keep;
  default:
    return keep;
  }
}

// Traduce un evento de Gio.FileMonitor sobre la carpeta de copias (nombres en
// minúsculas con guiones, como "changes-done-hint") a "saved", "gone" o null.
export function fileEventKind(eventName, fileName, otherName, copyName) {
  switch (eventName) {
  case "changes-done-hint":
  case "moved-in":
    return fileName === copyName ? "saved" : null;
  case "renamed":
    if (otherName === copyName)
      return "saved";
    return fileName === copyName ? "gone" : null;
  case "deleted":
  case "moved-out":
    return fileName === copyName ? "gone" : null;
  default:
    return null;
  }
}
