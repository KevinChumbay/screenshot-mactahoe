// Sonda para la sesión anidada: simula una captura, revisa la miniatura,
// abre Gradia con un clic simulado, lo cierra y revisa que vuelva la marcada.
// Escribe líneas "PROBE ..." en el log de gnome-shell.
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const log = msg => console.log(`PROBE ${msg}`);

function later(ms, fn) {
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    try {
      fn();
    } catch (e) {
      log(`ERROR ${e.message}\n${e.stack}`);
    }
    return GLib.SOURCE_REMOVE;
  });
}

function thumbWindow() {
  return global.get_window_actors().map(a => a.meta_window)
    .find(w => w.get_title() === "Miniatura de captura") ?? null;
}

function describe(tag) {
  const w = thumbWindow();
  if (!w) {
    const lm = Main.layoutManager;
  log(`${tag} monitores=${JSON.stringify(lm.monitors.map(m => [m.index, m.x, m.y, m.width, m.height]))} primary=${lm.primaryIndex} actual=${global.display.get_current_monitor()} n=${global.display.get_n_monitors()}`);
  log(`${tag} miniatura=ninguna`);
    return null;
  }
  const r = w.get_frame_rect();
  const wa = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
  const inTabList = global.display.get_tab_list(Meta.TabList.NORMAL, null).includes(w);
  const lm = Main.layoutManager;
  log(`${tag} monitores=${JSON.stringify(lm.monitors.map(m => [m.index, m.x, m.y, m.width, m.height]))} primary=${lm.primaryIndex} actual=${global.display.get_current_monitor()} n=${global.display.get_n_monitors()}`);
  log(`${tag} miniatura=${r.x},${r.y} ${r.width}x${r.height} workarea=${wa.x},${wa.y} ${wa.width}x${wa.height} ` +
    `above=${w.is_above()} skipTaskbar=${w.is_skip_taskbar()} enTabList=${inTabList} foco=${w.has_focus()}`);
  return w;
}

export default class Probe extends Extension {
  enable() {
    const src = GLib.getenv("PROBE_IMAGE");
    log(`inicio imagen=${src}`);
    // Ventana normal con el foco, para ver que la miniatura no se lo quite.
    later(1000, () => {
      const launcher = new imports.gi.Gio.SubprocessLauncher({ flags: 0 });
      this._dummy = Meta.WaylandClient.new_subprocess(global.context, launcher, ["gjs", "-c",
        'imports.gi.versions.Gtk="4.0";const{Gtk,GLib}=imports.gi;Gtk.init();' +
        'const w=new Gtk.Window({title:"Ventana de trabajo"});w.present();new GLib.MainLoop(null,false).run();']);
    });
    later(4000, () => {
      const w = global.get_window_actors().map(a => a.meta_window).find(x => x.get_title() === "Ventana de trabajo");
      w?.activate(global.get_current_time());
      log(`foco-antes=${global.display.focus_window?.get_title()}`);
    });
    later(5000, () => {
      Main.screenshotUI.emit("screenshot-taken", imports.gi.Gio.File.new_for_path(src));
      log("captura simulada");
    });
    later(8000, () => {
      describe("tras-captura");
      log(`foco-despues=${global.display.focus_window?.get_title()}`);
    });
    later(9000, () => {
      // Clic simulado: lo mismo que haría el evento "click" de la ventanita.
      const ext = Main.extensionManager.lookup("screenshot-mactahoe@kevin")?.stateObj;
      ext._dispatch({ type: "openGradia" });
      log(`openGradia estado=${JSON.stringify(ext._state)}`);
    });
    later(12000, () => {
      // Cierre simulado de Gradia con una copia "marcada" (Gradia no corre aislado).
      const ext = Main.extensionManager.lookup("screenshot-mactahoe@kevin")?.stateObj;
      ext._dispatch({ type: "gradiaClosed", editId: ext._state.editId, copy: src, copyExists: true });
      log(`gradiaClosed estado=${ext._state.phase}`);
    });
    later(15000, () => {
      describe("tras-gradia");
      const mimes = imports.gi.St.Clipboard.get_default().get_mimetypes(imports.gi.St.ClipboardType.CLIPBOARD);
      log(`portapapeles=${mimes.join(",")}`);
    });
    later(16000, () => {
      // disable()/enable() directos: disableExtension reiniciaría también esta sonda.
      const ext = Main.extensionManager.lookup("screenshot-mactahoe@kevin")?.stateObj;
      const w = thumbWindow();
      log(`antes-de-deshabilitar pid=${w?.get_pid()}`);
      ext.disable();
      log("deshabilitada");
    });
    later(17500, () => {
      const w = describe("tras-deshabilitar");
      if (w)
        log(`sigue pid=${w.get_pid()} vivo=${GLib.file_test(`/proc/${w.get_pid()}`, GLib.FileTest.EXISTS)}`);
      Main.extensionManager.lookup("screenshot-mactahoe@kevin")?.stateObj.enable();
      Main.screenshotUI.emit("screenshot-taken", imports.gi.Gio.File.new_for_path(src));
    });
    later(20500, () => {
      describe("tras-rehabilitar");
      log("FIN");
    });
  }

  disable() {}
}
