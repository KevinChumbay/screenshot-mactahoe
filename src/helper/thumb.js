// Ventanita de la miniatura: muestra una captura y es el origen del arrastre.
// Uso: gjs -m src/helper/thumb.js <ruta.png>
// Habla con la extensión por JSON en líneas: eventos por stdout, órdenes por stdin.

import Adw from "gi://Adw?version=1";
import Gdk from "gi://Gdk?version=4.0";
import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import System from "system";

import { fitThumb } from "../../lib/placement.js";
import { isDismissSwipe } from "../../lib/gesture.js";
import { encode, decodeLines } from "../../lib/protocol.js";

const VISIBLE_MS = 6000;
const SHADOW = 24;
const FADE_MS = 150;
const TERMINAL = new Set(["click", "dismissed", "expired", "dropped", "error"]);

const stdout = new GioUnix.OutputStream({ fd: 1, closeFd: false });

function send(msg) {
  try {
    stdout.write_all(new TextEncoder().encode(encode(msg)), null);
    stdout.flush(null);
  } catch {
    // La extensión ya no escucha.
  }
}

class Thumb {
  constructor(app, path) {
    this._app = app;
    this._file = Gio.File.new_for_path(path);
    this._finished = false;
    this._timer = 0;
    this._swiping = false;
    this._dragCancelled = false;
  }

  start() {
    let texture;
    try {
      texture = Gdk.Texture.new_from_file(this._file);
    } catch (e) {
      this._fail(e.message);
      return;
    }
    this._bytes = this._file.load_bytes(null)[0];

    const { width, height } = fitThumb(texture.get_width(), texture.get_height());
    this._size = { width: width + SHADOW * 2, height: height + SHADOW * 2 };

    const css = new Gtk.CssProvider();
    css.load_from_path(GLib.build_filenamev([GLib.path_get_dirname(import.meta.url.replace("file://", "")), "thumb.css"]));
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

    const picture = new Gtk.Picture({ paintable: texture, content_fit: Gtk.ContentFit.COVER, can_shrink: true });
    picture.set_size_request(width, height);
    this._frame = new Gtk.Box({ margin_top: SHADOW, margin_bottom: SHADOW, margin_start: SHADOW, margin_end: SHADOW });
    this._frame.add_css_class("thumb-frame");
    this._frame.set_overflow(Gtk.Overflow.HIDDEN);
    this._frame.append(picture);

    this._window = new Gtk.Window({
      application: this._app,
      title: "Miniatura de captura",
      decorated: false,
      resizable: false,
      child: this._frame,
      default_width: this._size.width,
      default_height: this._size.height,
    });
    this._window.add_css_class("thumb-window");
    const styles = Adw.StyleManager.get_default();
    const syncDark = () => {
      if (styles.dark)
        this._window.add_css_class("dark");
      else
        this._window.remove_css_class("dark");
    };
    syncDark();
    styles.connect("notify::dark", syncDark);

    this._setupHover();
    this._setupGestures();
    this._setupMenu();
    this._listenStdin();

    this._window.connect("map", () => {
      send({ event: "ready", ...this._size });
      this._restartTimer();
    });
    this._window.connect("close-request", () => {
      this._finish(null);
      return true;
    });
    this._window.present();
  }

  _setupHover() {
    const motion = new Gtk.EventControllerMotion();
    motion.connect("enter", () => this._stopTimer());
    motion.connect("leave", () => {
      if (!this._menuOpen)
        this._restartTimer();
    });
    this._window.add_controller(motion);
  }

  _setupGestures() {
    // Arrastre horizontal hacia la derecha = descartar; cualquier otra
    // dirección arrastra el archivo. Se decide con el primer movimiento.
    const swipe = new Gtk.GestureDrag({ button: Gdk.BUTTON_PRIMARY });
    swipe.connect("drag-begin", () => {
      this._swiping = false;
      this._swipeStart = GLib.get_monotonic_time();
    });
    swipe.connect("drag-update", (_g, dx, dy) => {
      if (!this._swiping && dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.5)
        this._swiping = true;
      if (this._swiping) {
        const shift = Math.max(0, dx);
        this._frame.set_opacity(Math.max(0.3, 1 - shift / 240));
        send({ event: "swipe", dx: Math.round(shift) });
      }
    });
    swipe.connect("drag-end", (_g, dx) => {
      if (!this._swiping)
        return;
      this._swiping = false;
      const secs = Math.max(0.001, (GLib.get_monotonic_time() - this._swipeStart) / 1e6);
      if (isDismissSwipe(dx, dx / secs)) {
        this._finish("dismissed");
      } else {
        this._frame.set_opacity(1);
        send({ event: "swipe", dx: 0 });
      }
    });
    this._frame.add_controller(swipe);

    const source = new Gtk.DragSource({ actions: Gdk.DragAction.COPY });
    source.connect("prepare", () => {
      if (this._swiping)
        return null;
      return Gdk.ContentProvider.new_union([
        Gdk.ContentProvider.new_for_value(this._file),
        Gdk.ContentProvider.new_for_bytes("image/png", this._bytes),
      ]);
    });
    source.connect("drag-begin", () => {
      this._dragCancelled = false;
      this._stopTimer();
      const [w, h] = [this._size.width - SHADOW * 2, this._size.height - SHADOW * 2];
      source.set_icon(new Gtk.WidgetPaintable({ widget: this._frame }), Math.round(w / 2), Math.round(h / 2));
      this._frame.set_opacity(0.4);
    });
    source.connect("drag-cancel", () => {
      this._dragCancelled = true;
      return false;
    });
    source.connect("drag-end", () => {
      if (this._dragCancelled) {
        this._frame.set_opacity(1);
        this._restartTimer();
      } else {
        this._finish("dropped");
      }
    });
    this._frame.add_controller(source);

    const click = new Gtk.GestureClick({ button: Gdk.BUTTON_PRIMARY });
    click.connect("released", (_g, nPress) => {
      if (nPress === 1 && !this._swiping)
        this._finish("click");
    });
    this._frame.add_controller(click);
  }

