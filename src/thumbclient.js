// Lanza la ventanita de la miniatura, la coloca en la esquina y traduce sus
// eventos al flujo. Usa Meta.WaylandClient para poder dejarla siempre encima y
// fuera del Alt+Tab y del dock.

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { swipeReveal } from "../lib/gesture.js";
import { cornerPosition, pickMonitor, THUMB_SHADOW } from "../lib/placement.js";
import { encode, decodeLines } from "../lib/protocol.js";

const ENTER_MS = 220;
const LEAVE_MS = 150;
const FOCUS_GUARD_MS = 1000;
const QUIT_GRACE_MS = 500;
const REVEAL_FADE_MS = 150;

const FLOW_EVENTS = {
  click: "openGradia",
  dismissed: "dismissed",
  expired: "expired",
  dropped: "dropped",
};
const MENU_EVENTS = {
  "open-gradia": "openGradia",
  copy: "copy",
  "show-folder": "showFolder",
  delete: "delete",
};
// Tras estos la ventanita sale sola; su salida no es un fallo.
const TERMINAL_MENU = new Set(["open-gradia", "delete"]);

export class ThumbClient {
  constructor(extensionPath, settings, onEvent) {
    this._helperPath = GLib.build_filenamev([extensionPath, "src", "helper", "thumb.js"]);
    this._settings = settings;
    this._onEvent = onEvent;
    this._proc = null;
    // Todas las ventanitas vivas: una reemplazada puede crear su ventana después.
    this._live = new Set();
    this._windowCreatedId = global.display.connect("window-created", (_d, win) => this._onWindowCreated(win));
    this._focusId = global.display.connect("notify::focus-window", () => this._guardFocus());
  }

  show(path) {
    this.hide();
    const launcher = new Gio.SubprocessLauncher({
      flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
    });
    let client;
    try {
      client = Meta.WaylandClient.new_subprocess(global.context, launcher, ["gjs", "-m", this._helperPath, path]);
    } catch (e) {
      console.error(`screenshot-mactahoe: no se pudo lanzar la miniatura: ${e.message}`);
      this._onEvent({ type: "helperExited" });
      return;
    } finally {
      // El launcher guarda una copia del socket de Wayland del hijo; sin cerrarlo,
      // si el proceso muere su ventana queda colgada en pantalla.
      launcher.close();
    }
    const proc = {
      client,
      subprocess: client.get_subprocess(),
      cancellable: new Gio.Cancellable(),
      win: null,
      size: null,
      createdAt: 0,
      prevFocus: global.display.focus_window,
      terminal: false,
      shown: false,
      placed: false,
      quitTimer: 0,
    };
    this._proc = proc;
    this._live.add(proc);
    this._readEvents(proc);
    proc.subprocess.wait_async(null, () => this._onExit(proc));
  }

