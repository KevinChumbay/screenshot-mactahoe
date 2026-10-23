# Screenshot MacTahoe — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Miniatura flotante tipo macOS tras cada captura de GNOME: arrastrable a otras apps, clic → Gradia, vuelve con la versión marcada.

**Architecture:** La extensión de GNOME Shell escucha `Main.screenshotUI` (`screenshot-taken`), maneja el flujo con un reductor puro (`lib/flow.js`) y lanza una ventanita GTK4 (GJS) con `Meta.WaylandClient.new_subprocess`. Así la puede colocar en la esquina, dejarla siempre encima y ocultarla del Alt+Tab y del dock. La ventanita es el origen del arrastre y habla con la extensión por JSON en líneas (stdout: eventos; stdin: órdenes). Gradia edita una copia en `~/Imágenes/.screenshot-mactahoe/`. Cuando su ventana se cierra, la miniatura vuelve con esa copia.

**Tech Stack:** GJS ESM (GNOME Shell 50, Mutter 18, GTK 4, Adw para prefs), `node --test` para `lib/`, bash para instalar.

**Spec:** `docs/superpowers/specs/2026-10-23-screenshot-mactahoe-design.md`

## Global Constraints

- `shell-version: ["49", "50"]`; UUID `screenshot-mactahoe@kevin`; esquema `org.gnome.shell.extensions.screenshot-mactahoe`.
- Sin dependencias externas. Lógica pura en `lib/` (sin `gi://`), probada con `node --test`; GJS en `src/`.
- JS plano, 2 espacios, comillas dobles; textos visibles y comentarios en español.
- La extensión **nunca** modifica la configuración de Gradia: solo lo hacen `install.sh`/`uninstall.sh`.
- El original en `~/Imágenes/Capturas de pantalla` **nunca** se modifica. Solo se manda a la papelera con "Borrar" del menú.
- La copia para Gradia vive en `<XDG_PICTURES_DIR>/.screenshot-mactahoe/`. Gradia (flatpak) solo tiene permiso `xdg-pictures`, así que `~/.cache` no sirve.
- Miniatura: visible 6000 ms; con el puntero encima se pausa; al salir el puntero vuelve a empezar. Cabe en 200×200 px conservando la proporción. Margen de 16 px a la esquina inferior derecha del área de trabajo.
- Sesiones de prueba aisladas: exportar `XDG_CONFIG_HOME`, `XDG_DATA_HOME` y `XDG_RUNTIME_DIR` **antes** de `dbus-run-session -- gnome-shell --devkit --wayland`.
- Sin sondeos ni procesos residentes: la ventanita solo existe mientras hay miniatura.

## Review Focus

1. **Captura nueva con Gradia abierto:** la miniatura nueva aparece. Al cerrar Gradia después, la edición vieja **no** reemplaza a la nueva. → test en Task 2 (`editId` obsoleto se ignora).
2. **La copia no existe al cerrar Gradia** (alguien reactivó `trash-screenshots-on-close`): vuelve la miniatura con la imagen previa a la edición, nunca vacía. → test en Task 2.
3. **Gradia nunca abre una ventana** (falla `flatpak run`, Gradia no instalado): a los 20 s vuelve la miniatura previa. → test en Task 2 (`gradiaTimeout`) + ejecutor en Task 4.
4. **El monitor configurado está desconectado** (conector que ya no existe): se usa el principal. → test en Task 1.
5. **La ventanita muere de forma inesperada** (crash, archivo borrado antes de mostrarse): el flujo vuelve a `idle` sin excepciones, y la siguiente captura funciona. → test en Task 2 (`helperExited`) + manejo de `error` en Task 3.

---

### Task 1: Esqueleto y geometría pura

**Files:**
- Create: `package.json`, `.gitignore`, `metadata.json`, `lib/placement.js`, `lib/gesture.js`
- Test: `tests/placement.test.js`, `tests/gesture.test.js`

