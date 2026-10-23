#!/bin/bash
# Instala Screenshot MacTahoe para el usuario actual: compila el schema, enlaza
# el repo en la carpeta de extensiones de GNOME Shell y apaga en Gradia la opción
# que manda las capturas a la papelera al cerrar (guarda el valor anterior para
# que uninstall.sh lo restaure). Idempotente.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
UUID="screenshot-mactahoe@kevin"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/screenshot-mactahoe"
STATE="$STATE_DIR/gradia-trash-previous"
GRADIA="be.alexandervanhee.gradia"

glib-compile-schemas "$REPO/schemas/"
mkdir -p "$(dirname "$DEST")"
if [ -L "$DEST" ] || [ ! -e "$DEST" ]; then
  ln -sfn "$REPO" "$DEST"
else
  echo "Ya existe $DEST y no es un enlace; no lo toco." >&2
  exit 1
fi

if flatpak info "$GRADIA" >/dev/null 2>&1; then
  gradia_gsettings() { flatpak run --command=gsettings "$GRADIA" "$@" "$GRADIA" trash-screenshots-on-close; }
  if [ ! -f "$STATE" ]; then
    mkdir -p "$STATE_DIR"
    gradia_gsettings get > "$STATE"
  fi
  flatpak run --command=gsettings "$GRADIA" set "$GRADIA" trash-screenshots-on-close false
  echo "Gradia: trash-screenshots-on-close = false (antes: $(cat "$STATE"))"
else
  echo "Gradia no está instalado: la miniatura funciona, pero sin edición." >&2
fi

echo "Instalada en $DEST"
echo "Cierra sesión y vuelve a entrar, luego: gnome-extensions enable $UUID"