  _setupMenu() {
    const menu = new Gio.Menu();
    menu.append("Abrir en Gradia", "thumb.open-gradia");
    menu.append("Copiar", "thumb.copy");
    menu.append("Mostrar en carpeta", "thumb.show-folder");
    menu.append("Borrar", "thumb.delete");

    const group = new Gio.SimpleActionGroup();
    for (const name of ["open-gradia", "copy", "show-folder", "delete"]) {
      const action = new Gio.SimpleAction({ name });
      action.connect("activate", () => this._onMenu(name));
      group.add_action(action);
    }
    this._window.insert_action_group("thumb", group);

    const popover = Gtk.PopoverMenu.new_from_model(menu);
    popover.set_parent(this._frame);
    popover.set_has_arrow(false);
    popover.connect("closed", () => {
      this._menuOpen = false;
      this._restartTimer();
    });

    const right = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY });
    right.connect("pressed", (_g, _n, x, y) => {
      this._menuOpen = true;
      this._stopTimer();
      const rect = new Gdk.Rectangle({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 });
      popover.set_pointing_to(rect);
      popover.popup();
    });
    this._frame.add_controller(right);
  }

  _onMenu(action) {
    send({ event: "menu", action });
    if (action === "open-gradia" || action === "delete")
      this._finish(null);
  }

  _listenStdin() {
    const input = new Gio.DataInputStream({
      base_stream: new GioUnix.InputStream({ fd: 0, closeFd: false }),
    });
    let rest = "";
    const readNext = () => {
      input.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
        let line;
        try {
          [line] = stream.read_line_finish_utf8(res);
        } catch {
          line = null;
        }
        if (line === null) {
          // stdin cerrado: la extensión se fue.
          this._finish(null);
          return;
        }
        const decoded = decodeLines(`${rest}${line}\n`);
        rest = decoded.rest;
        for (const msg of decoded.messages) {
          if (msg.cmd === "quit")
            this._finish(null);
        }
        readNext();
      });
    };
    readNext();
  }

  _restartTimer() {
    this._stopTimer();
    if (this._finished)
      return;
    this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, VISIBLE_MS, () => {
      this._timer = 0;
      this._finish("expired");
      return GLib.SOURCE_REMOVE;
    });
  }

  _stopTimer() {
    if (this._timer) {
      GLib.source_remove(this._timer);
      this._timer = 0;
    }
  }

  _fail(message) {
    send({ event: "error", message });
    this._finished = true;
    this._app.quit();
  }

  // Manda el evento terminal (si hay), se desvanece y sale.
  _finish(event) {
    if (this._finished)
      return;
    this._finished = true;
    this._stopTimer();
    if (event && TERMINAL.has(event))
      send({ event });
    const target = Adw.CallbackAnimationTarget.new(v => this._window.set_opacity(v));
    const fade = new Adw.TimedAnimation({
      widget: this._window, value_from: this._window.get_opacity(), value_to: 0,
      duration: FADE_MS, target,
    });
    fade.connect("done", () => this._app.quit());
    fade.play();
  }
}

const path = ARGV[0];
const app = new Adw.Application({
  application_id: "io.github.kevin.ScreenshotMacTahoe.Thumb",
  flags: Gio.ApplicationFlags.NON_UNIQUE,
});
let thumb = null;
app.connect("activate", () => {
  if (thumb)
    return;
  if (!path) {
    send({ event: "error", message: "falta la ruta de la imagen" });
    app.quit();
    return;
  }
  thumb = new Thumb(app, path);
  thumb.start();
});
System.exit(app.run([System.programInvocationName]));