**Interfaces:**
- Produces:
  - `fitThumb(imgW: number, imgH: number, max = 200) -> {width, height}` (enteros; nunca agranda imágenes menores que `max`).
  - `cornerPosition(workArea: {x, y, width, height}, size: {width, height}, margin = 16) -> {x, y}` (esquina inferior derecha).
  - `pickMonitor(setting: string, connectorIndex: number, primaryIndex: number, pointerIndex: number) -> number`. `setting` es `"primary"`, `"pointer"` o un conector (`"HDMI-1"`); `connectorIndex` es el índice que devuelve Mutter para ese conector, o `-1`.
  - `isDismissSwipe(dx: number, velocityX: number) -> boolean` (en `lib/gesture.js`).

- [ ] **Step 1:** Copiar `package.json` y `.gitignore` de `~/Github/media-mactahoe`. `metadata.json` con uuid, `name: "Screenshot MacTahoe"`, descripción en español, `shell-version ["49","50"]` y `settings-schema`.
- [ ] **Step 2: Tests que fallan**

```js
// tests/placement.test.js
assert.deepEqual(fitThumb(1920, 1080), { width: 200, height: 113 });
assert.deepEqual(fitThumb(400, 1600), { width: 50, height: 200 });
assert.deepEqual(fitThumb(120, 80), { width: 120, height: 80 });
assert.deepEqual(cornerPosition({ x: 1920, y: 0, width: 2560, height: 1400 }, { width: 248, height: 161 }),
  { x: 1920 + 2560 - 248 - 16, y: 1400 - 161 - 16 });
assert.equal(pickMonitor("primary", -1, 0, 1), 0);
assert.equal(pickMonitor("pointer", -1, 0, 1), 1);
assert.equal(pickMonitor("HDMI-1", 1, 0, 0), 1);
assert.equal(pickMonitor("HDMI-1", -1, 0, 1), 0); // desconectado → principal
// tests/gesture.test.js
assert.equal(isDismissSwipe(90, 0), true);
assert.equal(isDismissSwipe(30, 700), true);
assert.equal(isDismissSwipe(30, 100), false);
assert.equal(isDismissSwipe(-120, -900), false); // hacia la izquierda no descarta
```

- [ ] **Step 3:** `npm test` → FAIL (módulos inexistentes).
- [ ] **Step 4:** Implementar. Umbrales del swipe: `dx > 80 || (dx > 20 && velocityX > 600)`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Commit `feat: esqueleto y geometría de la miniatura` (incluye el spec y este plan).

### Task 2: Flujo, protocolo y caché (lógica pura)

**Files:**
- Create: `lib/flow.js`, `lib/protocol.js`, `lib/cache.js`
- Test: `tests/flow.test.js`, `tests/protocol.test.js`, `tests/cache.test.js`

**Interfaces:**
- Produces:
  - `initialState() -> {phase: "idle", original: null, current: null, editId: 0}`
  - `reduce(state, event) -> {state, effects: Effect[]}`. Eventos:
    - `{type:"screenshot", path}`
    - `{type:"openGradia"}`, `{type:"copy"}`, `{type:"showFolder"}`, `{type:"delete"}`
    - `{type:"dismissed"}`, `{type:"expired"}`, `{type:"dropped"}`, `{type:"helperExited"}`
    - `{type:"gradiaClosed", editId, copy, copyExists}`, `{type:"gradiaTimeout", editId}`

    Efectos:
    - `{type:"show", path}`, `{type:"hide"}`
    - `{type:"launchGradia", source, editId}`
    - `{type:"clipboard", path}`, `{type:"showInFolder", path}`, `{type:"trash", path}`
  - `encode(obj) -> string` (JSON + `"\n"`); `decodeLines(buffer: string) -> {messages: object[], rest: string}`. Las líneas inválidas se descartan sin lanzar error.
  - `copyName(originalBasename: string, nowMs: number) -> string` → `"<stem>-marcada-<nowMs>.png"`; `staleFiles(entries: {name, mtimeMs}[], nowMs, maxAgeMs = 86400000) -> string[]`.

- [ ] **Step 1: Tests que fallan** (`tests/flow.test.js`, un `test()` por caso):

