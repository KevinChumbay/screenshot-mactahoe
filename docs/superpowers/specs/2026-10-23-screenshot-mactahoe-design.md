# Screenshot MacTahoe — diseño

Fecha: 2026-10-23
UUID previsto: `screenshot-mactahoe@kevin`
Repo: `~/Github/screenshot-mactahoe` (enlazado en `~/.local/share/gnome-shell/extensions/`)
Hermana de: `~/Github/media-mactahoe` y `~/Github/claude-quota-mactahoe` (misma estética, mismas convenciones)

## Por qué

Kevin quiere la miniatura flotante de macOS: al tomar una captura aparece en una
esquina unos segundos y se puede **arrastrar** a otra app o abrir para editar.

Casi siempre hace la captura para **pegarla en algún lado**: Warp, WhatsApp, Teams,
Notion, el correo. A veces antes la **marca en Gradia** para señalar algo. Hoy pegar
con `Ctrl+V` ya funciona (GNOME copia la captura al portapapeles). Lo que falta es
arrastrarla directamente y llegar a Gradia en un clic.

Éxito = después de `Print`, puede llevar la captura (original o marcada) al destino
arrastrando la miniatura, sin abrir el gestor de archivos.

## Objetivos

- Tras cada captura con la herramienta nativa de GNOME (`Print`, cualquier modo:
  área, ventana o pantalla), aparece una **miniatura flotante** en la esquina
  inferior derecha.
- **Arrastrar** la miniatura a otra app suelta la imagen como archivo (debe funcionar
  al menos en Warp, en apps web en el navegador como WhatsApp Web, Teams y Notion,
  y en un cliente de correo o Gmail web).
- **Clic** → abre la captura en Gradia (`flatpak run be.alexandervanhee.gradia --screenshot-file=<copia>`).
  La miniatura se oculta mientras Gradia está abierto.
- Al **cerrar Gradia**, la miniatura reaparece con la **versión marcada** (ver
  "Edición en Gradia").
- **Solo la última captura**: una captura nueva reemplaza la miniatura actual (no se apilan).
- **Monitor configurable** en las preferencias de la extensión. Por defecto, el
  monitor principal.

## Comportamiento propuesto (Kevin no lo objetó, ajustable)

- Visible ~6 s. Con el puntero encima no desaparece. Al salir el puntero, el
  contador vuelve a empezar.
- Deslizar hacia la derecha la descarta. Si nadie la toca, también se descarta sola,
  y en ambos casos la captura queda guardada.
- ~200 px de ancho, conserva la proporción de la imagen, esquinas redondeadas, sombra.
  Entra y sale con un deslizamiento corto desde el borde.
- Clic derecho: menú con "Abrir en Gradia", "Copiar", "Mostrar en carpeta" y "Borrar".

## No-objetivos

- Reemplazar la herramienta de captura de GNOME o cambiar el atajo `Print`.
- Editor propio: se edita en Gradia.
- Pila o historial de capturas.
- Grabaciones de pantalla (video).
- Publicar en extensions.gnome.org.

## Anti-objetivos

- **Perder una captura.** Ningún gesto de la miniatura (descartar, que expire,
  cerrar Gradia) borra el archivo, salvo "Borrar" en el menú. Ver la nota sobre
  `trash-screenshots-on-close`.
- Que la miniatura **robe el foco** o tape lo que Kevin está escribiendo: aparece
  sin activarse y no entra en Alt+Tab, el dock ni la vista de actividades.
- Romper GNOME Shell: sin excepciones sin capturar ni actores, señales, monitores
  de archivos o procesos huérfanos al desactivar o bloquear la pantalla.
- Consumo en reposo: sin sondeos periódicos ni proceso residente redibujando
  mientras no hay miniatura.
- Probar en una sesión aislada que escriba en la dconf real: exportar
  `XDG_CONFIG_HOME`, `XDG_DATA_HOME` y `XDG_RUNTIME_DIR` **antes** de `dbus-run-session`
  (lección de los proyectos hermanos).

## Restricciones

- Ubuntu 26.04, GNOME Shell **50**, **Wayland**; `shell-version: ["49", "50"]`.
- Capturas en `~/Imágenes/Capturas de pantalla` (carpeta por defecto de GNOME y
  `screenshot-folder` de Gradia).
- Gradia 1.14 (flatpak, permiso `xdg-pictures`). Ajustes actuales relevantes:
  `overwrite-screenshot true` (al guardar, sobrescribe el mismo archivo) y
  `trash-screenshots-on-close true`.
- Hay otra extensión que toca la UI de captura: `shotzy@SamkitJain660.github.io`
  (Lens/OCR/QR). No debe dejar de funcionar.
