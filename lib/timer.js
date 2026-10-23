// El contador de 6 s solo corre si nadie está usando la miniatura.
export function timerMayRun({ finished, dragging, menuOpen, hovering }) {
  return !finished && !dragging && !menuOpen && !hovering;
}
