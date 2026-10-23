# Screenshot MacTahoe

Extensión de GNOME Shell (49–50) que imita la miniatura flotante de macOS después de cada captura:

- **Captura como siempre** con `Print`. Abajo a la derecha aparece una miniatura durante 6 segundos; si pasas el mouse encima, se queda.
- **Arrástrala** a cualquier app (WhatsApp, Teams, Notion, el correo, Warp…) y se suelta como archivo de imagen.
- **Clic** → se abre en Gradia para marcarla. Al cerrar Gradia vuelve la miniatura con la versión marcada, que además queda en el portapapeles para pegarla con `Ctrl+V`.
- **Desliza a la derecha** para descartarla. La captura queda guardada igual.
- **Clic derecho**: Abrir en Gradia, Copiar, Mostrar en carpeta y Borrar (a la papelera).
- **Monitor:** el principal por defecto; se cambia en las preferencias de la extensión.

La versión marcada es temporal: vive en `~/Imágenes/.screenshot-mactahoe/` y se limpia sola al día. El original en `Capturas de pantalla` no se toca nunca.

## Instalar

```bash
./install.sh
# cerrar sesión y volver a entrar
gnome-extensions enable screenshot-mactahoe@kevin
```

## Desinstalar

```bash
./uninstall.sh
```

## Gradia

Para que la miniatura pueda volver con la versión marcada, `install.sh` apaga en Gradia la opción `trash-screenshots-on-close`. Con esa opción encendida, Gradia manda la captura a la papelera al cerrarse. El valor anterior queda en `~/.config/screenshot-mactahoe/gradia-trash-previous`, y `uninstall.sh` lo restaura.

Para revertirlo a mano:

```bash
flatpak run --command=gsettings be.alexandervanhee.gradia set be.alexandervanhee.gradia trash-screenshots-on-close true
```

Con la opción encendida, la miniatura sigue funcionando, pero al cerrar Gradia vuelve con la captura original.

## Desarrollo

```bash
npm test                                   # lógica pura (node --test)
gjs -m src/helper/thumb.js <captura.png>   # solo la ventanita (arrastre, clic, menú); eventos por stdout
tools/nested-test.sh 25                    # sesión de GNOME Shell sin pantalla y aislada, con la sonda de tools/
```
