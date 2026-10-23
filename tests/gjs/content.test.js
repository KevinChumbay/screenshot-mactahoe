// gjs -m tests/gjs/content.test.js — necesita display (GTK registra los
// serializadores al iniciarse); no abre ventanas.
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk?version=4.0";
import System from "system";

import { dragContent } from "../../src/helper/content.js";

Gtk.init();
const file = Gio.File.new_for_path("/tmp/captura.png");
const raw = dragContent(file, new GLib.Bytes(new Uint8Array([1, 2, 3])))
  .ref_formats().union_serialize_mime_types().get_mime_types();
// Según la versión de GJS llega como lista o como [lista, n].
const mimes = Array.isArray(raw[0]) ? raw[0] : raw;

let failed = 0;
for (const wanted of ["text/uri-list", "application/vnd.portal.filetransfer", "image/png"]) {
  if (mimes.includes(wanted)) {
    print(`ok - ofrece ${wanted}`);
  } else {
    print(`not ok - no ofrece ${wanted} (ofrece: ${mimes.join(", ")})`);
    failed++;
  }
}
System.exit(failed ? 1 : 0);