- Dos monitores.
- Convenciones de los hermanos: lógica pura en `lib/` probada con `node --test`;
  GJS ESM en `src/`; JS plano, 2 espacios, comillas dobles; textos en español;
  `install.sh` + README; esquema GSettings `org.gnome.shell.extensions.screenshot-mactahoe`.

## Arquitectura (decidido)

En Wayland, un actor de GNOME Shell no puede ser origen de un arrastre hacia apps
cliente. Por eso hay dos piezas:

1. **Extensión de GNOME Shell**: detecta la captura nueva y las guardadas por Gradia,
   decide el monitor y **coloca y mantiene la ventana de la miniatura** en la esquina
   (siempre encima, en todos los espacios de trabajo, sin aparecer en Alt+Tab, el
   dock ni la vista de actividades, sin tomar el foco). También expone las preferencias.
2. **Ventanita auxiliar GTK4** (GJS o Python, a elección del builder), sin bordes:
   muestra la miniatura y es el **origen del arrastre** (URI de archivo y, si ayuda
   a los destinos, la imagen). También maneja el clic, el deslizamiento y el menú.
   Solo vive mientras la miniatura está visible.

## Edición en Gradia (decidido)

Comprobado en el código de Gradia 1.14 (`ui/window.py`): en modo captura
(`--screenshot-file=<archivo>`) no hay "guardar" separado de "cerrar".
- Con `trash-screenshots-on-close=true`, al cerrar manda el archivo a la papelera sin guardar.
- Con esa opción en `false` (y `exit-method='none'`), al cerrar **sobrescribe** el
  archivo con lo marcado.

Modelo elegido:
- `trash-screenshots-on-close` queda en `false`. **Ya aplicado el 2026-10-23**
  (valor anterior: `true`).
  - `install.sh` lo vuelve a aplicar y guarda el valor previo.
  - `uninstall.sh` restaura ese valor.
  - El README documenta el comando manual para revertirlo:
    `flatpak run --command=gsettings be.alexandervanhee.gradia set be.alexandervanhee.gradia trash-screenshots-on-close true`.
  - La extensión no toca nunca la configuración de Gradia.
- El clic abre Gradia en modo captura sobre una **copia** propia de la extensión
  (por ejemplo en `~/.cache/screenshot-mactahoe/`), **nunca sobre el original**.
  El original en `Capturas de pantalla` no se modifica nunca.
- Cuando Gradia se cierra, la miniatura reaparece con lo que quedó en la copia: la
  versión marcada, o la misma imagen si no se marcó nada. No reaparece mientras
  Gradia sigue abierto.
- Si la opción vuelve a estar en `true` (porque se revirtió), la copia puede acabar
  en la papelera. En ese caso la miniatura reaparece con el original. Así nunca se
  pierde nada.
- Las copias en caché se limpian solas (las viejas o cuando se reemplazan); la
  política exacta queda a criterio del builder.

**La versión marcada es temporal (decidido por Kevin).** Solo vive en la caché para
arrastrarla o pegarla en ese momento. No se guarda en `Capturas de pantalla`.

## Portapapeles (decisión de Claude)

Cuando la miniatura reaparece con la versión marcada, esa versión se copia al
portapapeles, para que `Ctrl+V` pegue lo mismo que se arrastra. Hay que convivir con
`clipboard-history@alexsaveau.dev`: entra como una entrada más del historial.

## Arrastre: destinos de prueba (decisión de Claude)

Ofrecer todos los formatos útiles: `text/uri-list`, la transferencia de archivos del
portal (`application/vnd.portal.filetransfer`, para apps flatpak/snap) e `image/png`.
Pruebas de aceptación con lo instalado:
- Warp
- ZapZap (WhatsApp, flatpak)
- Notion de escritorio (snap)
- Teams
- Microsoft Edge (navegador por defecto) con Gmail web, WhatsApp Web y Teams web

## Foco

`grand-theft-focus@zalckos.github.com` está activa y le da el foco a las ventanas
nuevas. La extensión debe impedir que se lo dé a la miniatura.

## Queda a criterio del builder

- Cómo detectar la captura (señal de la UI de captura de GNOME, monitor de la
  carpeta, etc.) y cómo detectar el guardado y el cierre de Gradia.
- GJS o Python para la ventanita, y el canal entre las dos piezas (D-Bus, argumentos,
  etc.).
- Opciones de monitor en preferencias: además de "principal" (por defecto), las que
  tengan sentido, como "donde está el puntero" o uno concreto.
- Detalles de animación y estilo, en línea con MacTahoe (acento `#0088FF`,
  fuente Inter Variable, claro/oscuro del sistema).
