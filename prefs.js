import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class ScreenshotMacTahoePrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const options = [
      { value: "primary", label: "Principal" },
      { value: "pointer", label: "Donde está el puntero" },
    ];
    const monitors = Gdk.Display.get_default().get_monitors();
    for (let i = 0; i < monitors.get_n_items(); i++) {
      const monitor = monitors.get_item(i);
      const connector = monitor.get_connector();
      if (connector)
        options.push({ value: connector, label: `${monitor.get_description() ?? connector} (${connector})` });
    }
    const current = settings.get_string("monitor");
    if (!options.some(o => o.value === current))
      options.push({ value: current, label: `${current} (desconectado)` });

    const row = new Adw.ComboRow({
      title: "Monitor de la miniatura",
      subtitle: "Dónde aparece la miniatura después de cada captura",
      model: Gtk.StringList.new(options.map(o => o.label)),
      selected: options.findIndex(o => o.value === current),
    });
    row.connect("notify::selected", () => {
      const option = options[row.selected];
      if (option)
        settings.set_string("monitor", option.value);
    });

    const group = new Adw.PreferencesGroup({ title: "Miniatura" });
    group.add(row);
    const page = new Adw.PreferencesPage();
    page.add(group);
    window.add(page);
  }
}