```js
let { state, effects } = reduce(initialState(), { type: "screenshot", path: "/a.png" });
assert.equal(state.phase, "showing");
assert.deepEqual(effects, [{ type: "show", path: "/a.png" }]);

// captura nueva reemplaza (fase showing)
({ state, effects } = reduce(state, { type: "screenshot", path: "/b.png" }));
assert.equal(state.current, "/b.png");
assert.deepEqual(effects, [{ type: "show", path: "/b.png" }]);

// abrir en Gradia
const s1 = reduce(state, { type: "openGradia" });
assert.equal(s1.state.phase, "editing");
assert.deepEqual(s1.effects, [{ type: "hide" }, { type: "launchGradia", source: "/b.png", editId: s1.state.editId }]);

// cierre con copia → versión marcada + portapapeles
const s2 = reduce(s1.state, { type: "gradiaClosed", editId: s1.state.editId, copy: "/c.png", copyExists: true });
assert.equal(s2.state.current, "/c.png");
assert.equal(s2.state.original, "/b.png");
assert.deepEqual(s2.effects, [{ type: "show", path: "/c.png" }, { type: "clipboard", path: "/c.png" }]);

// Review Focus 2: copia ausente → imagen previa
const s3 = reduce(s1.state, { type: "gradiaClosed", editId: s1.state.editId, copy: "/c.png", copyExists: false });
assert.deepEqual(s3.effects, [{ type: "show", path: "/b.png" }]);

// Review Focus 3: timeout → imagen previa
assert.deepEqual(reduce(s1.state, { type: "gradiaTimeout", editId: s1.state.editId }).effects, [{ type: "show", path: "/b.png" }]);

// Review Focus 1: captura durante la edición; el cierre viejo se ignora
const s4 = reduce(s1.state, { type: "screenshot", path: "/n.png" });
const s5 = reduce(s4.state, { type: "gradiaClosed", editId: s1.state.editId, copy: "/c.png", copyExists: true });
assert.equal(s5.state.current, "/n.png");
assert.deepEqual(s5.effects, []);

// borrar → papelera del original, nunca de la copia
const s6 = reduce(s2.state, { type: "delete" });
assert.equal(s6.state.phase, "idle");
assert.deepEqual(s6.effects, [{ type: "hide" }, { type: "trash", path: "/b.png" }]);

// copiar usa la vigente; mostrar en carpeta usa el original
assert.deepEqual(reduce(s2.state, { type: "copy" }).effects, [{ type: "clipboard", path: "/c.png" }]);
assert.deepEqual(reduce(s2.state, { type: "showFolder" }).effects, [{ type: "showInFolder", path: "/b.png" }]);

// Review Focus 5 y cierres normales: dismissed/expired/dropped/helperExited en showing → idle, sin efectos
for (const type of ["dismissed", "expired", "dropped", "helperExited"])
  assert.deepEqual(reduce(s2.state, { type }), { state: { ...s2.state, phase: "idle" }, effects: [] });

// helperExited durante la edición no la interrumpe (la ventanita se cerró a propósito)
assert.equal(reduce(s1.state, { type: "helperExited" }).state.phase, "editing");
```

Más `tests/protocol.test.js`:
- `decodeLines('{"event":"click"}\n{"ev')` → un mensaje y `rest: '{"ev'`.
- Una línea `basura` se omite.

