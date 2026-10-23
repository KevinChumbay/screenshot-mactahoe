// Contenido del arrastre: el archivo (para apps normales y, vía portal, para
// flatpak/snap) y los bytes PNG (para destinos que solo aceptan imagen).
import Gdk from "gi://Gdk?version=4.0";

export function dragContent(file, bytes) {
  return Gdk.ContentProvider.new_union([
    // Gdk.FileList y no el Gio.File: en GJS el GValue del archivo sale como
    // GLocalFile y GTK no lo sabe serializar (no habría uri-list ni portal).
    Gdk.ContentProvider.new_for_value(Gdk.FileList.new_from_array([file])),
    Gdk.ContentProvider.new_for_bytes("image/png", bytes),
  ]);
}