  hide() {
    const proc = this._proc;
    if (!proc)
      return;
    this._proc = null;
    proc.terminal = true;
    this._write(proc, { cmd: "quit" });
    proc.quitTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, QUIT_GRACE_MS, () => {
      proc.quitTimer = 0;
      proc.subprocess.force_exit();
      return GLib.SOURCE_REMOVE;
    });
  }

  destroy() {
    global.display.disconnect(this._windowCreatedId);
    global.display.disconnect(this._focusId);
    this._proc = null;
    for (const proc of this._live) {
      proc.terminal = true;
      proc.reveal?.destroy();
      proc.reveal = null;
      if (proc.quitTimer)
        GLib.source_remove(proc.quitTimer);
      proc.quitTimer = 0;
      proc.cancellable.cancel();
      proc.subprocess.force_exit();
    }
    this._live.clear();
  }

  _write(proc, msg) {
    try {
      const stdin = proc.subprocess.get_stdin_pipe();
      stdin.write_all(new TextEncoder().encode(encode(msg)), null);
      stdin.flush(null);
    } catch {
      // Ya salió.
    }
  }

  _readEvents(proc) {
    const input = new Gio.DataInputStream({ base_stream: proc.subprocess.get_stdout_pipe() });
    let rest = "";
    const readNext = () => {
      input.read_line_async(GLib.PRIORITY_DEFAULT, proc.cancellable, (stream, res) => {
        let line;
        try {
          [line] = stream.read_line_finish_utf8(res);
        } catch {
          return;
        }
        if (line === null)
          return;
        const decoded = decodeLines(`${rest}${line}\n`);
        rest = decoded.rest;
        for (const msg of decoded.messages)
          this._onMessage(proc, msg);
        readNext();
      });
    };
    readNext();
  }

  _onMessage(proc, msg) {
    if (proc !== this._proc)
      return;
    switch (msg.event) {
    case "ready":
      proc.size = { width: msg.width, height: msg.height };
      this._place(proc);
      return;
    case "swipe":
      this._actor(proc)?.set_translation(msg.dx, 0, 0);
      this._updateReveal(proc, msg.dx);
      return;
    case "menu":
      if (TERMINAL_MENU.has(msg.action))
        proc.terminal = true;
      if (MENU_EVENTS[msg.action])
        this._onEvent({ type: MENU_EVENTS[msg.action] });
      return;
    case "error":
      console.error(`screenshot-mactahoe: la miniatura falló: ${msg.message}`);
      proc.terminal = true;
      this._proc = null;
      this._onEvent({ type: "helperExited" });
      return;
    default:
      if (!FLOW_EVENTS[msg.event])
        return;
      proc.terminal = true;
      this._proc = null;
      if (msg.event === "dismissed")
        this._slideOut(proc);
      this._onEvent({ type: FLOW_EVENTS[msg.event] });
    }
  }

  _onExit(proc) {
    this._live.delete(proc);
    this._hideReveal(proc);
    if (proc.quitTimer) {
      GLib.source_remove(proc.quitTimer);
      proc.quitTimer = 0;
    }
    proc.cancellable.cancel();
    if (proc !== this._proc)
      return;
    this._proc = null;
    if (!proc.terminal)
      this._onEvent({ type: "helperExited" });
  }

  _onWindowCreated(win) {
    const proc = [...this._live].find(p => !p.win && p.client.owns_window(win));
    if (!proc)
      return;
    proc.win = win;
    proc.createdAt = GLib.get_monotonic_time();
    win.hide_from_window_list();
    win.make_above();
    win.stick();
    if (proc !== this._proc) {
      // Ya reemplazada: que no se vea mientras se cierra.
      win.get_compositor_private()?.hide();
      return;
    }
    // Mutter coloca la ventana al mostrarla por primera vez; moverla antes no sirve.
    const shownId = win.connect("shown", () => {
      win.disconnect(shownId);
      proc.shown = true;
      this._place(proc);
    });
  }

  _place(proc) {
    const { win } = proc;
    if (!win || !proc.size || !proc.shown || proc.placed || Main.layoutManager.monitors.length === 0)
      return;
    proc.placed = true;
    const rect = win.get_frame_rect();
    const size = rect.width > 0 ? { width: rect.width, height: rect.height } : proc.size;
    proc.size = size;
    const setting = this._settings.get_string("monitor");
    const connectorIndex = setting === "primary" || setting === "pointer"
      ? -1
      : global.backend.get_monitor_manager().get_monitor_for_connector(setting);
    const index = pickMonitor(setting, connectorIndex, Main.layoutManager.primaryIndex,
      global.display.get_current_monitor());
    const { x, y } = cornerPosition(Main.layoutManager.getWorkAreaForMonitor(index), size);
    win.move_frame(true, x, y);

    const actor = this._actor(proc);
    if (actor) {
      actor.translation_x = size.width + 16;
      actor.ease({ translation_x: 0, duration: ENTER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }
  }

  _slideOut(proc) {
    const actor = this._actor(proc);
    if (actor && proc.size)
      actor.ease({ translation_x: proc.size.width + 16, duration: LEAVE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD });
    this._hideReveal(proc, LEAVE_MS);
  }

  // Fondo con ✕ que asoma detrás de la miniatura al deslizarla a la derecha.
  // Queda quieto en el lugar de la miniatura mientras la ventana se desplaza.
  _updateReveal(proc, dx) {
    const { opacity, armed } = swipeReveal(dx);
    if (opacity === 0) {
      this._hideReveal(proc);
      return;
    }
    const actor = this._actor(proc);
    if (!actor)
      return;
    if (!proc.reveal) {
      const rect = proc.win.get_frame_rect();
      proc.reveal = new St.Bin({
        style_class: "smt-swipe-reveal",
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        child: new St.Icon({ icon_name: "window-close-symbolic", style_class: "smt-swipe-reveal-icon" }),
        x: rect.x + THUMB_SHADOW,
        y: rect.y + THUMB_SHADOW,
        width: rect.width - THUMB_SHADOW * 2,
        height: rect.height - THUMB_SHADOW * 2,
      });
      global.window_group.add_child(proc.reveal);
      global.window_group.set_child_below_sibling(proc.reveal, actor);
    }
    proc.reveal.remove_all_transitions();
    proc.reveal.opacity = opacity;
    if (armed)
      proc.reveal.add_style_pseudo_class("armed");
    else
      proc.reveal.remove_style_pseudo_class("armed");
  }

  _hideReveal(proc, delayMs = 0) {
    const reveal = proc.reveal;
    if (!reveal)
      return;
    proc.reveal = null;
    reveal.ease({
      opacity: 0,
      delay: delayMs,
      duration: REVEAL_FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onStopped: () => reveal.destroy(),
    });
  }

  _actor(proc) {
    return proc.win?.get_compositor_private() ?? null;
  }

  // grand-theft-focus le da el foco a las ventanas nuevas: si la miniatura lo
  // recibe justo al aparecer, se lo devolvemos a la ventana anterior.
  _guardFocus() {
    const proc = [...this._live].find(p => p.win && p.win === global.display.focus_window);
    if (!proc)
      return;
    const sinceCreated = (GLib.get_monotonic_time() - proc.createdAt) / 1000;
    if (sinceCreated < FOCUS_GUARD_MS && proc.prevFocus && proc.prevFocus !== proc.win)
      proc.prevFocus.activate(global.get_current_time());
  }
}