Más `tests/cache.test.js`:
- `copyName("Captura desde 2026-10-23 10-00-00.png", 5)` → `"Captura desde 2026-10-23 10-00-00-marcada-5.png"`.
- `staleFiles` devuelve solo los nombres con `nowMs - mtimeMs > maxAgeMs`.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar los tres módulos. Reglas que los tests no cubren:
  - Eventos que no aplican a la fase actual devuelven `{state, effects: []}` sin cambios.
  - `editId` se incrementa en cada `openGradia` y en cada `screenshot`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: flujo de la miniatura, protocolo y caché`.

### Task 3: Ventanita GTK4 (`src/helper/thumb.js`)

Se ejecuta como `gjs -m src/helper/thumb.js <ruta.png>`. Funciona sola (sin la extensión), así que el arrastre se prueba en la sesión real.

**Files:**
- Create: `src/helper/thumb.js`, `src/helper/thumb.css`

**Interfaces:**
- Consumes: `fitThumb`, `isDismissSwipe` (importa `../../lib/*.js` con rutas relativas a `import.meta.url`); `encode`, `decodeLines`.
- Produces, por stdout (una línea JSON por evento):
  - `{"event":"ready","width":W,"height":H}`: tamaño total de la ventana, sombra incluida.
  - `{"event":"click"}`
  - `{"event":"menu","action":"open-gradia"|"copy"|"show-folder"|"delete"}`
  - `{"event":"dismissed"}`, `{"event":"expired"}`, `{"event":"dropped"}`
  - `{"event":"error","message":string}`

  Después de `dismissed`, `expired`, `dropped`, `click`, `menu/open-gradia`, `menu/delete` y `error`, el proceso termina solo (fundido de 150 ms antes de salir; con `error`, sale enseguida).
- Por stdin acepta: `{"cmd":"quit"}`.

- [ ] **Step 1:** Ventana `Adw.Application` (id `io.github.kevin.ScreenshotMacTahoe.Thumb`, flag `NON_UNIQUE`):
  - Sin decoración, fondo transparente.
  - Un `Gtk.Picture` de `fitThumb(...)` con radio de 12 px y sombra (margen de 24 px para la sombra).
  - Clase CSS distinta para claro u oscuro, según `Adw.StyleManager`.
  - Si el archivo no existe o no carga, emitir `error` y salir.
  - Al mostrarse, emitir `ready` con el tamaño final.
- [ ] **Step 2: Temporizador.** 6000 ms. `Gtk.EventControllerMotion`: `enter` lo pausa; `leave` lo reinicia completo. Al vencer → `expired`.
- [ ] **Step 3: Arrastre.**
  - `Gtk.DragSource` con `Gdk.ContentProvider.new_union` de:
    - `new_for_value(Gio.File)`: GTK publica `text/uri-list` y `application/vnd.portal.filetransfer`.
    - `new_for_bytes("image/png", bytes)`.
  - Icono de arrastre: la propia miniatura.
  - Al terminar el arrastre: si se soltó → `dropped`; si se canceló, el temporizador sigue.
- [ ] **Step 4: Swipe y clic.**
  - `Gtk.GestureDrag` horizontal: desplaza el contenido con `dx` y baja la opacidad. Al soltar, `isDismissSwipe(dx, vx)` → `dismissed`; si no, vuelve a su sitio.
  - El swipe y el arrastre se distinguen así: **horizontal hacia la derecha → swipe**; cualquier otra dirección inicia el arrastre de archivo. Decidirlo con los primeros 8 px de movimiento.
  - Clic sin movimiento → `click`.
- [ ] **Step 5: Menú contextual** (clic derecho, `Gtk.PopoverMenu`) con "Abrir en Gradia", "Copiar", "Mostrar en carpeta" y "Borrar" → eventos `menu`.
- [ ] **Step 6: Verificación manual en la sesión real.**
  - `gjs -m src/helper/thumb.js "$HOME/Imágenes/Capturas de pantalla/<una>.png"`.
  - Arrastrar a Warp, ZapZap, Notion (snap), Teams y, en Edge, a Gmail, WhatsApp Web y Teams web.
  - Esperado: la imagen llega como archivo adjunto en todas.
  - Anotar en el commit las apps que fallen.
  - Comprobar en stdout cada evento (clic, swipe, menú, que se agote el tiempo, ruta inexistente → `error`).
- [ ] **Step 7:** Commit `feat: ventanita GTK de la miniatura con arrastre`.

### Task 4: Extensión: ventanita, Gradia y efectos

**Files:**
- Create: `extension.js`, `src/thumbclient.js`, `src/gradia.js`, `src/effects.js`, `stylesheet.css` (vacío si no se usa)

**Interfaces:**
- Consumes: `reduce`, `initialState` (Task 2); `pickMonitor`, `cornerPosition` (Task 1); `encode`, `decodeLines`, `copyName`, `staleFiles` (Task 2); el protocolo de Task 3.
- Produces:
  - `class ThumbClient { constructor(onEvent: (msg) => void); show(path: string); hide(); destroy() }`, en `src/thumbclient.js`.
  - `class GradiaSession { constructor(onDone: ({editId, copy, copyExists}|{editId, timeout: true}) => void); start(source: string, editId: number); cancel(); destroy() }`, en `src/gradia.js`.
  - `runEffect(effect, ctx)`, en `src/effects.js` (`clipboard`, `showInFolder`, `trash`).

- [ ] **Step 1: `ThumbClient`.**
  - `show` llama a `hide()` si hay otra ventanita y lanza `Meta.WaylandClient.new_subprocess(global.context, launcher, ["gjs", "-m", <ruta>/src/helper/thumb.js, path])`, con stdin/stdout en pipe (`Gio.SubprocessLauncher`).
  - Lee stdout con `decodeLines` y traduce:

    | Evento de la ventanita | Evento del flujo |
    |---|---|
    | `click`, `menu/open-gradia` | `openGradia` |
    | `menu/copy` | `copy` |
    | `menu/show-folder` | `showFolder` |
    | `menu/delete` | `delete` |
    | `dismissed`, `expired`, `dropped` | el mismo nombre |
    | salida del proceso sin evento terminal, o `error` | `helperExited` |

  - En `global.display` `window-created`, si `client.owns_window(win)`:
    - `win.hide_from_window_list()`, `win.make_above()`, `win.stick()`.
    - Al recibir `ready`, monitor = `pickMonitor(settings.monitor, global.backend.get_monitor_manager().get_monitor_for_connector(c), Main.layoutManager.primaryIndex, global.display.get_current_monitor())`.
    - `win.move_frame(true, x, y)` con `cornerPosition(Main.layoutManager.getWorkAreaForMonitor(i), {width, height})`.
    - Entrada: el actor de `win.get_compositor_private()` empieza con `translation_x = width + 16` y hace `ease` a 0 en 220 ms (`EASE_OUT_QUAD`).
  - **Guarda de foco:** al mapearse la ventanita, recordar `global.display.focus_window`. Si la ventanita recibe el foco en menos de 1000 ms desde que se mapeó, se lo devuelve a la anterior con `prev.activate(global.get_current_time())`. Cubre `grand-theft-focus`.
  - `hide()` envía `{"cmd":"quit"}` y fuerza `force_exit()` a los 500 ms.
  - `helperExited` solo se emite si el proceso que salió es el **actual** y no
    había mandado antes un evento terminal. Si no, al reemplazar una miniatura,
    la salida de la vieja dejaría el flujo en `idle` con la nueva en pantalla.
  - `destroy()` desconecta todo y mata el proceso.
- [ ] **Step 2: `GradiaSession`.**
  - `start`:
    - Crea `<PICTURES>/.screenshot-mactahoe/` (lo obtiene con `GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)`).
    - Borra `staleFiles(...)`.
    - Copia `source` como `copyName(basename, Date.now())`.
    - Lanza `flatpak run be.alexandervanhee.gradia --screenshot-file=<copia>`.
  - Vigila `window-created` hasta encontrar la primera ventana con `get_sandboxed_app_id() === "be.alexandervanhee.gradia"` (o `get_gtk_application_id()` igual) creada después de `start`. En su `unmanaged` → `onDone({editId, copy, copyExists: GLib.file_test(copy, EXISTS)})`.
  - Si en 20000 ms no aparece ninguna ventana → `onDone({editId, timeout: true})`.
  - `cancel()` deja de vigilar, pero no cierra Gradia.
- [ ] **Step 3: `src/effects.js`.**
  - `clipboard`: `St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, "image/png", bytes)`, con los bytes de `Gio.File.load_contents`.
  - `showInFolder`: D-Bus `org.freedesktop.FileManager1` `ShowItems([uri], "")`.
  - `trash`: `Gio.File.trash_async`.
  - Si un efecto falla: `console.error` y nada más; nunca relanzar.
- [ ] **Step 4: `extension.js`.**
  - `enable()`: estado = `initialState()`, crea `ThumbClient` y `GradiaSession`, y conecta `Main.screenshotUI` `screenshot-taken` → `dispatch({type:"screenshot", path: file.get_path()})`.
  - `dispatch` aplica `reduce` y ejecuta los efectos:
    - `show`/`hide` → `ThumbClient`.
    - `launchGradia` → `GradiaSession.start(source, editId)`.
    - `onDone` → `gradiaClosed` o `gradiaTimeout`.
    - El resto → `runEffect`.
  - `disable()`: desconecta, destruye todo y deja el estado en null.
- [ ] **Step 5: Verificación en una sesión anidada** (con las variables XDG aisladas; ver Global Constraints).
  - `Print` → área → aparece la miniatura abajo a la derecha del monitor principal.
  - No sale en Alt+Tab ni en el dock, y el foco sigue en la ventana anterior.
  - Clic → abre Gradia. Marcar algo y cerrar → vuelve la miniatura marcada, y `Ctrl+V` en un editor pega la marcada.
  - Captura nueva con Gradia abierto, luego cerrar Gradia → se queda la nueva.
  - Desactivar y activar la extensión sin errores en `journalctl --user -f`.
- [ ] **Step 6:** Commit `feat: extensión que coloca la miniatura y edita en Gradia`.

### Task 5: Preferencias, instalación y README

**Files:**
- Create: `schemas/org.gnome.shell.extensions.screenshot-mactahoe.gschema.xml`, `prefs.js`, `install.sh`, `uninstall.sh`, `README.md`

**Interfaces:**
- Produces:
  - Clave `monitor` (tipo `s`, por defecto `"primary"`), que ya lee `ThumbClient` (Task 4).
  - Archivo de estado `${XDG_CONFIG_HOME:-$HOME/.config}/screenshot-mactahoe/gradia-trash-previous`, con `true` o `false`.

- [ ] **Step 1:** Esquema con la clave `monitor`. En `prefs.js`, un `Adw.ComboRow` "Monitor de la miniatura" con estas opciones:
  - "Principal" (`primary`)
  - "Donde está el puntero" (`pointer`)
  - un elemento por cada `Gdk.Display.get_default().get_monitors()`, con etiqueta `"<descripción> (<conector>)"` y valor `get_connector()`

  Si el valor guardado es un conector que no está conectado, se muestra como "<conector> (desconectado)".
- [ ] **Step 2: `install.sh`.** Como el de media-mactahoe (compila el esquema y enlaza el repo), más:
  - Si no existe el archivo de estado, guarda ahí el valor actual de `trash-screenshots-on-close`, leído con `flatpak run --command=gsettings be.alexandervanhee.gradia get ...`.
  - Después lo fija en `false`.
  - Si Gradia no está instalado, avisa y sigue.
- [ ] **Step 3: Sembrar el estado real.** Antes de esta sesión la opción ya se había cambiado a mano (era `true`). Crear el archivo de estado con `true` antes de correr `install.sh` por primera vez.
- [ ] **Step 4: `uninstall.sh`.**
  - `gnome-extensions disable` (sin error si no estaba activa).
  - Quitar el enlace.
  - Si existe el archivo de estado, restaurar ese valor en Gradia y borrar el archivo.
  - Borrar `<PICTURES>/.screenshot-mactahoe/`.
- [ ] **Step 5:** README como los hermanos:
  - Qué hace, instalar y desinstalar.
  - Sección "Gradia" con el comando manual para revertir: `flatpak run --command=gsettings be.alexandervanhee.gradia set be.alexandervanhee.gradia trash-screenshots-on-close true`.
  - Desarrollo: `npm test` y `gjs -m src/helper/thumb.js <png>`.
- [ ] **Step 6: Verificación.**
  - `bash -n install.sh uninstall.sh` y `glib-compile-schemas --strict --dry-run schemas/`.
  - En la sesión anidada: cambiar el monitor en prefs y que la próxima miniatura salga ahí.
  - Instalar en la sesión real; Kevin cierra sesión y entra; prueba de aceptación completa de la Task 4, Step 5, más el arrastre a las apps de la Task 3, Step 6.
- [ ] **Step 7:** Commit `feat: preferencias de monitor, instalador y README`.
