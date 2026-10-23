// Deslizar a la derecha descarta: lejos, o corto pero rápido.
export function isDismissSwipe(dx, velocityX) {
  return dx > 80 || (dx > 20 && velocityX > 600);
}
