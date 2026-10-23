// Efectos sueltos del flujo: portapapeles, mostrar en carpeta y papelera.
// Un fallo se registra y nada más: nunca debe romper GNOME Shell.

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

export function runEffect(effect) {
  try {
    switch (effect.type) {
    case "clipboard":
      copyImage(effect.path);
      break;
    case "showInFolder":
      showInFolder(effect.path);
      break;
    case "trash":
      Gio.File.new_for_path(effect.path).trash_async(GLib.PRIORITY_DEFAULT, null, (file, res) => {
        try {
          file.trash_finish(res);
        } catch (e) {
          console.error(`screenshot-mactahoe: no se pudo mandar a la papelera: ${e.message}`);
        }
      });
      break;
    }
  } catch (e) {
    console.error(`screenshot-mactahoe: falló ${effect.type}: ${e.message}`);
  }
}

function copyImage(path) {
  const [, contents] = Gio.File.new_for_path(path).load_contents(null);
  St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, "image/png", new GLib.Bytes(contents));
}

function showInFolder(path) {
  Gio.DBus.session.call("org.freedesktop.FileManager1", "/org/freedesktop/FileManager1",
    "org.freedesktop.FileManager1", "ShowItems",
    new GLib.Variant("(ass)", [[Gio.File.new_for_path(path).get_uri()], ""]),
    null, Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
      try {
        conn.call_finish(res);
      } catch (e) {
        console.error(`screenshot-mactahoe: no se pudo mostrar en carpeta: ${e.message}`);
      }
    });
}
