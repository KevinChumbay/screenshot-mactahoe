#!/bin/bash
# Prueba la extensión en una sesión de GNOME Shell sin pantalla (headless, con
# un monitor virtual de 1920x1080), aislada de la dconf
# y los datos reales (XDG_* se exportan ANTES de dbus-run-session).
# Uso: tools/nested-test.sh [segundos]   → log en $TMPROOT/shell.log
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SECS="${1:-40}"
TMPROOT="${TMPROOT:-$(mktemp -d)}"
HOST_WAYLAND="${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY:-wayland-0}"

export XDG_CONFIG_HOME="$TMPROOT/config"
export XDG_DATA_HOME="$TMPROOT/data"
export XDG_RUNTIME_DIR="$TMPROOT/run"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
cp "$HOME/.config/user-dirs.dirs" "$XDG_CONFIG_HOME/" 2>/dev/null || true
export WAYLAND_DISPLAY="$HOST_WAYLAND"

glib-compile-schemas "$REPO/schemas/"
ln -sfn "$REPO" "$XDG_DATA_HOME/gnome-shell/extensions/screenshot-mactahoe@kevin"
ln -sfn "$REPO/tools/probe@screenshot-mactahoe" "$XDG_DATA_HOME/gnome-shell/extensions/probe@screenshot-mactahoe"

# Extensiones de la sesión real que interactúan con la miniatura.
for ext in grand-theft-focus@zalckos.github.com; do
  [ -d "$HOME/.local/share/gnome-shell/extensions/$ext" ] &&
    ln -sfn "$HOME/.local/share/gnome-shell/extensions/$ext" "$XDG_DATA_HOME/gnome-shell/extensions/$ext"
done

PROBE_IMAGE="$TMPROOT/captura.png"
cp "$(ls -t "$HOME/Imágenes/Capturas de pantalla/"*.png | head -1)" "$PROBE_IMAGE"
export PROBE_IMAGE

dbus-run-session -- bash -c '
  gsettings set org.gnome.shell disable-user-extensions false
  gsettings set org.gnome.shell enabled-extensions "[\"screenshot-mactahoe@kevin\", \"probe@screenshot-mactahoe\", \"grand-theft-focus@zalckos.github.com\"]"
  timeout '"$SECS"' gnome-shell --headless --virtual-monitor 1920x1080 --wayland > "'"$TMPROOT"'/shell.log" 2>&1 || true
'
echo "$TMPROOT/shell.log"
