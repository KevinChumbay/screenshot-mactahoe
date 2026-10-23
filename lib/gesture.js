// Deslizar a la derecha descarta: lejos, o corto pero rápido.
export function isDismissSwipe(dx, velocityX) {
  return dx > 80 || (dx > 20 && velocityX > 600);
}

// Primer movimiento de un arrastre: "none" (todavía clic), "swipe" (horizontal a
// la derecha, descartar) o "drag" (cualquier otra dirección, arrastrar el archivo).
export function classifyMove(dx, dy, threshold = 8) {
  if (Math.hypot(dx, dy) < threshold)
    return "none";
  return dx > 0 && dx > Math.abs(dy) * 1.5 ? "swipe" : "drag";
}
