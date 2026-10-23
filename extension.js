import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { initialState, reduce } from "./lib/flow.js";
import { runEffect } from "./src/effects.js";
import { GradiaSession } from "./src/gradia.js";
import { ThumbClient } from "./src/thumbclient.js";

export default class ScreenshotMacTahoe extends Extension {
  enable() {
    this._state = initialState();
    this._thumb = new ThumbClient(this.path, this.getSettings(), event => this._dispatch(event));
    this._gradia = new GradiaSession(result => this._dispatch(result.timeout
      ? { type: "gradiaTimeout", editId: result.editId }
      : { type: "gradiaClosed", ...result }));
    this._screenshotId = Main.screenshotUI.connect("screenshot-taken", (_ui, file) => {
      const path = file?.get_path();
      if (path)
        this._dispatch({ type: "screenshot", path });
    });
  }

  disable() {
    Main.screenshotUI.disconnect(this._screenshotId);
    this._screenshotId = 0;
    this._thumb?.destroy();
    this._thumb = null;
    this._gradia?.destroy();
    this._gradia = null;
    this._state = null;
  }

  _dispatch(event) {
    if (!this._state)
      return;
    const { state, effects } = reduce(this._state, event);
    this._state = state;
    for (const effect of effects) {
      switch (effect.type) {
      case "show":
        this._thumb.show(effect.path);
        break;
      case "hide":
        this._thumb.hide();
        break;
      case "launchGradia":
        this._gradia.start(effect.source, effect.editId);
        break;
      default:
        runEffect(effect);
      }
    }
  }
}
