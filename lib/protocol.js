// Mensajes entre la extensión y la ventanita: un objeto JSON por línea.

export function encode(obj) {
  return `${JSON.stringify(obj)}\n`;
}

export function decodeLines(buffer) {
  const lines = buffer.split("\n");
  const rest = lines.pop();
  const messages = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg && typeof msg === "object")
        messages.push(msg);
    } catch {
      // Línea rota: se ignora.
    }
  }
  return { messages, rest };
}
