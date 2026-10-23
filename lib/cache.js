// Copias para Gradia: nombre y limpieza de las viejas.

export function copyName(originalBasename, nowMs) {
  const stem = originalBasename.replace(/\.[^.]*$/, "");
  return `${stem}-marcada-${nowMs}.png`;
}

export function staleFiles(entries, nowMs, maxAgeMs = 86400000) {
  return entries.filter(e => nowMs - e.mtimeMs > maxAgeMs).map(e => e.name);
}
