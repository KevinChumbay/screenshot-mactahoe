// Abre una copia de la captura en Gradia y avisa cuando su ventana se cierra.
// Gradia (flatpak) solo puede leer dentro de Imágenes, por eso la copia va ahí.

import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { copyName, staleFiles } from "../lib/cache.js";
import { fileEventKind, initialWatch, stepWatch } from "../lib/gradiawatch.js";

const APP_ID = "be.alexandervanhee.gradia";
const WAIT_WINDOW_MS = 20000;
const SAVE_WAIT_MS = 5000;

const EVENT_NAMES = {
  [Gio.FileMonitorEvent.CHANGES_DONE_HINT]: "changes-done-hint",
  [Gio.FileMonitorEvent.DELETED]: "deleted",
  [Gio.FileMonitorEvent.RENAMED]: "renamed",
  [Gio.FileMonitorEvent.MOVED_IN]: "moved-in",
  [Gio.FileMonitorEvent.MOVED_OUT]: "moved-out",
};

export function cacheDir() {
  return GLib.build_filenamev([GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES), ".screenshot-mactahoe"]);
}

export class GradiaSession {
  constructor(onDone) {
    this._onDone = onDone;
    this._session = null;
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

    const session = { editId, copy, watch: initialWatch(), win: null, unmanagedId: 0, saveTimer: 0 };
    this._session = session;

    session.windowCreatedId = global.display.connect("window-created", (_d, win) => {
      if (session.win || !isGradia(win))
        return;
      session.win = win;
      session.unmanagedId = win.connect("unmanaged", () => {
        win.disconnect(session.unmanagedId);
        session.win = null;
        session.unmanagedId = 0;
        this._step(session, { type: "unmanaged" });
      });
      this._step(session, { type: "windowCreated" });
    });

    session.monitor = Gio.File.new_for_path(cacheDir()).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    const copyBase = GLib.path_get_basename(copy);
    session.monitorId = session.monitor.connect("changed", (_m, file, other, eventType) => {
      const kind = fileEventKind(eventName(eventType), file?.get_basename() ?? null,
        other?.get_basename() ?? null, copyBase);
      if (kind === "saved")
        this._step(session, { type: "fileSaved" });
      else if (kind === "gone")
        this._step(session, { type: "fileGone" });
    });

    session.windowTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WAIT_WINDOW_MS, () => {
      session.windowTimer = 0;
      this._step(session, { type: "windowTimeout" });
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
    const session = this._session;
    if (!session)
      return;
    this._session = null;
    for (const timer of [session.windowTimer, session.saveTimer]) {
      if (timer)
        GLib.source_remove(timer);
    }
    global.display.disconnect(session.windowCreatedId);
    if (session.win && session.unmanagedId)
      session.win.disconnect(session.unmanagedId);
    session.monitor.disconnect(session.monitorId);
    session.monitor.cancel();
  }

  destroy() {
    this.cancel();
  }

  _step(session, event) {
    if (session !== this._session)
      return;
    const { watch, result } = stepWatch(session.watch, event);
    session.watch = watch;
    if (result) {
      this.cancel();
      this._onDone(result.timeout
        ? { editId: session.editId, timeout: true }
        : { editId: session.editId, copy: session.copy, copyExists: result.copyExists });
      return;
    }
    // Ventana cerrada sin guardado todavía: Gradia guarda justo después; si no
    // llega nada en SAVE_WAIT_MS, se decide por si la copia existe.
    if (event.type === "unmanaged" && watch.phase === "closing" && !session.saveTimer) {
      session.saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_WAIT_MS, () => {
        session.saveTimer = 0;
        this._step(session, { type: "saveTimeout", exists: GLib.file_test(session.copy, GLib.FileTest.EXISTS) });
        return GLib.SOURCE_REMOVE;
      });
    } else if (event.type === "windowCreated" && session.saveTimer) {
      GLib.source_remove(session.saveTimer);
      session.saveTimer = 0;
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

function eventName(eventType) {
  return EVENT_NAMES[eventType] ?? null;
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
