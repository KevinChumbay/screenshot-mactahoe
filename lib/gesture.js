const DISMISS_DX = 80;

// Deslizar a la derecha descarta: lejos, o corto pero rápido.
export function isDismissSwipe(dx, velocityX) {
  return dx > DISMISS_DX || (dx > 20 && velocityX > 600);
}

// Fondo que asoma detrás de la miniatura al deslizarla: se intensifica con el
// desplazamiento y queda "armado" (✕ marcada) desde el punto de descarte.
export function swipeReveal(dx) {
  const shift = Math.max(0, dx);
  return {
    opacity: Math.min(255, Math.round(shift / DISMISS_DX * 255)),
    armed: shift > DISMISS_DX,
  };
}

// Primer movimiento de un arrastre: "none" (todavía clic), "swipe" (horizontal a
// la derecha, descartar) o "drag" (cualquier otra dirección, arrastrar el archivo).
export function classifyMove(dx, dy, threshold = 8) {
  if (Math.hypot(dx, dy) < threshold)
    return "none";
  return dx > 0 && dx > Math.abs(dy) * 1.5 ? "swipe" : "drag";
}
