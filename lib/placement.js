// Geometría de la miniatura: tamaño, esquina y monitor. Sin dependencias de GNOME.

export function fitThumb(imgW, imgH, max = 200) {
  const scale = Math.min(1, max / imgW, max / imgH);
  return { width: Math.round(imgW * scale), height: Math.round(imgH * scale) };
}

export function cornerPosition(workArea, size, margin = 16) {
  return {
    x: workArea.x + workArea.width - size.width - margin,
    y: workArea.y + workArea.height - size.height - margin,
  };
}

// setting: "primary", "pointer" o un conector ("HDMI-1"). connectorIndex es lo
// que devuelve Mutter para ese conector, -1 si no está conectado.
export function pickMonitor(setting, connectorIndex, primaryIndex, pointerIndex) {
  if (setting === "pointer")
    return pointerIndex;
  if (setting !== "primary" && connectorIndex >= 0)
    return connectorIndex;
  return primaryIndex;
}
