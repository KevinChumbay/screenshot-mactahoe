#!/bin/bash
# Desinstala Screenshot MacTahoe: la desactiva, quita el enlace, devuelve Gradia
# a como estaba antes de install.sh y borra las copias para Gradia.
set -euo pipefail

UUID="screenshot-mactahoe@kevin"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/screenshot-mactahoe"
STATE="$STATE_DIR/gradia-trash-previous"
GRADIA="be.alexandervanhee.gradia"
PICTURES="$(xdg-user-dir PICTURES 2>/dev/null || echo "$HOME/Pictures")"

gnome-extensions disable "$UUID" 2>/dev/null || true
if [ -L "$DEST" ]; then
  rm "$DEST"
fi

if [ -f "$STATE" ]; then
  previous="$(cat "$STATE")"
  if flatpak info "$GRADIA" >/dev/null 2>&1; then
    flatpak run --command=gsettings "$GRADIA" set "$GRADIA" trash-screenshots-on-close "$previous"
    echo "Gradia: trash-screenshots-on-close = $previous (restaurado)"
  fi
  rm "$STATE"
  rmdir "$STATE_DIR" 2>/dev/null || true
fi

rm -rf "$PICTURES/.screenshot-mactahoe"
echo "Desinstalada."
