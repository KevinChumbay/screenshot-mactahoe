// Abre una copia de la captura en Gradia y avisa cuando su ventana se cierra.
// Gradia (flatpak) solo puede leer dentro de Imágenes, por eso la copia va ahí.

import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { copyName, staleFiles } from "../lib/cache.js";

const APP_ID = "be.alexandervanhee.gradia";
const WAIT_WINDOW_MS = 20000;

export function cacheDir() {
  return GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES), ".screenshot-mactahoe"]);
}

export class GradiaSession {
  constructor(onDone) {
    this._onDone = onDone;
    this._windowCreatedId = 0;
    this._unmanagedId = 0;
    this._win = null;
    this._timer = 0;
  }

  start(source, editId) {
    this.cancel();
    let copy;
    try {
      copy = this._makeCopy(source);
    } catch (e) {
      console.error(`screenshot-mactahoe: no se pudo copiar para Gradia: ${e.message}`);
      this._onDone({ editId, timeout: true });
      return;
    }

    this._windowCreatedId = global.display.connect("window-created", (_d, win) => {
      if (this._win || !isGradia(win))
        return;
      this._win = win;
      this._clearTimer();
      this._unmanagedId = win.connect("unmanaged", () => {
        this.cancel();
        this._onDone({ editId, copy, copyExists: GLib.file_test(copy, GLib.FileTest.EXISTS) });
      });
    });
    this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WAIT_WINDOW_MS, () => {
      this._timer = 0;
      this.cancel();
      this._onDone({ editId, timeout: true });
      return GLib.SOURCE_REMOVE;
    });

    try {
      Gio.Subprocess.new(["flatpak", "run", APP_ID, `--screenshot-file=${copy}`], Gio.SubprocessFlags.NONE);
    } catch (e) {
      console.error(`screenshot-mactahoe: no se pudo abrir Gradia: ${e.message}`);
      this.cancel();
      this._onDone({ editId, timeout: true });
    }
  }

  cancel() {
    this._clearTimer();
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
      this._windowCreatedId = 0;
    }
    if (this._win && this._unmanagedId)
      this._win.disconnect(this._unmanagedId);
    this._unmanagedId = 0;
    this._win = null;
  }

  destroy() {
    this.cancel();
  }

  _clearTimer() {
    if (this._timer) {
      GLib.source_remove(this._timer);
      this._timer = 0;
    }
  }

  _makeCopy(source) {
    const dir = cacheDir();
    GLib.mkdir_with_parents(dir, 0o700);
    removeStale(dir);
    const copy = GLib.build_filenamev([dir, copyName(GLib.path_get_basename(source), Date.now())]);
    Gio.File.new_for_path(source).copy(Gio.File.new_for_path(copy), Gio.FileCopyFlags.NONE, null, null);
    return copy;
  }
}

function isGradia(win) {
  return win.get_sandboxed_app_id() === APP_ID || win.get_gtk_application_id() === APP_ID;
}

function removeStale(dir) {
  const entries = [];
  const children = Gio.File.new_for_path(dir).enumerate_children("standard::name,time::modified",
    Gio.FileQueryInfoFlags.NONE, null);
  let info;
  while ((info = children.next_file(null)))
    entries.push({ name: info.get_name(), mtimeMs: info.get_modification_date_time().to_unix() * 1000 });
  children.close(null);
  for (const name of staleFiles(entries, Date.now())) {
    try {
      Gio.File.new_for_path(GLib.build_filenamev([dir, name])).delete(null);
    } catch {
      // Si no se puede borrar, se intenta la próxima vez.
    }
  }
}
